'use strict';

const express = require('express');
const multer = require('multer');
const router = express.Router();
const controller = require('../controllers/product.controller');

// Cấu hình multer: lưu file trong memory (buffer) để upload lên MinIO
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // Giới hạn 5MB
  },
});

// ============================================================
// Product Routes
// ============================================================

// GET /api/products – Lấy danh sách tất cả sản phẩm
router.get('/', controller.listProducts);

// GET /api/products/:id – Lấy chi tiết một sản phẩm
router.get('/:id', controller.getProduct);

// POST /api/products – Tạo sản phẩm mới
router.post('/', controller.createProduct);

// POST /api/products/:id/image – Upload ảnh sản phẩm lên MinIO
router.post('/:id/image', upload.single('image'), controller.uploadProductImage);

module.exports = router;
