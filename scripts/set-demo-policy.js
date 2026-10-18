'use strict';

/**
 * Script: set-demo-policy.js
 * Mục đích: Thiết lập chính sách truy cập Public chỉ dành riêng cho prefix public/*
 *           trên các bucket demo trong allowlist.
 *           Các prefix khác (private/*, avatars/*, documents/*) mặc định giữ nguyên PRIVATE.
 *           TUYỆT ĐỐI KHÔNG cấp quyền ListBucket, PutObject, DeleteObject cho anonymous.
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

const ALLOWLIST_BUCKETS = (process.env.MINIO_DEMO_BUCKETS || 'buoi9-assets,buoi9-assets-archive')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);

async function main() {
  console.log('====================================================');
  console.log('[Script] Bắt đầu thiết lập Bucket Policy cho prefix "public/*"');
  console.log(`[Script] Target buckets: ${ALLOWLIST_BUCKETS.join(', ')}`);
  console.log('====================================================');

  for (const bucket of ALLOWLIST_BUCKETS) {
    try {
      const exists = await client.bucketExists(bucket);
      if (!exists) {
        console.warn(`[Script] ⚠️  Bucket "${bucket}" chưa tồn tại. Hãy chạy create-demo-buckets trước.`);
        continue;
      }

      // Chính sách chỉ cho phép GetObject trong prefix public/*
      const policyDoc = {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AllowPublicReadOnPublicPrefixOnly',
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucket}/public/*`],
          },
        ],
      };

      await client.setBucketPolicy(bucket, JSON.stringify(policyDoc));
      console.log(`[Script] ✅ Bucket "${bucket}": Đã thiết lập policy Anonymous GetObject CHỈ CHO "public/*".`);
      console.log(`         -> anonymous GET "http://minio.shop.local/${bucket}/public/..." : ĐƯỢC PHÉP`);
      console.log(`         -> anonymous GET "http://minio.shop.local/${bucket}/private/..." : BỊ TỪ CHỐI (403)`);
      console.log(`         -> anonymous LIST / PUT / DELETE : BỊ TỪ CHỐI (403)`);
    } catch (err) {
      console.error(`[Script] ❌ Lỗi khi thiết lập policy cho bucket "${bucket}":`, err.message);
    }
  }

  console.log('====================================================');
  console.log('[Script] Hoàn thành thiết lập policy.');
}

main().catch((err) => {
  console.error('[Script] Fatal error:', err.message);
  process.exit(1);
});
