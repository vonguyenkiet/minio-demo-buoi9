'use strict';

require('dotenv').config();

const app = require('./app');
const { testConnection: testDbConnection } = require('./config/database');
const { checkStorageConnection } = require('./config/minio');

const PORT = parseInt(process.env.BACKEND_PORT) || 3000;
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'backend-unknown';

// ============================================================
// Startup sequence with retry logic
// ============================================================

/**
 * Retry một hàm async với số lần thử tối đa
 * @param {Function} fn - Hàm cần retry
 * @param {number} maxAttempts - Số lần thử tối đa
 * @param {number} delayMs - Thời gian chờ giữa các lần thử (ms)
 */
async function retry(fn, maxAttempts = 10, delayMs = 3000) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      if (result) return result;
      throw new Error('Connection returned false');
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        console.log(`[Server] Attempt ${attempt}/${maxAttempts} failed: ${err.message}. Retrying in ${delayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

async function startServer() {
  console.log('================================================');
  console.log(`[Server] Starting ${INSTANCE_NAME}...`);
  console.log(`[Server] Node.js version: ${process.version}`);
  console.log('================================================');

  // 1. Kết nối PostgreSQL (với retry)
  console.log('[Server] Connecting to PostgreSQL...');
  try {
    await retry(() => testDbConnection(), 10, 3000);
  } catch (err) {
    console.error('[Server] ❌ Failed to connect to PostgreSQL after 10 attempts. Exiting...');
    process.exit(1);
  }

  // 2. Kiểm tra kết nối MinIO và xác thực Service Account (không chạy thao tác admin khi start)
  console.log('[Server] Checking MinIO storage connectivity (Least-Privilege Service Account)...');
  try {
    await retry(async () => {
      try {
        return await checkStorageConnection();
      } catch (storageErr) {
        console.warn(`[Server] ⚠️ MinIO service account / storage not ready: ${storageErr.message}. (Yêu cầu hoàn tất provisioning trước khi backend khởi động)`);
        throw storageErr;
      }
    }, 10, 3000);
  } catch (err) {
    console.error('[Server] ❌ Failed to authenticate/connect to MinIO storage after 10 attempts (30s). Backend requires valid service account provisioning. Exiting...');
    process.exit(1);
  }

  // 3. Start HTTP server
  app.listen(PORT, '0.0.0.0', () => {
    console.log('================================================');
    console.log(`[Server] ✅ ${INSTANCE_NAME} is running!`);
    console.log(`[Server] Port: ${PORT}`);
    console.log(`[Server] Health: http://localhost:${PORT}/health`);
    console.log(`[Server] Health DB: http://localhost:${PORT}/health/db`);
    console.log(`[Server] Products API: http://localhost:${PORT}/api/products`);
    console.log(`[Server] Storage Buckets: http://localhost:${PORT}/api/buckets`);
    console.log(`[Server] Storage Files: http://localhost:${PORT}/api/files`);
    console.log('================================================');
  });
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer().catch((err) => {
  console.error('[Server] Unhandled startup error:', err);
  process.exit(1);
});
