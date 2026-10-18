'use strict';

const Minio = require('minio');

// ============================================================
// Cấu hình kết nối MinIO
// 1. internalClient: backend thao tác với MinIO qua Docker internal network (service name: "minio:9000")
// 2. publicSigningClient: dùng để ký presigned URL trả về cho Browser qua domain NGINX (minio.shop.local)
// ============================================================

const internalEndpoint = process.env.MINIO_ENDPOINT || 'minio';
const internalPort = parseInt(process.env.MINIO_PORT, 10) || 9000;
const internalUseSSL = process.env.MINIO_USE_SSL === 'true';

// Backend runtime BẮT BUỘC dùng MinIO service account riêng biệt.
// Tuyệt đối KHÔNG có fallback sang root credentials (MINIO_ROOT_USER / MINIO_ROOT_PASSWORD).
const accessKey = process.env.MINIO_ACCESS_KEY;
const secretKey = process.env.MINIO_SECRET_KEY;

if (!accessKey || !secretKey) {
  throw new Error(
    '[MinIO Configuration Error] MINIO_ACCESS_KEY hoặc MINIO_SECRET_KEY chưa được cấu hình. ' +
      'Backend runtime yêu cầu credentials riêng biệt của MinIO service account với quyền tối thiểu và tuyệt đối không fallback sang root credentials.'
  );
}

// Cảnh báo nếu credentials bị cấu hình trùng với root credentials
if (
  process.env.MINIO_ROOT_USER &&
  process.env.MINIO_ROOT_PASSWORD &&
  accessKey === process.env.MINIO_ROOT_USER &&
  secretKey === process.env.MINIO_ROOT_PASSWORD
) {
  console.warn(
    '[MinIO Security Warning] CẢNH BÁO BẢO MẬT: Backend đang chạy với credentials trùng với MinIO Root. ' +
      'Vui lòng cung cấp service account riêng (MINIO_BACKEND_ACCESS_KEY) cho backend.'
  );
}

const region = process.env.MINIO_REGION || 'us-east-1';

const minioClient = new Minio.Client({
  endPoint: internalEndpoint,
  port: internalPort,
  useSSL: internalUseSSL,
  accessKey,
  secretKey,
  region,
});

// Public client cho Presigned URL
const publicHost = process.env.MINIO_PUBLIC_HOST || 'minio.shop.local';
const publicPort = parseInt(process.env.MINIO_PUBLIC_PORT, 10) || 80;
const publicUseSSL = process.env.MINIO_PUBLIC_USE_SSL === 'true';

const publicSigningClient = new Minio.Client({
  endPoint: publicHost,
  port: publicPort,
  useSSL: publicUseSSL,
  accessKey,
  secretKey,
  region,
});

const BUCKET_NAME = process.env.MINIO_BUCKET || 'product-images';
const DEMO_BUCKETS = (process.env.MINIO_DEMO_BUCKETS || 'buoi9-assets,buoi9-assets-archive')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);

/**
 * Kiểm tra kết nối và trạng thái các bucket từ backend runtime (quyền tối thiểu)
 * Backend chỉ đọc/kiểm tra sự tồn tại của bucket, KHÔNG tự ý makeBucket hay setBucketPolicy khi khởi động.
 */
async function checkStorageConnection() {
  try {
    const bucketsToCheck = [BUCKET_NAME, ...DEMO_BUCKETS];
    for (const bName of bucketsToCheck) {
      const exists = await minioClient.bucketExists(bName);
      if (!exists) {
        console.warn(`[MinIO] ⚠️ Bucket "${bName}" chưa tồn tại trên MinIO. Hãy chạy script quản trị để khởi tạo.`);
      } else {
        console.log(`[MinIO] ✅ Bucket "${bName}" sẵn sàng (truy cập hợp lệ qua Service Account).`);
      }
    }
    return true;
  } catch (err) {
    console.error('[MinIO] ❌ Kiểm tra kết nối MinIO thất bại:', err.message);
    throw err;
  }
}

/**
 * Khởi tạo MinIO buckets nếu chưa tồn tại
 * Dành riêng cho script bootstrap / công cụ quản trị (yêu cầu quyền admin).
 */
async function initializeBucket(customClient = null) {
  const client = customClient || minioClient;
  try {
    // 1. Bucket product-images kế thừa từ Buổi 8
    const exists = await client.bucketExists(BUCKET_NAME);
    if (!exists) {
      await client.makeBucket(BUCKET_NAME, region);
      console.log(`[MinIO Admin] ✅ Bucket "${BUCKET_NAME}" created successfully`);

      const policy = JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${BUCKET_NAME}/*`],
          },
        ],
      });
      await client.setBucketPolicy(BUCKET_NAME, policy);
      console.log(`[MinIO Admin] ✅ Bucket "${BUCKET_NAME}" policy set to public-read`);
    } else {
      console.log(`[MinIO Admin] ✅ Bucket "${BUCKET_NAME}" already exists`);
    }

    // 2. Demo buckets cho Buổi 9 (mặc định private)
    for (const bName of DEMO_BUCKETS) {
      const bExists = await client.bucketExists(bName);
      if (!bExists) {
        await client.makeBucket(bName, region);
        console.log(`[MinIO Admin] ✅ Demo bucket "${bName}" created successfully (private)`);
      } else {
        console.log(`[MinIO Admin] ✅ Demo bucket "${bName}" already exists`);
      }
    }
  } catch (err) {
    console.error('[MinIO Admin] ❌ Failed to initialize bucket:', err.message);
    throw err;
  }
}

/**
 * Upload file ảnh sản phẩm (kế thừa Buổi 8)
 */
async function uploadObject(objectName, data, size, contentType) {
  const metaData = { 'Content-Type': contentType };
  await minioClient.putObject(BUCKET_NAME, objectName, data, size, metaData);

  // Trả về URL qua NGINX minio.shop.local
  const publicHostName = process.env.MINIO_PUBLIC_HOST || 'minio.shop.local';
  const publicHostPort = parseInt(process.env.MINIO_PUBLIC_PORT, 10) || 80;
  const portSuffix = publicHostPort === 80 || publicHostPort === 443 ? '' : `:${publicHostPort}`;
  const scheme = publicUseSSL ? 'https' : 'http';
  return `${scheme}://${publicHostName}${portSuffix}/${BUCKET_NAME}/${objectName}`;
}

/**
 * Kiểm tra kết nối MinIO
 */
async function testConnection() {
  try {
    await minioClient.listBuckets();
    console.log('[MinIO] ✅ Connected to MinIO successfully');
    return true;
  } catch (err) {
    console.error('[MinIO] ❌ Connection failed:', err.message);
    return false;
  }
}

module.exports = {
  minioClient,
  publicSigningClient,
  BUCKET_NAME,
  DEMO_BUCKETS,
  checkStorageConnection,
  initializeBucket,
  uploadObject,
  testConnection,
};
