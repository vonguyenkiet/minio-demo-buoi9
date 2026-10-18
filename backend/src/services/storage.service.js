'use strict';

const { minioClient, publicSigningClient, DEMO_BUCKETS, BUCKET_NAME } = require('../config/minio');
const path = require('path');

// Allowlist tất cả các bucket được phép thao tác
const ALLOWED_BUCKETS = [...new Set([...DEMO_BUCKETS, BUCKET_NAME])];

/**
 * Validate bucket nằm trong allowlist
 */
function validateBucket(bucket) {
  if (!bucket || typeof bucket !== 'string') {
    const err = new Error('Tên bucket không hợp lệ hoặc bị thiếu.');
    err.statusCode = 400;
    throw err;
  }
  const normalized = bucket.trim();
  if (!ALLOWED_BUCKETS.includes(normalized)) {
    const err = new Error(`Bucket "${normalized}" không nằm trong danh sách cho phép [${ALLOWED_BUCKETS.join(', ')}].`);
    err.statusCode = 403;
    throw err;
  }
  return normalized;
}

/**
 * Validate và chuẩn hóa object key
 */
function validateKey(key) {
  if (!key || typeof key !== 'string') {
    const err = new Error('Object key không hợp lệ hoặc bị thiếu.');
    err.statusCode = 400;
    throw err;
  }
  let normalized = key.trim();
  // Loại bỏ dấu gạch chéo đầu nếu có
  if (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  }
  if (!normalized || normalized.includes('..') || /[\x00-\x1F\x7F]/.test(normalized)) {
    const err = new Error(`Object key "${key}" không hợp lệ (chứa ký tự điều khiển hoặc traversal).`);
    err.statusCode = 400;
    throw err;
  }
  return normalized;
}

/**
 * Trích xuất prefix (thư mục ảo) từ key
 */
function extractPrefix(key) {
  const lastSlash = key.lastIndexOf('/');
  if (lastSlash === -1) return '';
  return key.slice(0, lastSlash + 1);
}

/**
 * Lấy danh sách demo buckets và thống kê sơ bộ
 */
async function getBucketsSummary() {
  const summaries = [];
  for (const bName of DEMO_BUCKETS) {
    try {
      const exists = await minioClient.bucketExists(bName);
      if (!exists) {
        summaries.push({ bucket: bName, exists: false, objectCount: 0, totalSize: 0 });
        continue;
      }

      // Đếm số lượng object
      let count = 0;
      let totalBytes = 0;
      const stream = minioClient.listObjectsV2(bName, '', true);

      await new Promise((resolve, reject) => {
        stream.on('data', (obj) => {
          count++;
          totalBytes += obj.size || 0;
        });
        stream.on('error', (err) => reject(err));
        stream.on('end', () => resolve());
      });

      summaries.push({
        bucket: bName,
        exists: true,
        objectCount: count,
        totalSize: totalBytes,
        isDemoBucket: true,
      });
    } catch (err) {
      console.error(`[StorageService] Error summarizing bucket ${bName}:`, err.message);
      summaries.push({ bucket: bName, exists: false, error: err.message });
    }
  }
  return summaries;
}

/**
 * Liệt kê danh sách objects trong bucket
 */
async function listObjects(bucketName, prefix = '') {
  const bucket = validateBucket(bucketName);
  const exists = await minioClient.bucketExists(bucket);
  if (!exists) {
    const err = new Error(`Bucket "${bucket}" không tồn tại trên MinIO.`);
    err.statusCode = 404;
    throw err;
  }

  const objects = [];
  const stream = minioClient.listObjectsV2(bucket, prefix, true);

  await new Promise((resolve, reject) => {
    stream.on('data', (item) => {
      // Bỏ qua thư mục rỗng placeholder nếu có
      if (item.name && !item.name.endsWith('/')) {
        const isPublic = item.name.startsWith('public/');
        const safeId = Buffer.from(`${bucket}:${item.name}`).toString('base64url');
        objects.push({
          id: safeId,
          bucket,
          key: item.name,
          name: path.basename(item.name),
          prefix: extractPrefix(item.name),
          size: item.size,
          lastModified: item.lastModified,
          etag: (item.etag || '').replace(/"/g, ''),
          isPublic,
        });
      }
    });
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve());
  });

  // Sắp xếp object mới nhất lên đầu
  objects.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
  return objects;
}

/**
 * Upload object lên MinIO bằng fPutObject từ file tạm trên ổ đĩa
 */
