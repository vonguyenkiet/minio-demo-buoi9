'use strict';

const storageService = require('../services/storage.service');
const fs = require('fs');
const path = require('path');

/**
 * Trích xuất cặp (bucket, key) từ request
 * Hỗ trợ linh hoạt:
 * 1. Base64url ID trong req.params.id (format: base64url(bucket:key))
 * 2. Query parameters (?bucket=...&key=...)
 * 3. Request body ({ bucket, key })
 */
function parseBucketAndKey(req) {
  let bucket = req.query.bucket || (req.body && req.body.bucket);
  let key = req.query.key || (req.body && req.body.key);

  if (req.params && req.params.id) {
    try {
      const decoded = Buffer.from(req.params.id, 'base64url').toString('utf8');
      const colonIdx = decoded.indexOf(':');
      if (colonIdx > 0) {
        bucket = decoded.slice(0, colonIdx);
        key = decoded.slice(colonIdx + 1);
      }
    } catch (e) {
      // Bỏ qua lỗi decode, giữ nguyên giá trị fallback
    }
  }

  return { bucket, key };
}

/**
 * Chuẩn hóa tên file an toàn cho object key
 */
function sanitizeFileName(name) {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base || `file-${Date.now()}`;
}

/**
 * GET /api/buckets – Lấy danh sách demo buckets và thống kê
 */
async function getBuckets(req, res) {
  try {
    const buckets = await storageService.getBucketsSummary();
    return res.json({
      success: true,
      data: buckets,
    });
  } catch (err) {
    console.error('[StorageController] getBuckets error:', err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Lỗi lấy danh sách buckets',
    });
  }
}

/**
 * GET /api/files – Liệt kê objects trong bucket
 */
async function listFiles(req, res) {
  try {
    const bucket = req.query.bucket || 'buoi9-assets';
    const prefix = req.query.prefix || '';
    const objects = await storageService.listObjects(bucket, prefix);

    return res.json({
      success: true,
      bucket,
      prefix,
      count: objects.length,
      data: objects,
    });
  } catch (err) {
    console.error('[StorageController] listFiles error:', err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Lỗi liệt kê objects',
    });
  }
}

/**
 * POST /api/files – Upload object lên MinIO
 * Multipart form-data:
 * - file: file upload (multer lưu vào file tạm)
 * - bucket: tên bucket (mặc định 'buoi9-assets')
 * - prefix: tiền tố nhóm (ví dụ 'avatars/', 'documents/', 'public/', 'private/')
 * - customKey: tên object key tự đặt (tùy chọn)
 */
async function uploadFile(req, res) {
  const tempPath = req.file ? req.file.path : null;
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Không tìm thấy file upload trong trường form "file".',
      });
    }

    const bucketName = req.body.bucket || 'buoi9-assets';
    let prefix = req.body.prefix || '';
    if (prefix && !prefix.endsWith('/')) {
      prefix += '/';
    }

    // Xác định object key
    let objectKey = req.body.customKey ? req.body.customKey.trim() : '';
    if (!objectKey) {
      const safeName = sanitizeFileName(req.file.originalname);
      objectKey = `${prefix}${Date.now()}-${safeName}`;
    } else {
      if (prefix && !objectKey.startsWith(prefix)) {
        objectKey = `${prefix}${objectKey}`;
      }
    }

    const result = await storageService.uploadObject({
      bucketName,
      key: objectKey,
      filePath: tempPath,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      size: req.file.size,
    });

    return res.status(201).json({
      success: true,
      message: 'Upload file lên MinIO thành công.',
      data: result,
    });
  } catch (err) {
    console.error('[StorageController] uploadFile error:', err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Lỗi upload file lên MinIO',
    });
  } finally {
    // BẮT BUỘC: Dọn dẹp file tạm trên ổ đĩa trong mọi tình huống (kể cả khi lỗi)
    if (tempPath && fs.existsSync(tempPath)) {
      try {
        await fs.promises.unlink(tempPath);
      } catch (cleanupErr) {
        console.error('[StorageController] ❌ Không thể xóa file tạm:', cleanupErr.message);
      }
    }
  }
}

