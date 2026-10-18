'use strict';

/**
 * Script: set-demo-policy.js
 * Mục đích:
 * 1. Thiết lập chính sách truy cập Public chỉ dành riêng cho prefix public/* trên bucket buoi9-assets.
 *    Các prefix khác (private/*, avatars/*, documents/*) mặc định giữ nguyên PRIVATE.
 *    TUYỆT ĐỐI KHÔNG cấp quyền ListBucket, PutObject, DeleteObject cho anonymous.
 * 2. Thiết lập chính sách Public GetObject cho product-images/* (kế thừa Buổi 8).
 * 3. Đảm bảo bucket buoi9-assets-archive là PRIVATE hoàn toàn.
 */

const Minio = require('minio');

const endpoint = process.env.MINIO_ENDPOINT || 'minio';
const port = parseInt(process.env.MINIO_PORT, 10) || 9000;
const useSSL = process.env.MINIO_USE_SSL === 'true';
const rootUser = process.env.MINIO_ROOT_USER;
const rootPassword = process.env.MINIO_ROOT_PASSWORD;
const region = process.env.MINIO_REGION || 'us-east-1';

if (!rootUser || !rootPassword) {
  console.error('[CLI ERROR] Thiếu MINIO_ROOT_USER hoặc MINIO_ROOT_PASSWORD.');
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

async function main() {
  console.log('====================================================');
  console.log('[Script] Bắt đầu thiết lập Bucket Policies');
  console.log(`[Script] Endpoint: ${endpoint}:${port}`);
  console.log('====================================================');

  // 1. Bucket product-images: Public read cho toàn bộ object (kế thừa Buổi 8)
  const productBucket = process.env.MINIO_BUCKET || 'product-images';
  try {
    const exists = await client.bucketExists(productBucket);
    if (exists) {
      const productPolicy = {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AllowPublicReadProductImages',
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${productBucket}/*`],
          },
        ],
      };
      await client.setBucketPolicy(productBucket, JSON.stringify(productPolicy));
      console.log(`[Script] ✅ Bucket "${productBucket}": Anonymous GetObject cho toàn bộ ảnh sản phẩm.`);
    }
  } catch (err) {
    console.error(`[Script] ❌ Lỗi thiết lập policy cho "${productBucket}":`, err.message);
  }

  // 2. Bucket buoi9-assets: Public CHỈ CHO prefix public/*
  const demoBucket = 'buoi9-assets';
  try {
    const exists = await client.bucketExists(demoBucket);
    if (exists) {
      const publicPrefixPolicy = {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AllowPublicReadOnPublicPrefixOnly',
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${demoBucket}/public/*`],
          },
        ],
      };
      await client.setBucketPolicy(demoBucket, JSON.stringify(publicPrefixPolicy));
      console.log(`[Script] ✅ Bucket "${demoBucket}": Anonymous GetObject CHỈ CHO "public/*".`);
      console.log(`         -> anonymous GET "http://minio.shop.local/${demoBucket}/public/..."  : ĐƯỢC PHÉP`);
      console.log(`         -> anonymous GET "http://minio.shop.local/${demoBucket}/private/..." : BỊ TỪ CHỐI (403)`);
      console.log(`         -> anonymous LIST / PUT / DELETE                             : BỊ TỪ CHỐI (403)`);
    }
  } catch (err) {
    console.error(`[Script] ❌ Lỗi thiết lập policy cho "${demoBucket}":`, err.message);
  }

  // 3. Bucket buoi9-assets-archive: PRIVATE hoàn toàn (không có anonymous policy)
  const archiveBucket = 'buoi9-assets-archive';
  try {
    const exists = await client.bucketExists(archiveBucket);
    if (exists) {
      try {
        // Xóa policy anonymous nếu có
        await client.setBucketPolicy(archiveBucket, '');
      } catch (e) {
        // Bỏ qua nếu policy chưa tồn tại
      }
      console.log(`[Script] ✅ Bucket "${archiveBucket}": Hoàn toàn PRIVATE (không cấp quyền anonymous).`);
    }
  } catch (err) {
    console.error(`[Script] ❌ Lỗi kiểm tra bucket "${archiveBucket}":`, err.message);
  }

  console.log('====================================================');
  console.log('[Script] ✅ Hoàn thành thiết lập policies an toàn!');
}

main().catch((err) => {
  console.error('[Script] Fatal error:', err.message);
  process.exit(1);
});
