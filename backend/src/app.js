'use strict';

const express = require('express');
const morgan = require('morgan');
const { testConnection: testDbConnection } = require('./config/database');
const { testConnection: testMinioConnection } = require('./config/minio');
const productRoutes = require('./routes/product.routes');
const systemRoutes = require('./routes/system.routes');
const storageRoutes = require('./routes/storage.routes');

// ============================================================
// Express Application Setup
// ============================================================
const app = express();

// Instance name từ biến môi trường (khác nhau cho backend-1 và backend-2)
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'backend-unknown';

// ============================================================
// Middleware
// ============================================================

// HTTP request logging – định dạng combined + x-real-ip + x-forwarded-for
morgan.token('x-real-ip', (req) => req.headers['x-real-ip'] || '-');
morgan.token('x-forwarded-for', (req) => req.headers['x-forwarded-for'] || '-');
app.use(
  morgan(
    ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" ' +
      ':status :res[content-length] ":referrer" ":user-agent" ' +
      'xrip=:x-real-ip xff=:x-forwarded-for'
  )
);

// Parse JSON body (mặc định 100 KB của body-parser)
app.use(express.json());

// Parse URL-encoded body
app.use(express.urlencoded({ extended: true }));

// Thêm header X-Instance để dễ dàng quan sát load balancing
app.use((req, res, next) => {
  res.setHeader('X-Instance', INSTANCE_NAME);
  next();
});

// ============================================================
// Health Check Routes (giữ nguyên ngoài /api/)
// ============================================================

/**
 * GET /health
 * Kiểm tra backend process đang chạy
 * Endpoint này được dùng cho Docker healthcheck
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'product-api',
    instance: INSTANCE_NAME,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

/**
 * GET /health/db
 * Kiểm tra kết nối database
 */
app.get('/health/db', async (req, res) => {
  try {
    const dbOk = await testDbConnection();
    const minioOk = await testMinioConnection();

    const status = dbOk && minioOk ? 'ok' : 'degraded';
    const httpStatus = dbOk && minioOk ? 200 : 503;

    res.status(httpStatus).json({
      status,
      service: 'product-api',
      instance: INSTANCE_NAME,
      checks: {
        postgresql: dbOk ? 'ok' : 'error',
        minio: minioOk ? 'ok' : 'error',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      service: 'product-api',
      instance: INSTANCE_NAME,
      message: err.message,
    });
  }
});

// ============================================================
// API Routes
// ============================================================
app.use('/api', storageRoutes);
app.use('/api/products', productRoutes);
app.use('/api', systemRoutes);

// ============================================================
// 404 Handler
// ============================================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// ============================================================
// Global Error Handler (bắt 413, multer, và lỗi với statusCode)
// ============================================================
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const is413 =
    err.type === 'entity.too.large' ||
    err.code === 'LIMIT_FILE_SIZE' ||
    err.status === 413 ||
    err.statusCode === 413;

  if (is413) {
    return res.status(413).json({
      success: false,
      source: 'backend',
      message: err.message || 'Payload Too Large',
    });
  }

  // Lỗi có mã status tùy biến (400, 403, 404...)
  if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  console.error('[App] Unhandled error:', err.message);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
});

module.exports = app;
