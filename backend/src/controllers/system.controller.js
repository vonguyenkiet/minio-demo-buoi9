'use strict';

const INSTANCE_NAME = process.env.INSTANCE_NAME || 'backend-unknown';
const UPLOAD_TEST_LIMIT_BYTES = parseInt(process.env.UPLOAD_TEST_LIMIT_BYTES) || 5 * 1024 * 1024; // 5 MiB
const START_TIME = Date.now();

// ============================================================
// System Controller – /api/health, /api/instance, /api/whoami, /api/upload-test
// ============================================================

/**
 * GET /api/health
 * Alias cho /health – cùng nội dung, phục vụ qua /api/ để NGINX có thể proxy
 */
function health(req, res) {
  res.json({
    status: 'ok',
    service: 'product-api',
    instance: INSTANCE_NAME,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
}

/**
 * GET /api/instance
 * Thông tin instance để kiểm tra load balancing
 */
function instance(req, res) {
  res.json({
    success: true,
    instance: INSTANCE_NAME,
    hostname: require('os').hostname(),
    pid: process.pid,
    startedAt: new Date(START_TIME).toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
}

/**
 * GET /api/whoami
 * Thông tin headers của request – dùng để debug proxy headers
 */
function whoami(req, res) {
  res.json({
    success: true,
    instance: INSTANCE_NAME,
    method: req.method,
    originalUrl: req.originalUrl,
    path: req.path,
    host: req.headers['host'] || null,
    headers: {
      'x-real-ip': req.headers['x-real-ip'] || null,
      'x-forwarded-for': req.headers['x-forwarded-for'] || null,
      'x-forwarded-proto': req.headers['x-forwarded-proto'] || null,
    },
    remoteAddress: req.socket ? req.socket.remoteAddress : null,
    expressIp: req.ip,
    trustProxy: req.app.get('trust proxy'),
  });
}

/**
 * POST /api/upload-test
 * Kiểm tra giới hạn body KHÔNG dùng multer, KHÔNG buffer toàn bộ.
 * Nếu Content-Length > UPLOAD_TEST_LIMIT_BYTES: trả 413 ngay với Connection: close.
 * Nếu chunked: đếm byte khi đọc, vượt trần thì trả 413 và ngắt.
 * Thành công: {success:true, receivedBytes, limitBytes, instance}
 */
function uploadTest(req, res) {
  const contentLength = parseInt(req.headers['content-length']);
  const limitBytes = UPLOAD_TEST_LIMIT_BYTES;

  // Kiểm tra Content-Length trước khi đọc
  if (!isNaN(contentLength) && contentLength > limitBytes) {
    res.setHeader('Connection', 'close');
    return res.status(413).json({
      success: false,
      source: 'backend',
      message: `Content-Length ${contentLength} exceeds limit ${limitBytes} bytes`,
      limitBytes,
      instance: INSTANCE_NAME,
    });
  }

  let receivedBytes = 0;
  let limitExceeded = false;

  req.on('data', (chunk) => {
    receivedBytes += chunk.length;
    if (!limitExceeded && receivedBytes > limitBytes) {
      limitExceeded = true;
      req.pause();
      if (!res.headersSent) {
        res.setHeader('Connection', 'close');
        res.status(413).json({
          success: false,
          source: 'backend',
          message: `Received bytes ${receivedBytes} exceeded limit ${limitBytes} bytes`,
          limitBytes,
          instance: INSTANCE_NAME,
        });
        res.on('finish', () => {
          req.destroy();
        });
      }
    }
    // Bỏ dữ liệu (không lưu)
  });

  req.on('end', () => {
    if (limitExceeded || res.headersSent) return;
    res.json({
      success: true,
      receivedBytes,
      limitBytes,
      instance: INSTANCE_NAME,
    });
  });

  req.on('error', () => {
    // Client ngắt kết nối hoặc req.destroy() – bỏ qua
    if (!res.headersSent) {
      res.status(499).end();
    }
  });
}

module.exports = { health, instance, whoami, uploadTest };
