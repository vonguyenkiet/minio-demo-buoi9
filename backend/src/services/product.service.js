'use strict';

const { query } = require('../config/database');
const { uploadObject } = require('../config/minio');
const path = require('path');

// ============================================================
// Product Service – Business logic layer
// ============================================================

/**
 * Lấy danh sách tất cả sản phẩm
 * @returns {Promise<Array>}
 */
async function getAllProducts() {
  const result = await query(
    'SELECT * FROM products ORDER BY created_at DESC'
  );
  return result.rows;
}

/**
 * Lấy chi tiết một sản phẩm theo ID
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
async function getProductById(id) {
  const result = await query(
    'SELECT * FROM products WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Tạo sản phẩm mới
 * @param {Object} data - { name, description, price, category, stock }
 * @returns {Promise<Object>}
 */
async function createProduct(data) {
  const { name, description, price, category, stock } = data;
  const result = await query(
    `INSERT INTO products (name, description, price, category, stock)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name, description || null, price, category, stock || 0]
  );
  return result.rows[0];
}

/**
 * Upload ảnh sản phẩm lên MinIO và cập nhật image_url trong DB
 * @param {number} productId
 * @param {Object} file - Multer file object
 * @returns {Promise<Object>} - { product_id, image_url }
 */
async function uploadProductImage(productId, file) {
  // Kiểm tra product tồn tại
  const product = await getProductById(productId);
  if (!product) {
    const error = new Error('Product not found');
    error.statusCode = 404;
    throw error;
  }

  // Tạo tên object duy nhất
  const ext = path.extname(file.originalname) || '.jpg';
  const objectName = `product-${productId}-${Date.now()}${ext}`;

  // Upload lên MinIO
  const imageUrl = await uploadObject(
    objectName,
    file.buffer,
    file.size,
    file.mimetype
  );

  // Cập nhật image_url trong PostgreSQL
  const result = await query(
    'UPDATE products SET image_url = $1 WHERE id = $2 RETURNING id, image_url',
    [imageUrl, productId]
  );

  return result.rows[0];
}

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  uploadProductImage,
};