async function uploadObject({ bucketName, key, filePath, mimeType, originalName, size }) {
  const bucket = validateBucket(bucketName);
  const validKey = validateKey(key);

  const exists = await minioClient.bucketExists(bucket);
  if (!exists) {
    const err = new Error(`Bucket "${bucket}" không tồn tại. Hãy tạo bucket trước khi upload.`);
    err.statusCode = 404;
    throw err;
  }

  let effectiveMime = mimeType || 'application/octet-stream';
  if ((effectiveMime.startsWith('text/') || validKey.endsWith('.txt') || validKey.endsWith('.json') || validKey.endsWith('.md')) && !effectiveMime.toLowerCase().includes('charset')) {
    effectiveMime += '; charset=utf-8';
  }

  const metaData = {
    'Content-Type': effectiveMime,
    'x-amz-meta-original-name': encodeURIComponent(originalName || path.basename(validKey)),
    'x-amz-meta-uploaded-at': new Date().toISOString(),
  };

  // Dùng fPutObject để đọc trực tiếp file tạm theo stream, không load vào RAM
  await minioClient.fPutObject(bucket, validKey, filePath, metaData);

  const isPublic = validKey.startsWith('public/');
  const safeId = Buffer.from(`${bucket}:${validKey}`).toString('base64url');

  // Nếu là object public, tạo public URL trực tiếp qua NGINX minio.shop.local
  const publicHost = process.env.MINIO_PUBLIC_HOST || 'minio.shop.local';
  const publicPort = parseInt(process.env.MINIO_PUBLIC_PORT, 10) || 80;
  const portSuffix = publicPort === 80 || publicPort === 443 ? '' : `:${publicPort}`;
  const directPublicUrl = `http://${publicHost}${portSuffix}/${bucket}/${validKey}`;

  return {
    id: safeId,
    bucket,
    key: validKey,
    size,
    mimeType,
    isPublic,
    directPublicUrl: isPublic ? directPublicUrl : null,
  };
}

/**
 * Download object stream
 */
async function downloadObjectStream(bucketName, key) {
  const bucket = validateBucket(bucketName);
  const validKey = validateKey(key);

  let stat;
  try {
    stat = await minioClient.statObject(bucket, validKey);
  } catch (err) {
    if (err.code === 'NotFound' || err.statusCode === 404) {
      const notFoundErr = new Error(`Object "${validKey}" không tồn tại trong bucket "${bucket}".`);
      notFoundErr.statusCode = 404;
      throw notFoundErr;
    }
    throw err;
  }

  const stream = await minioClient.getObject(bucket, validKey);
  return { stream, stat, fileName: path.basename(validKey) };
}

/**
 * Tạo Presigned URL cho object
 */
async function generatePresignedUrl(bucketName, key, expirySeconds = 300) {
  const bucket = validateBucket(bucketName);
  const validKey = validateKey(key);

  // Xác minh object tồn tại trước khi tạo Presigned URL
  try {
    await minioClient.statObject(bucket, validKey);
  } catch (err) {
    if (err.code === 'NotFound' || err.statusCode === 404) {
      const notFoundErr = new Error(`Object "${validKey}" không tồn tại trong bucket "${bucket}".`);
      notFoundErr.statusCode = 404;
      throw notFoundErr;
    }
    throw err;
  }

  const maxAllowedTtl = Math.max(
    parseInt(process.env.PRESIGNED_URL_MAX_TTL_SECONDS, 10) || 3600,
    10
  );
  const ttl = parseInt(expirySeconds, 10);
  if (isNaN(ttl) || ttl < 10 || ttl > maxAllowedTtl) {
    const err = new Error(
      `Thời gian hiệu lực Presigned URL không hợp lệ (${expirySeconds}s). Phải từ 10 đến ${maxAllowedTtl} giây.`
    );
    err.statusCode = 400;
    throw err;
  }

  // Dùng publicSigningClient ký với domain minio.shop.local
  const presignedUrl = await publicSigningClient.presignedGetObject(bucket, validKey, ttl);

  return {
    bucket,
    key: validKey,
    presignedUrl,
    expiresIn: ttl,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  };
}

/**
 * Đổi tên (Rename) object trong cùng bucket
 * Quy trình an toàn:
 * 1. Check nguồn tồn tại
 * 2. Copy sang đích
 * 3. Verify đích tồn tại
 * 4. Xóa nguồn
 */
async function renameObject(bucketName, oldKey, newKey) {
  const bucket = validateBucket(bucketName);
  const validOldKey = validateKey(oldKey);
  const validNewKey = validateKey(newKey);

  if (validOldKey === validNewKey) {
    const err = new Error('Tên mới trùng với tên cũ.');
    err.statusCode = 400;
    throw err;
  }

  // 1. Kiểm tra nguồn
  let sourceStat;
  try {
    sourceStat = await minioClient.statObject(bucket, validOldKey);
  } catch (err) {
    const notFoundErr = new Error(`Object nguồn "${validOldKey}" không tồn tại trong bucket "${bucket}".`);
    notFoundErr.statusCode = 404;
    throw notFoundErr;
  }

  // 2. Copy sang newKey
  const copySource = `/${bucket}/${encodeURI(validOldKey)}`;
  try {
    await minioClient.copyObject(bucket, validNewKey, copySource);
  } catch (err) {
    const copyErr = new Error(`Sao chép sang key mới thất bại: ${err.message}`);
    copyErr.statusCode = 500;
    throw copyErr;
  }

  // 3. Verify đích tồn tại
  let targetStat;
  try {
    targetStat = await minioClient.statObject(bucket, validNewKey);
    if (targetStat.size !== sourceStat.size) {
      throw new Error('Dung lượng object đích không khớp với object nguồn.');
    }
  } catch (err) {
    // Copy hoặc verify thất bại -> KHÔNG xóa nguồn
    const verifyErr = new Error(`Xác minh object sau copy thất bại (${err.message}). Object nguồn được giữ nguyên.`);
    verifyErr.statusCode = 500;
    throw verifyErr;
  }

  // 4. Xóa nguồn sau khi đã xác minh đích thành công
  try {
    await minioClient.removeObject(bucket, validOldKey);
  } catch (err) {
    console.error(`[StorageService] ⚠️ Đã copy sang "${validNewKey}" nhưng xóa nguồn "${validOldKey}" thất bại:`, err.message);
    return {
      success: true,
      warning: 'Object đã được đổi tên thành công nhưng nguồn chưa được xóa tự động.',
      bucket,
      oldKey: validOldKey,
      newKey: validNewKey,
    };
  }

  return {
    success: true,
    bucket,
    oldKey: validOldKey,
    newKey: validNewKey,
    id: Buffer.from(`${bucket}:${validNewKey}`).toString('base64url'),
  };
}

