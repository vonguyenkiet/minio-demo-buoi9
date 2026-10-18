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
const accessKey = process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || 'buoi9admin';
const secretKey = process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || 'buoi9_minio_root_secret_2026';
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
 * Khởi tạo MinIO buckets nếu chưa tồn tại
 * Đảm bảo luồng ảnh sản phẩm của Buổi 8 và các bucket của Buổi 9 sẵn sàng
 */
async function initializeBucket() {
  try {
    // 1. Bucket product-images kế thừa từ Buổi 8
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME, region);
      console.log(`[MinIO] ✅ Bucket "${BUCKET_NAME}" created successfully`);

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
      await minioClient.setBucketPolicy(BUCKET_NAME, policy);
      console.log(`[MinIO] ✅ Bucket "${BUCKET_NAME}" policy set to public-read`);
    } else {
      console.log(`[MinIO] ✅ Bucket "${BUCKET_NAME}" already exists`);
    }

    // 2. Demo buckets cho Buổi 9 (mặc định private)
    for (const bName of DEMO_BUCKETS) {
      const bExists = await minioClient.bucketExists(bName);
      if (!bExists) {
        await minioClient.makeBucket(bName, region);
        console.log(`[MinIO] ✅ Demo bucket "${bName}" created successfully (private)`);
      } else {
        console.log(`[MinIO] ✅ Demo bucket "${bName}" already exists`);
      }
    }
  } catch (err) {
    console.error('[MinIO] ❌ Failed to initialize bucket:', err.message);
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
  initializeBucket,
  uploadObject,
  testConnection,
};
