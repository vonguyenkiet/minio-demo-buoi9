'use strict';

/**
 * Script: set-demo-policy.js
 * Mục đích:
 * 1. Thiết lập chính sách truy cập Public chỉ dành riêng cho prefix public/* trên bucket buoi9-assets.
 *    Các prefix khác (private/*, avatars/*, documents/*) mặc định giữ nguyên PRIVATE.
 *    TUYỆT ĐỐI KHÔNG cấp quyền ListBucket, PutObject, DeleteObject cho anonymous.
 * 2. Thiết lập chính sách Public GetObject cho product-images/* (kế thừa Buổi 8).
 * 3. Đảm bảo bucket buoi9-assets-archive là PRIVATE hoàn toàn (không có anonymous policy).
 * 4. BẮT BUỘC: Đọc lại cấu hình đã lưu (getBucketPolicy) để xác minh policy thực tế trên MinIO.
 * 5. BẮT BUỘC: Thoát mã lỗi khác 0 (exit 1) nếu bất kỳ bucket bắt buộc nào thiếu hoặc policy thất bại.
 */

const Minio = require('minio');

const endpoint = process.env.MINIO_ENDPOINT || 'minio';
const port = parseInt(process.env.MINIO_PORT, 10) || 9000;
const useSSL = process.env.MINIO_USE_SSL === 'true';
const rootUser = process.env.MINIO_ROOT_USER;
const rootPassword = process.env.MINIO_ROOT_PASSWORD;
const region = process.env.MINIO_REGION || 'us-east-1';

if (!rootUser || !rootPassword) {
  console.error('[CLI ERROR] Thiếu MINIO_ROOT_USER hoặc MINIO_ROOT_PASSWORD trong biến môi trường.');
  process.exit(1);
}

const client = new Minio.Client({
  endPoint: endpoint,
  port,
  useSSL,
  accessKey: rootUser,
  secretKey: rootPassword,
  region,
});

async function setAndVerifyPolicy() {
  console.log('====================================================');
  console.log('[Script] Bắt đầu thiết lập và xác minh Bucket Policies');
  console.log(`[Script] Endpoint: ${endpoint}:${port}`);
  console.log('====================================================');

  const requiredBuckets = [
    {
      name: process.env.MINIO_BUCKET || 'product-images',
      type: 'public-all',
      description: 'Anonymous GetObject toàn bộ ảnh sản phẩm',
      policy: {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AllowPublicReadProductImages',
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${process.env.MINIO_BUCKET || 'product-images'}/*`],
          },
        ],
      },
    },
    {
      name: 'buoi9-assets',
      type: 'public-prefix-only',
      description: 'Anonymous GetObject CHỈ CHO prefix public/*',
      policy: {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AllowPublicReadOnPublicPrefixOnly',
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: ['arn:aws:s3:::buoi9-assets/public/*'],
          },
        ],
      },
    },
    {
      name: 'buoi9-assets-archive',
      type: 'private',
      description: 'Hoàn toàn PRIVATE (không có anonymous policy)',
      policy: null,
    },
  ];

  for (const item of requiredBuckets) {
    const bucketName = item.name;
    console.log(`\n[Checking] Kiểm tra bucket bắt buộc: "${bucketName}"...`);

    // 1. Bucket bắt buộc phải tồn tại
    const exists = await client.bucketExists(bucketName);
    if (!exists) {
      throw new Error(`[FATAL] Bucket bắt buộc "${bucketName}" không tồn tại trên MinIO. Hãy chạy create-demo-buckets trước!`);
    }
    console.log(`   -> Bucket "${bucketName}" tồn tại.`);

    // 2. Áp dụng policy theo từng loại
    if (item.type === 'private') {
      try {
        await client.setBucketPolicy(bucketName, '');
      } catch (err) {
        // Một số phiên bản MinIO ném NoSuchBucketPolicy khi xóa policy rỗng -> coi như đã private
        if (!err.message.includes('NoSuchBucketPolicy') && !err.message.includes('not found')) {
          console.warn(`   -> Ghi chú xóa policy: ${err.message}`);
        }
      }

      // Xác minh lại: đọc policy phải báo không có hoặc rỗng
      let verifiedPrivate = false;
      try {
        const currentPolicy = await client.getBucketPolicy(bucketName);
        if (!currentPolicy || currentPolicy.trim() === '' || currentPolicy.trim() === '{}') {
          verifiedPrivate = true;
        } else {
          const parsed = JSON.parse(currentPolicy);
          if (!parsed.Statement || parsed.Statement.length === 0) {
            verifiedPrivate = true;
          }
        }
      } catch (err) {
        // NoSuchBucketPolicy là trạng thái mong muốn cho private bucket
        verifiedPrivate = true;
      }

      if (!verifiedPrivate) {
        throw new Error(`[FATAL] Bucket "${bucketName}" đáng lẽ phải PRIVATE nhưng vẫn còn policy anonymous!`);
      }
      console.log(`   -> ✅ Xác minh: Bucket "${bucketName}" là PRIVATE hoàn toàn.`);
    } else {
      // Bucket có policy public
      const policyString = JSON.stringify(item.policy);
      await client.setBucketPolicy(bucketName, policyString);
      console.log(`   -> Đã gửi lệnh setBucketPolicy cho "${bucketName}".`);

      // 3. Đọc lại và xác minh policy thực tế trên MinIO
      const retrievedPolicy = await client.getBucketPolicy(bucketName);
      if (!retrievedPolicy) {
        throw new Error(`[FATAL] Xác minh thất bại: Không thể đọc lại policy của bucket "${bucketName}"!`);
      }

      const parsedRetrieved = JSON.parse(retrievedPolicy);
      const hasStatements = Array.isArray(parsedRetrieved.Statement) && parsedRetrieved.Statement.length > 0;
      if (!hasStatements) {
        throw new Error(`[FATAL] Xác minh thất bại: Policy của bucket "${bucketName}" không chứa Statement hợp lệ!`);
      }

      // Kiểm tra resource có khớp với cấu hình không
      const expectedResource = item.policy.Statement[0].Resource[0];
      const actualResource = parsedRetrieved.Statement[0].Resource;
      const resourceMatches = Array.isArray(actualResource)
        ? actualResource.includes(expectedResource)
        : actualResource === expectedResource;

      if (!resourceMatches) {
        throw new Error(
          `[FATAL] Xác minh thất bại: Resource trong policy thực tế (${JSON.stringify(actualResource)}) không khớp với kỳ vọng (${expectedResource})!`
        );
      }

      console.log(`   -> ✅ Xác minh thành công: ${item.description}`);
    }
  }

  console.log('\n====================================================');
  console.log('[Script] ✅ TẤT CẢ POLICY BẮT BUỘC ĐÃ ĐƯỢC THIẾT LẬP VÀ XÁC MINH THÀNH CÔNG!');
  console.log('====================================================');
}

setAndVerifyPolicy()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n====================================================');
    console.error('[Script] ❌ THẤT BẠI KHI THIẾT LẬP POLICY BẮT BUỘC:');
    console.error(`         ${err.message}`);
    console.error('====================================================');
    process.exit(1);
  });
