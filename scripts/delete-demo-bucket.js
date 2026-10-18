'use strict';

/**
 * Script: delete-demo-bucket.js
 * Mục đích: Thao tác SDK minh họa xóa bucket theo yêu cầu PDF / kiểm thử CLI.
 * Nguyên tắc an toàn:
 * 1. Chỉ thao tác trên allowlist: buoi9-assets hoặc buoi9-assets-archive.
 * 2. KIỂM TRA BUCKET PHẢI RỖNG HOÀN TOÀN TRƯỚC KHI XÓA. Nếu có object, TỪ CHỐI xóa!
 * 3. Bắt buộc có cờ --confirm để tránh vô tình xóa nhầm.
 * 4. Không tự động xóa dữ liệu để làm rỗng.
 */

const Minio = require('minio');

const endpoint = process.env.MINIO_ENDPOINT || 'minio';
const port = parseInt(process.env.MINIO_PORT, 10) || 9000;
const useSSL = process.env.MINIO_USE_SSL === 'true';
const rootUser = process.env.MINIO_ROOT_USER;
const rootPassword = process.env.MINIO_ROOT_PASSWORD;
const region = process.env.MINIO_REGION || 'us-east-1';

const args = process.argv.slice(2);
const targetBucket = args.find((a) => !a.startsWith('--'));
const isConfirmed = args.includes('--confirm');

const ALLOWLIST_BUCKETS = (process.env.MINIO_DEMO_BUCKETS || 'buoi9-assets,buoi9-assets-archive')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);

if (!targetBucket) {
  console.log('Cách dùng: node scripts/delete-demo-bucket.js <bucket-name> --confirm');
  console.log(`Các bucket được phép: ${ALLOWLIST_BUCKETS.join(', ')}`);
  process.exit(1);
}

if (!ALLOWLIST_BUCKETS.includes(targetBucket)) {
  console.error(`[CLI ERROR] Bucket "${targetBucket}" không nằm trong allowlist [${ALLOWLIST_BUCKETS.join(', ')}]. Từ chối thao tác!`);
  process.exit(1);
}

if (!isConfirmed) {
  console.error(`[CLI CẢNH BÁO] Thiếu cờ xác nhận --confirm. Hãy chạy lại lệnh:`);
  console.error(`  node scripts/delete-demo-bucket.js ${targetBucket} --confirm`);
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
  console.log(`[Script] Yêu cầu xóa bucket: "${targetBucket}"`);
  console.log('====================================================');

  // 1. Kiểm tra bucket tồn tại
  const exists = await client.bucketExists(targetBucket);
  if (!exists) {
    console.error(`[Script] ❌ Bucket "${targetBucket}" không tồn tại.`);
    process.exit(1);
  }

  // 2. Kiểm tra bucket rỗng
  let objectCount = 0;
  const stream = client.listObjectsV2(targetBucket, '', true);

  await new Promise((resolve, reject) => {
    stream.on('data', () => objectCount++);
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve());
  });

  if (objectCount > 0) {
    console.error(`[Script] ❌ TỪ CHỐI XÓA: Bucket "${targetBucket}" đang chứa ${objectCount} object(s)!`);
    console.error(`         Nguyên tắc an toàn: Không tự động xóa object. Hãy xóa toàn bộ object trước`);
    console.error(`         thông qua MinIO Console hoặc Backend UI rồi chạy lại lệnh này.`);
    process.exit(1);
  }

  // 3. Thực hiện xóa bucket rỗng
  try {
    await client.removeBucket(targetBucket);
    console.log(`[Script] ✅ Bucket "${targetBucket}" đã được XÓA THÀNH CÔNG.`);
    console.log(`[Script] Lưu ý: Để tiếp tục demo ứng dụng, bạn có thể tạo lại bucket qua MinIO Console hoặc chạy create-demo-buckets.js.`);
    process.exit(0);
  } catch (err) {
    console.error(`[Script] ❌ Xóa bucket thất bại:`, err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[Script] Fatal error:', err.message);
  process.exit(1);
});