/**
 * Di chuyển (Move) object giữa 2 bucket demo
 * Quy trình an toàn:
 * 1. Validate cả 2 bucket trong allowlist
 * 2. Check nguồn tồn tại
 * 3. Copy sang đích
 * 4. Verify đích tồn tại
 * 5. Xóa nguồn
 */
async function moveObject(sourceBucketName, targetBucketName, sourceKey, targetKey) {
  const srcBucket = validateBucket(sourceBucketName);
  const dstBucket = validateBucket(targetBucketName);
  const srcKey = validateKey(sourceKey);
  const dstKey = validateKey(targetKey || sourceKey);

  if (srcBucket === dstBucket && srcKey === dstKey) {
    const err = new Error('Bucket và Key đích trùng hoàn toàn với nguồn.');
    err.statusCode = 400;
    throw err;
  }

  // 1. Kiểm tra nguồn
  let sourceStat;
  try {
    sourceStat = await minioClient.statObject(srcBucket, srcKey);
  } catch (err) {
    const notFoundErr = new Error(`Object nguồn "${srcKey}" không tồn tại trong bucket "${srcBucket}".`);
    notFoundErr.statusCode = 404;
    throw notFoundErr;
  }

  // 2. Copy sang dstBucket
  const copySource = `/${srcBucket}/${encodeURI(srcKey)}`;
  try {
    await minioClient.copyObject(dstBucket, dstKey, copySource);
  } catch (err) {
    const copyErr = new Error(`Di chuyển sang bucket đích thất bại: ${err.message}`);
    copyErr.statusCode = 500;
    throw copyErr;
  }

  // 3. Verify đích
  try {
    const dstStat = await minioClient.statObject(dstBucket, dstKey);
    if (dstStat.size !== sourceStat.size) {
      throw new Error('Dung lượng object đích không khớp.');
    }
  } catch (err) {
    const verifyErr = new Error(`Xác minh object đích thất bại: ${err.message}. Object nguồn được giữ nguyên.`);
    verifyErr.statusCode = 500;
    throw verifyErr;
  }

  // 4. Xóa nguồn
  try {
    await minioClient.removeObject(srcBucket, srcKey);
  } catch (err) {
    console.error(`[StorageService] ⚠️ Đã copy sang "${dstBucket}/${dstKey}" nhưng xóa nguồn "${srcBucket}/${srcKey}" thất bại:`, err.message);
    return {
      success: true,
      warning: 'Object đã được copy sang bucket đích nhưng nguồn chưa được xóa tự động.',
      sourceBucket: srcBucket,
      targetBucket: dstBucket,
      sourceKey: srcKey,
      targetKey: dstKey,
    };
  }

  return {
    success: true,
    sourceBucket: srcBucket,
    targetBucket: dstBucket,
    sourceKey: srcKey,
    targetKey: dstKey,
    id: Buffer.from(`${dstBucket}:${dstKey}`).toString('base64url'),
  };
}

/**
 * Xóa một object
 */
async function deleteObject(bucketName, key) {
  const bucket = validateBucket(bucketName);
  const validKey = validateKey(key);

  // Kiểm tra object tồn tại trước khi xóa
  try {
    await minioClient.statObject(bucket, validKey);
  } catch (err) {
    const notFoundErr = new Error(`Object "${validKey}" không tồn tại trong bucket "${bucket}".`);
    notFoundErr.statusCode = 404;
    throw notFoundErr;
  }

  await minioClient.removeObject(bucket, validKey);
  return {
    success: true,
    message: `Đã xóa object "${validKey}" khỏi bucket "${bucket}".`,
    bucket,
    key: validKey,
  };
}

module.exports = {
  ALLOWED_BUCKETS,
  validateBucket,
  validateKey,
  getBucketsSummary,
  listObjects,
  uploadObject,
  downloadObjectStream,
  generatePresignedUrl,
  renameObject,
  moveObject,
  deleteObject,
};
