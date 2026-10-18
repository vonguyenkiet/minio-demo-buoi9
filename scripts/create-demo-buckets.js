'use strict';

/**
 * Script: create-demo-buckets.js
 * Mục đích: Tạo 2 bucket demo (buoi9-assets, buoi9-assets-archive) bằng MinIO SDK
 * Nơi chạy: Chạy bên trong container CLI nội bộ (minio-admin)
 * Tính chất: Idempotent, chỉ thao tác trên allowlist, không xóa, không ghi đè, không in secrets.
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

const ALLOWLIST_BUCKETS = (process.env.MINIO_DEMO_BUCKETS || 'buoi9-assets,buoi9-assets-archive')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);

async function main() {
  console.log('====================================================');
  console.log('[Script] Bắt đầu khởi tạo Demo Buckets (Allowlist only)');
  console.log(`[Script] Endpoint: ${endpoint}:${port}`);
  console.log(`[Script] Buckets: ${ALLOWLIST_BUCKETS.join(', ')}`);
  console.log('====================================================');

  let hasError = false;

  for (const bucket of ALLOWLIST_BUCKETS) {
    try {
      const exists = await client.bucketExists(bucket);
      if (exists) {
        console.log(`[Script] ℹ️  Bucket "${bucket}" ĐÃ TỒN TẠI (giữ nguyên, không ghi đè).`);
      } else {
        await client.makeBucket(bucket, region);
        console.log(`[Script] ✅ Bucket "${bucket}" ĐÃ TẠO MỚI THÀNH CÔNG (region: ${region}).`);
      }
    } catch (err) {
      console.error(`[Script] ❌ Lỗi khi xử lý bucket "${bucket}":`, err.message);
      hasError = true;
    }
  }

  if (hasError) {
    console.error('====================================================');
    console.error('[Script] Hoàn thành với một số lỗi.');
    process.exit(1);
  } else {
    console.log('====================================================');
    console.log('[Script] ✅ Hoàn tất khởi tạo demo buckets!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('[Script] Fatal error:', err.message);
  process.exit(1);
});
