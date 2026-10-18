'use strict';

const { Pool } = require('pg');

// ============================================================
// Cấu hình kết nối PostgreSQL
// Sử dụng service name "db" thay vì localhost
// vì trong Docker network, container name = hostname
// ============================================================
const pool = new Pool({
  host: process.env.DB_HOST || 'db',       // Tên service trong docker-compose
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'product_db',
  user: process.env.DB_USER || 'product_user',
  password: process.env.DB_PASSWORD,
  // Connection pool settings
  max: 10,                    // Tối đa 10 connections
  idleTimeoutMillis: 30000,   // Đóng connection nhàn rỗi sau 30s
  connectionTimeoutMillis: 5000, // Timeout kết nối 5s
});

// Log khi pool có lỗi
pool.on('error', (err) => {
  console.error('[Database] Unexpected error on idle client:', err.message);
});

/**
 * Kiểm tra kết nối database
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    console.log('[Database] ✅ Connected to PostgreSQL successfully');
    return true;
  } catch (err) {
    console.error('[Database] ❌ Connection failed:', err.message);
    return false;
  } finally {
    if (client) client.release();
  }
}

/**
 * Thực hiện query với error handling
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`[Database] Query executed in ${duration}ms, rows: ${result.rowCount}`);
    return result;
  } catch (err) {
    console.error('[Database] Query error:', err.message);
    throw err;
  }
}

module.exports = { pool, query, testConnection };
