'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const controller = require('../controllers/storage.controller');

const router = express.Router();

// Tạo thư mục tạm trên ổ đĩa
const tempUploadDir = path.join(os.tmpdir(), 'buoi9-uploads');
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}

// Cấu hình multer lưu vào file tạm với tên ngẫu nhiên an toàn (chống path traversal)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempUploadDir);
  },
  filename: (req, file, cb) => {
    const randomSuffix = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `upload-${Date.now()}-${randomSuffix}${ext}`);
  },
});

const uploadLimitBytes = parseInt(process.env.UPLOAD_TEST_LIMIT_BYTES, 10) || 5 * 1024 * 1024; // 5 MiB

const upload = multer({
  storage,
  limits: {
    fileSize: uploadLimitBytes,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'application/pdf',
      'application/json',
      'text/plain',
      'text/markdown',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error(
        `Loại file "${file.mimetype}" không được hỗ trợ. Các định dạng cho phép: ảnh (JPG, PNG, GIF, WebP, SVG), PDF, JSON, TXT, DOCX.`
      );
      err.statusCode = 400;
      cb(err, false);
    }
  },
});

// ============================================================
// Bucket Routes
// ============================================================
router.get('/buckets', controller.getBuckets);

// ============================================================
// File Operations Routes
// ============================================================
// Liệt kê objects
router.get('/files', controller.listFiles);

// Upload file
router.post('/files', upload.single('file'), controller.uploadFile);

// Thao tác với query parameters (?bucket=...&key=...)
router.get('/files/download', controller.downloadFile);
router.get('/files/url', controller.getPresignedUrl);
router.post('/files/rename', controller.renameFile);
router.post('/files/move', controller.moveFile);
router.delete('/files', controller.deleteFile);

// Thao tác qua :id (base64url của bucket:key)
router.get('/files/:id/download', controller.downloadFile);
router.get('/files/:id/url', controller.getPresignedUrl);
router.post('/files/:id/rename', controller.renameFile);
router.post('/files/:id/move', controller.moveFile);
router.delete('/files/:id', controller.deleteFile);

module.exports = router;