/**
 * GET /api/files/:id/download hoặc GET /api/files/download?bucket=...&key=...
 * Tải file trực tiếp stream từ MinIO qua Backend
 */
async function downloadFile(req, res) {
  try {
    const { bucket, key } = parseBucketAndKey(req);
    if (!bucket || !key) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bucket hoặc key.',
      });
    }

    const { stream, stat, fileName } = await storageService.downloadObjectStream(bucket, key);

    res.setHeader('Content-Type', stat.metaData['content-type'] || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

    stream.on('error', (streamErr) => {
      console.error('[StorageController] Stream error during download:', streamErr.message);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Lỗi stream file từ MinIO' });
      }
    });

    stream.pipe(res);
  } catch (err) {
    console.error('[StorageController] downloadFile error:', err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Lỗi download file',
    });
  }
}

/**
 * GET /api/files/:id/url hoặc GET /api/files/url?bucket=...&key=...&expiry=300
 * Tạo Presigned URL cho object
 */
async function getPresignedUrl(req, res) {
  try {
    const { bucket, key } = parseBucketAndKey(req);
    if (!bucket || !key) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bucket hoặc key.',
      });
    }

    const expiry = parseInt(req.query.expiry, 10) || 300;
    const result = await storageService.generatePresignedUrl(bucket, key, expiry);

    return res.json({
      success: true,
      message: `Presigned URL có hiệu lực trong ${result.expiresIn} giây`,
      data: result,
    });
  } catch (err) {
    console.error('[StorageController] getPresignedUrl error:', err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Lỗi tạo Presigned URL',
    });
  }
}

/**
 * POST /api/files/:id/rename hoặc POST /api/files/rename
 * Body: { newKey }
 */
async function renameFile(req, res) {
  try {
    const { bucket, key } = parseBucketAndKey(req);
    const newKey = req.body.newKey;

    if (!bucket || !key || !newKey) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bucket, key cũ hoặc newKey.',
      });
    }

    const result = await storageService.renameObject(bucket, key, newKey);
    return res.json({
      success: true,
      message: 'Đổi tên object thành công.',
      data: result,
    });
  } catch (err) {
    console.error('[StorageController] renameFile error:', err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Lỗi đổi tên object',
    });
  }
}

/**
 * POST /api/files/:id/move hoặc POST /api/files/move
 * Body: { targetBucket, targetKey }
 */
async function moveFile(req, res) {
  try {
    const { bucket: sourceBucket, key: sourceKey } = parseBucketAndKey(req);
    const targetBucket = req.body.targetBucket;
    const targetKey = req.body.targetKey || sourceKey;

    if (!sourceBucket || !sourceKey || !targetBucket) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu sourceBucket, sourceKey hoặc targetBucket.',
      });
    }

    const result = await storageService.moveObject(sourceBucket, targetBucket, sourceKey, targetKey);
    return res.json({
      success: true,
      message: 'Di chuyển object sang bucket mới thành công.',
      data: result,
    });
  } catch (err) {
    console.error('[StorageController] moveFile error:', err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Lỗi di chuyển object',
    });
  }
}

/**
 * DELETE /api/files/:id hoặc DELETE /api/files?bucket=...&key=...
 */
async function deleteFile(req, res) {
  try {
    const { bucket, key } = parseBucketAndKey(req);
    if (!bucket || !key) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bucket hoặc key.',
      });
    }

    const result = await storageService.deleteObject(bucket, key);
    return res.json({
      success: true,
      message: 'Xóa object thành công.',
      data: result,
    });
  } catch (err) {
    console.error('[StorageController] deleteFile error:', err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Lỗi xóa object',
    });
  }
}

module.exports = {
  getBuckets,
  listFiles,
  uploadFile,
  downloadFile,
  getPresignedUrl,
  renameFile,
  moveFile,
  deleteFile,
};
