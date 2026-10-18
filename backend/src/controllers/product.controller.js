'use strict';

const productService = require('../services/product.service');

// ============================================================
// Product Controller – HTTP request/response layer
// ============================================================

/**
 * GET /api/products
 * Lấy danh sách tất cả sản phẩm
 */
async function listProducts(req, res) {
  try {
    const products = await productService.getAllProducts();
    return res.json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (err) {
    console.error('[Controller] listProducts error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
}

/**
 * GET /api/products/:id
 * Lấy chi tiết một sản phẩm
 */
async function getProduct(req, res) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID. ID must be a positive integer.',
      });
    }

    const product = await productService.getProductById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Product with ID ${id} not found`,
      });
    }

    return res.json({
      success: true,
      data: product,
    });
  } catch (err) {
    console.error('[Controller] getProduct error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
}

/**
 * POST /api/products
 * Tạo sản phẩm mới
 */
async function createProduct(req, res) {
  try {
    const { name, description, price, category, stock } = req.body;

    // Validation cơ bản
    const errors = [];

    if (!name || typeof name !== 'string' || name.trim() === '') {
      errors.push('name là bắt buộc và không được để trống');
    }

    if (price === undefined || price === null) {
      errors.push('price là bắt buộc');
    } else if (isNaN(Number(price)) || Number(price) <= 0) {
      errors.push('price phải là số dương (> 0)');
    }

    if (!category || typeof category !== 'string' || category.trim() === '') {
      errors.push('category là bắt buộc và không được để trống');
    }

    if (stock !== undefined && stock !== null) {
      if (isNaN(Number(stock)) || Number(stock) < 0) {
        errors.push('stock phải là số nguyên không âm (>= 0)');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors,
      });
    }

    const product = await productService.createProduct({
      name: name.trim(),
      description: description ? description.trim() : null,
      price: Number(price),
      category: category.trim(),
      stock: stock !== undefined && stock !== null ? parseInt(stock) : 0,
    });

    return res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product,
    });
  } catch (err) {
    console.error('[Controller] createProduct error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
}

/**
 * POST /api/products/:id/image
 * Upload ảnh sản phẩm lên MinIO
 */
async function uploadProductImage(req, res) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID. ID must be a positive integer.',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Không có file được upload. Hãy gửi field "image" với file ảnh.',
      });
    }

    // Kiểm tra loại file
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Chỉ chấp nhận file ảnh: JPEG, PNG, GIF, WEBP',
      });
    }

    const result = await productService.uploadProductImage(id, req.file);

    return res.json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        product_id: result.id,
        image_url: result.image_url,
      },
    });
  } catch (err) {
    console.error('[Controller] uploadProductImage error:', err.message);

    // Kiểm tra lỗi product not found
    if (err.statusCode === 404) {
      return res.status(404).json({
        success: false,
        message: err.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  uploadProductImage,
};
