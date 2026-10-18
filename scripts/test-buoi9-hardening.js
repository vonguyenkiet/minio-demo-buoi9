'use strict';

/**
 * ==============================================================================
 * Test Suite: test-buoi9-hardening.js
 * Comprehensive Acceptance & Security Hardening Test for Buổi 9 (MinIO Object Storage)
 *
 * Kiểm thử toàn diện:
 * 1. Health checks & kết nối dịch vụ (Backend, DB, MinIO, NGINX).
 * 2. Bảo mật P0: Tách Service Account khỏi Root, least-privilege, không fallback,
 *    xử lý lỗi chính sách bắt buộc (set-demo-policy.js).
 * 3. Thao tác S3 CRUD qua Backend API (List, Upload, Info, Download).
 * 4. Presigned URL:
 *    - Chữ ký AWS Signature V4 qua minio.shop.local
 *    - Expiry mặc định (300s)
 *    - Expiry tùy biến hợp lệ (60s)
 *    - Chặn TTL = 0, số âm, số thập phân, chuỗi ký tự, vượt trần MAX_TTL
 *    - Kiểm tra chữ ký bị sửa đổi (SignatureDoesNotMatch)
 * 5. Phân quyền Public vs Private (Anonymous GET public 200, Anonymous 403 private/list/put/delete).
 * 6. Quy trình Rename / Move an toàn (Copy -> Verify -> Delete source).
 * 7. Validation: Allowlist buckets, Path traversal, Unsupported MIME, Body size limit (HTTP 413).
 * 8. Dual Backend Load Balancing qua NGINX (X-Instance header).
 * 9. Kế thừa Buổi 8: Endpoint /api/products hoạt động bình thường.
 * ==============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const NGINX_HOST = '127.0.0.1';
const NGINX_PORT = 80;

const results = [];

function recordResult(code, category, testName, status, details = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${code}] [${status}] [${category}] ${testName} ${details ? '- ' + details : ''}`);
  results.push({ code, category, testName, status, details });
}

/**
 * Đọc cấu hình từ .env an toàn
 */
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const envMap = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const idx = line.indexOf('=');
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      envMap[key] = val;
    }
  }
  return envMap;
}

const envConfig = loadEnv();

/**
 * Gửi HTTP request đa năng
 */
function sendHttpRequest({ method = 'GET', host = NGINX_HOST, port = NGINX_PORT, path = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const reqHeaders = { ...headers };
    let reqBody = body;

    if (body && typeof body === 'object' && !Buffer.isBuffer(body) && !(body instanceof Uint8Array)) {
      reqBody = JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
    }

    if (reqBody && !reqHeaders['Content-Length']) {
      reqHeaders['Content-Length'] = Buffer.isBuffer(reqBody) ? reqBody.length : Buffer.byteLength(reqBody);
    }

    const options = {
      host,
      port,
      path,
      method,
      headers: reqHeaders,
      timeout: 10000,
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        let parsed = null;
        try {
          parsed = JSON.parse(raw.toString('utf8'));
        } catch (e) {
          // Non-JSON response
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          raw,
          text: raw.toString('utf8'),
          data: parsed,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout (${method} ${path})`));
    });

    req.on('error', (err) => reject(err));

    if (reqBody) {
      req.write(reqBody);
    }
    req.end();
  });
}

/**
 * Gửi Multipart Form-Data Upload
 */
function sendMultipartUpload({ path = '/api/files', bucket = 'buoi9-assets', prefix = '', customKey = '', fileName = 'test.txt', fileBuffer, mimeType = 'text/plain' }) {
  return new Promise((resolve, reject) => {
    const boundary = '----MinIOBuoi9Boundary' + Date.now();
    const parts = [];

    // Fields
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="bucket"\r\n\r\n${bucket}\r\n`));
    if (prefix) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="prefix"\r\n\r\n${prefix}\r\n`));
    }
    if (customKey) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="customKey"\r\n\r\n${customKey}\r\n`));
    }

    // File
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
      )
    );
    parts.push(fileBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const fullBody = Buffer.concat(parts);

    const options = {
      host: NGINX_HOST,
      port: NGINX_PORT,
      path,
      method: 'POST',
      headers: {
        Host: 'shop.local',
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length,
      },
      timeout: 15000,
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        let parsed = null;
        try {
          parsed = JSON.parse(raw.toString('utf8'));
        } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          raw,
          text: raw.toString('utf8'),
          data: parsed,
        });
      });
    });

    req.on('error', (err) => reject(err));
    req.write(fullBody);
    req.end();
  });
}

async function runTestSuite() {
  console.log('==============================================================================');
  console.log('🚀 BẮT ĐẦU CHẠY TOÀN BỘ BÀI TEST CHẤP NHẬN & BẢO MẬT BUỔI 9');
  console.log(`⏰ Thời gian bắt đầu: ${new Date().toISOString()}`);
  console.log('==============================================================================\n');

  // --------------------------------------------------------------------------
  // 1. Health & Connection Checks
  // --------------------------------------------------------------------------
  console.log('--- PHẦN 1: HEALTH CHECKS & KẾT NỐI DỊCH VỤ ---');
  try {
    const resHealth = await sendHttpRequest({ path: '/health', headers: { Host: 'shop.local' } });
    if (resHealth.statusCode === 200 && resHealth.data && resHealth.data.status === 'ok') {
      recordResult('AC01', 'Health', 'Backend Process Health (/health)', 'PASS', `Instance: ${resHealth.data.instance}`);
    } else {
      recordResult('AC01', 'Health', 'Backend Process Health (/health)', 'FAIL', `HTTP ${resHealth.statusCode}`);
    }
  } catch (err) {
    recordResult('AC01', 'Health', 'Backend Process Health (/health)', 'FAIL', err.message);
  }

  try {
    const resDbHealth = await sendHttpRequest({ path: '/health/db', headers: { Host: 'shop.local' } });
    if (resDbHealth.statusCode === 200 && resDbHealth.data && resDbHealth.data.checks.postgresql === 'ok' && resDbHealth.data.checks.minio === 'ok') {
      recordResult('AC02', 'Health', 'DB & MinIO Health (/health/db)', 'PASS', 'PostgreSQL & MinIO both OK');
    } else {
      recordResult('AC02', 'Health', 'DB & MinIO Health (/health/db)', 'FAIL', `Status: ${resDbHealth.statusCode}`);
    }
  } catch (err) {
    recordResult('AC02', 'Health', 'DB & MinIO Health (/health/db)', 'FAIL', err.message);
  }

  try {
    const resNginx = await sendHttpRequest({ path: '/nginx-health', headers: { Host: 'shop.local' } });
    if (resNginx.statusCode === 200 && resNginx.data && resNginx.data.service === 'nginx') {
      recordResult('AC03', 'Health', 'NGINX Reverse Proxy Health (/nginx-health)', 'PASS', `Stage: ${resNginx.data.stage}`);
    } else {
      recordResult('AC03', 'Health', 'NGINX Reverse Proxy Health (/nginx-health)', 'FAIL', `Status: ${resNginx.statusCode}`);
    }
  } catch (err) {
    recordResult('AC03', 'Health', 'NGINX Reverse Proxy Health (/nginx-health)', 'FAIL', err.message);
  }

  // --------------------------------------------------------------------------
  // 2. Security P0: MinIO Credentials Separation & Least Privilege
  // --------------------------------------------------------------------------
  console.log('\n--- PHẦN 2: BẢO MẬT P0 - MINIO CREDENTIALS SEPARATION ---');
  try {
    // Kiểm tra cấu hình container backend không chứa MINIO_ROOT_USER hay ROOT_PASSWORD
    const backendEnvRaw = execSync('docker compose exec -T backend-1 env', { encoding: 'utf8' });
    const hasRootUser = backendEnvRaw.includes('MINIO_ROOT_USER=');
    const hasRootPass = backendEnvRaw.includes('MINIO_ROOT_PASSWORD=');
    const accessKeyMatch = backendEnvRaw.match(/MINIO_ACCESS_KEY=([^\r\n]+)/);
    const accessKey = accessKeyMatch ? accessKeyMatch[1] : '';
    const expectedKey = process.env.MINIO_BACKEND_ACCESS_KEY || envConfig.MINIO_BACKEND_ACCESS_KEY || 'buoi9_app_svc';

    if (!hasRootUser && !hasRootPass && accessKey && accessKey === expectedKey) {
      recordResult('AC04', 'Security-P0', 'Backend Runtime Environment Isolation', 'PASS', `Uses service account (${accessKey}), zero root credentials present`);
    } else {
      recordResult('AC04', 'Security-P0', 'Backend Runtime Environment Isolation', 'FAIL', `Root in env: ${hasRootUser || hasRootPass}, AccessKey: ${accessKey}`);
    }
  } catch (err) {
    recordResult('AC04', 'Security-P0', 'Backend Runtime Environment Isolation', 'FAIL', err.message);
  }

  try {
    // Kiểm tra Service Account bị từ chối khi thực hiện thao tác Admin (makeBucket)
    const adminCheck = execSync(
      'docker compose exec -T backend-1 node -e "' +
        "const Minio = require('minio');" +
        "const c = new Minio.Client({endPoint:'minio',port:9000,useSSL:false,accessKey:process.env.MINIO_ACCESS_KEY,secretKey:process.env.MINIO_SECRET_KEY});" +
        "c.makeBucket('unauth-bucket').then(() => process.exit(2)).catch(e => { if (e.message.includes('Access Denied')) process.exit(0); else process.exit(1); });" +
        '"',
      { encoding: 'utf8', stdio: 'pipe' }
    );
    recordResult('AC05', 'Security-P0', 'Service Account Least Privilege (makeBucket blocked)', 'PASS', 'Access Denied returned as expected');
  } catch (err) {
    if (err.status === 0) {
      recordResult('AC05', 'Security-P0', 'Service Account Least Privilege (makeBucket blocked)', 'PASS', 'Access Denied returned as expected');
    } else {
      recordResult('AC05', 'Security-P0', 'Service Account Least Privilege (makeBucket blocked)', 'FAIL', `Exit code: ${err.status}`);
    }
  }

  try {
    // Kiểm tra ứng dụng báo lỗi rõ ràng khi thiếu MINIO_ACCESS_KEY và KHÔNG fallback sang root
    const missingCredsCheck = execSync(
      'docker compose run --rm -e MINIO_ACCESS_KEY="" -e MINIO_SECRET_KEY="" backend-1 node -e "require(\'./src/config/minio\')"',
      { encoding: 'utf8', stdio: 'pipe' }
    );
    recordResult('AC06', 'Security-P0', 'No Fallback to Root on Missing Backend Credentials', 'FAIL', 'Backend started unexpectedly without credentials');
  } catch (err) {
    const stderrText = (err.stderr || '') + (err.stdout || '');
    if (stderrText.includes('[MinIO Configuration Error]') && stderrText.includes('MINIO_ACCESS_KEY hoặc MINIO_SECRET_KEY chưa được cấu hình')) {
      recordResult('AC06', 'Security-P0', 'No Fallback to Root on Missing Backend Credentials', 'PASS', 'Explicit configuration error thrown, zero fallback to root');
    } else {
      recordResult('AC06', 'Security-P0', 'No Fallback to Root on Missing Backend Credentials', 'FAIL', `Unexpected error output: ${stderrText.slice(0, 150)}`);
    }
  }

  try {
    // Kiểm tra set-demo-policy.js thoát mã khác 0 (exit 1) khi bucket bắt buộc không tồn tại
    execSync('docker compose run --rm -e MINIO_BUCKET=nonexistent-test-bucket-for-exit minio-admin node scripts/set-demo-policy.js', {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    recordResult('AC07', 'Security-P0', 'set-demo-policy.js Fails Fast on Missing Bucket', 'FAIL', 'Script exited with code 0 instead of failing');
  } catch (err) {
    if (err.status !== 0) {
      recordResult('AC07', 'Security-P0', 'set-demo-policy.js Fails Fast on Missing Bucket', 'PASS', `Script failed with exit code ${err.status} when required bucket was missing`);
    } else {
      recordResult('AC07', 'Security-P0', 'set-demo-policy.js Fails Fast on Missing Bucket', 'FAIL', `Exit code was ${err.status}`);
    }
  }

  // --------------------------------------------------------------------------
  // 3. Bucket Listing & Allowlist Validation
  // --------------------------------------------------------------------------
  console.log('\n--- PHẦN 3: BUCKET LISTING & ALLOWLIST VALIDATION ---');
  try {
    const resBuckets = await sendHttpRequest({ path: '/api/buckets', headers: { Host: 'shop.local' } });
    if (resBuckets.statusCode === 200 && Array.isArray(resBuckets.data.data)) {
      const bucketNames = resBuckets.data.data.map((b) => b.bucket);
      const hasBuoi9Assets = bucketNames.includes('buoi9-assets');
      const hasArchive = bucketNames.includes('buoi9-assets-archive');
      if (hasBuoi9Assets && hasArchive) {
        recordResult('AC08', 'Storage-API', 'Get Demo Buckets Summary (/api/buckets)', 'PASS', `Buckets: ${bucketNames.join(', ')}`);
      } else {
        recordResult('AC08', 'Storage-API', 'Get Demo Buckets Summary (/api/buckets)', 'FAIL', `Missing expected demo buckets: ${bucketNames}`);
      }
    } else {
      recordResult('AC08', 'Storage-API', 'Get Demo Buckets Summary (/api/buckets)', 'FAIL', `HTTP ${resBuckets.statusCode}`);
    }
  } catch (err) {
    recordResult('AC08', 'Storage-API', 'Get Demo Buckets Summary (/api/buckets)', 'FAIL', err.message);
  }

  try {
    // Bucket ngoài allowlist
    const resForbiddenBucket = await sendHttpRequest({ path: '/api/files?bucket=unauthorized-secret-bucket', headers: { Host: 'shop.local' } });
    if (resForbiddenBucket.statusCode === 403) {
      recordResult('AC09', 'Storage-API', 'Enforce Bucket Allowlist (Forbidden Bucket)', 'PASS', 'HTTP 403 Forbidden correctly returned');
    } else {
      recordResult('AC09', 'Storage-API', 'Enforce Bucket Allowlist (Forbidden Bucket)', 'FAIL', `Expected 403, got ${resForbiddenBucket.statusCode}`);
    }
  } catch (err) {
    recordResult('AC09', 'Storage-API', 'Enforce Bucket Allowlist (Forbidden Bucket)', 'FAIL', err.message);
  }

  // --------------------------------------------------------------------------
  // 4. Object Upload, Info & Download
  // --------------------------------------------------------------------------
  console.log('\n--- PHẦN 4: OBJECT CRUD (UPLOAD, INFO, DOWNLOAD) ---');
  const testContent = `[TEST-SUITE-BUOI9] Nội dung kiểm thử tự động ngày ${new Date().toISOString()}.\nMinIO S3 integration test content.`;
  const testBuffer = Buffer.from(testContent, 'utf8');
  const privateKey = `private/e2e-test-${Date.now()}.txt`;
  let uploadedFileId = null;

  try {
    const uploadRes = await sendMultipartUpload({
      bucket: 'buoi9-assets',
      customKey: privateKey,
      fileName: 'e2e-test.txt',
      fileBuffer: testBuffer,
      mimeType: 'text/plain',
    });

    if (uploadRes.statusCode === 201 && uploadRes.data && uploadRes.data.success) {
      uploadedFileId = uploadRes.data.data.id;
      recordResult('AC10', 'Storage-API', 'Upload Private Object (/api/files)', 'PASS', `Key: ${privateKey}, Size: ${uploadRes.data.data.size} bytes`);
    } else {
      recordResult('AC10', 'Storage-API', 'Upload Private Object (/api/files)', 'FAIL', `HTTP ${uploadRes.statusCode}: ${uploadRes.text}`);
    }
  } catch (err) {
    recordResult('AC10', 'Storage-API', 'Upload Private Object (/api/files)', 'FAIL', err.message);
  }

  // Download & Verify content
  try {
    const dlRes = await sendHttpRequest({
      path: `/api/files/download?bucket=buoi9-assets&key=${encodeURIComponent(privateKey)}`,
      headers: { Host: 'shop.local' },
    });

    if (dlRes.statusCode === 200 && dlRes.text === testContent) {
      recordResult('AC11', 'Storage-API', 'Download Object & Integrity Check (/api/files/download)', 'PASS', 'Downloaded content matches uploaded content exactly');
    } else {
      recordResult('AC11', 'Storage-API', 'Download Object & Integrity Check (/api/files/download)', 'FAIL', `HTTP ${dlRes.statusCode}, Content match: ${dlRes.text === testContent}`);
    }
  } catch (err) {
    recordResult('AC11', 'Storage-API', 'Download Object & Integrity Check (/api/files/download)', 'FAIL', err.message);
  }

  // --------------------------------------------------------------------------
  // 5. Presigned URL (AWS Signature V4, TTL Validation & Bounds)
  // --------------------------------------------------------------------------
  console.log('\n--- PHẦN 5: PRESIGNED URL & AWS SIGNATURE V4 ---');
  let presignedUrl = null;

  // 5.1: Mặc định an toàn khi không truyền expiry (300s)
  try {
    const defaultUrlRes = await sendHttpRequest({
      path: `/api/files/url?bucket=buoi9-assets&key=${encodeURIComponent(privateKey)}`,
      headers: { Host: 'shop.local' },
    });
    if (defaultUrlRes.statusCode === 200 && defaultUrlRes.data && defaultUrlRes.data.data.expiresIn === 300) {
      recordResult('AC12', 'Presigned-URL', 'Default Expiry (Omitted expiry defaults to 300s)', 'PASS', `ExpiresIn: ${defaultUrlRes.data.data.expiresIn}s`);
    } else {
      recordResult('AC12', 'Presigned-URL', 'Default Expiry (Omitted expiry defaults to 300s)', 'FAIL', `HTTP ${defaultUrlRes.statusCode}`);
    }
  } catch (err) {
    recordResult('AC12', 'Presigned-URL', 'Default Expiry (Omitted expiry defaults to 300s)', 'FAIL', err.message);
  }

  // 5.2: TTL hợp lệ tùy biến (60s)
  try {
    const customUrlRes = await sendHttpRequest({
      path: `/api/files/url?bucket=buoi9-assets&key=${encodeURIComponent(privateKey)}&expiry=60`,
      headers: { Host: 'shop.local' },
    });
    if (customUrlRes.statusCode === 200 && customUrlRes.data && customUrlRes.data.data.expiresIn === 60) {
      presignedUrl = customUrlRes.data.data.presignedUrl;
      const urlObj = new URL(presignedUrl);
      const isCorrectHost = urlObj.hostname === 'minio.shop.local';
      const hasSignature = urlObj.searchParams.has('X-Amz-Signature');
      const hasAlgorithm = urlObj.searchParams.get('X-Amz-Algorithm') === 'AWS4-HMAC-SHA256';
      const hasExpires = urlObj.searchParams.get('X-Amz-Expires') === '60';

      if (isCorrectHost && hasSignature && hasAlgorithm && hasExpires) {
        recordResult('AC13', 'Presigned-URL', 'Valid Custom TTL (expiry=60s) with SigV4', 'PASS', `Host: ${urlObj.hostname}, Algorithm: AWS4-HMAC-SHA256`);
      } else {
        recordResult('AC13', 'Presigned-URL', 'Valid Custom TTL (expiry=60s) with SigV4', 'FAIL', `Sig: ${hasSignature}, Exp: ${hasExpires}`);
      }
    } else {
      recordResult('AC13', 'Presigned-URL', 'Valid Custom TTL (expiry=60s) with SigV4', 'FAIL', `HTTP ${customUrlRes.statusCode}`);
    }
  } catch (err) {
    recordResult('AC13', 'Presigned-URL', 'Valid Custom TTL (expiry=60s) with SigV4', 'FAIL', err.message);
  }

  // 5.3: Truy cập qua Presigned URL với Host header minio.shop.local
  if (presignedUrl) {
    try {
      const urlObj = new URL(presignedUrl);
      const fetchPresigned = await sendHttpRequest({
        path: urlObj.pathname + urlObj.search,
        headers: { Host: 'minio.shop.local' },
      });

      if (fetchPresigned.statusCode === 200 && fetchPresigned.text === testContent) {
        recordResult('AC14', 'Presigned-URL', 'Fetch Private Object via Presigned URL', 'PASS', 'HTTP 200 OK via minio.shop.local reverse proxy');
      } else {
        recordResult('AC14', 'Presigned-URL', 'Fetch Private Object via Presigned URL', 'FAIL', `Expected 200, got ${fetchPresigned.statusCode}`);
      }
    } catch (err) {
      recordResult('AC14', 'Presigned-URL', 'Fetch Private Object via Presigned URL', 'FAIL', err.message);
    }

    // 5.4: Tampered Presigned URL (chữ ký giả mạo)
    try {
      const urlObj = new URL(presignedUrl);
      urlObj.searchParams.set('X-Amz-Signature', 'badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbad1');
      const tamperedRes = await sendHttpRequest({
        path: urlObj.pathname + urlObj.search,
        headers: { Host: 'minio.shop.local' },
      });

      if (tamperedRes.statusCode === 403) {
        recordResult('AC15', 'Presigned-URL', 'Reject Tampered Presigned URL', 'PASS', 'HTTP 403 Forbidden (SignatureDoesNotMatch)');
      } else {
        recordResult('AC15', 'Presigned-URL', 'Reject Tampered Presigned URL', 'FAIL', `Expected 403, got ${tamperedRes.statusCode}`);
      }
    } catch (err) {
      recordResult('AC15', 'Presigned-URL', 'Reject Tampered Presigned URL', 'FAIL', err.message);
    }
  }

  // 5.5: Chặn TTL = 0 hoặc số âm (HTTP 400)
  try {
    const zeroRes = await sendHttpRequest({
      path: `/api/files/url?bucket=buoi9-assets&key=${encodeURIComponent(privateKey)}&expiry=0`,
      headers: { Host: 'shop.local' },
    });
    const negRes = await sendHttpRequest({
      path: `/api/files/url?bucket=buoi9-assets&key=${encodeURIComponent(privateKey)}&expiry=-50`,
      headers: { Host: 'shop.local' },
    });
    if (zeroRes.statusCode === 400 && negRes.statusCode === 400) {
      recordResult('AC16', 'Presigned-URL', 'Reject Expiry Zero or Negative (HTTP 400)', 'PASS', 'Zero & Negative TTL rejected with HTTP 400');
    } else {
      recordResult('AC16', 'Presigned-URL', 'Reject Expiry Zero or Negative (HTTP 400)', 'FAIL', `Zero: ${zeroRes.statusCode}, Neg: ${negRes.statusCode}`);
    }
  } catch (err) {
    recordResult('AC16', 'Presigned-URL', 'Reject Expiry Zero or Negative (HTTP 400)', 'FAIL', err.message);
  }

  // 5.6: Chặn TTL chuỗi không phải số hoặc số thập phân (HTTP 400)
  try {
    const strRes = await sendHttpRequest({
      path: `/api/files/url?bucket=buoi9-assets&key=${encodeURIComponent(privateKey)}&expiry=abc`,
      headers: { Host: 'shop.local' },
    });
    const floatRes = await sendHttpRequest({
      path: `/api/files/url?bucket=buoi9-assets&key=${encodeURIComponent(privateKey)}&expiry=30.5`,
      headers: { Host: 'shop.local' },
    });
    if (strRes.statusCode === 400 && floatRes.statusCode === 400) {
      recordResult('AC17', 'Presigned-URL', 'Reject Non-Integer / String TTL (HTTP 400)', 'PASS', 'String & Float TTL rejected with HTTP 400');
    } else {
      recordResult('AC17', 'Presigned-URL', 'Reject Non-Integer / String TTL (HTTP 400)', 'FAIL', `Str: ${strRes.statusCode}, Float: ${floatRes.statusCode}`);
    }
  } catch (err) {
    recordResult('AC17', 'Presigned-URL', 'Reject Non-Integer / String TTL (HTTP 400)', 'FAIL', err.message);
  }

  // 5.7: Chặn TTL vượt trần MAX_TTL (3600s) hoặc số quá lớn (HTTP 400)
  try {
    const overRes = await sendHttpRequest({
      path: `/api/files/url?bucket=buoi9-assets&key=${encodeURIComponent(privateKey)}&expiry=7200`,
      headers: { Host: 'shop.local' },
    });
    const hugeRes = await sendHttpRequest({
      path: `/api/files/url?bucket=buoi9-assets&key=${encodeURIComponent(privateKey)}&expiry=999999999`,
      headers: { Host: 'shop.local' },
    });
    if (overRes.statusCode === 400 && hugeRes.statusCode === 400) {
      recordResult('AC18', 'Presigned-URL', 'Reject Exceeded MAX_TTL Limit (HTTP 400)', 'PASS', 'Capped by PRESIGNED_URL_MAX_TTL_SECONDS (3600s), HTTP 400 returned');
    } else {
      recordResult('AC18', 'Presigned-URL', 'Reject Exceeded MAX_TTL Limit (HTTP 400)', 'FAIL', `Over: ${overRes.statusCode}, Huge: ${hugeRes.statusCode}`);
    }
  } catch (err) {
    recordResult('AC18', 'Presigned-URL', 'Reject Exceeded MAX_TTL Limit (HTTP 400)', 'FAIL', err.message);
  }

  // --------------------------------------------------------------------------
  // 6. Anonymous Access Control (Public vs Private)
  // --------------------------------------------------------------------------
  console.log('\n--- PHẦN 6: ANONYMOUS ACCESS CONTROL (PUBLIC VS PRIVATE) ---');
  const publicKey = `public/e2e-public-${Date.now()}.txt`;
  const publicContent = `[PUBLIC ANNOUNCEMENT] File công khai dành cho mọi người.`;

  try {
    await sendMultipartUpload({
      bucket: 'buoi9-assets',
      customKey: publicKey,
      fileName: 'public-test.txt',
      fileBuffer: Buffer.from(publicContent, 'utf8'),
      mimeType: 'text/plain',
    });

    // 1. Anonymous GET public object -> 200 OK
    const anonPubRes = await sendHttpRequest({
      path: `/buoi9-assets/${publicKey}`,
      headers: { Host: 'minio.shop.local' },
    });
    if (anonPubRes.statusCode === 200 && anonPubRes.text === publicContent) {
      recordResult('AC19', 'Security-Anonymous', 'Anonymous GET on Public Prefix (public/*)', 'PASS', 'HTTP 200 OK as permitted by policy');
    } else {
      recordResult('AC19', 'Security-Anonymous', 'Anonymous GET on Public Prefix (public/*)', 'FAIL', `HTTP ${anonPubRes.statusCode}`);
    }

    // 2. Anonymous GET private object -> 403 Forbidden
    const anonPrivRes = await sendHttpRequest({
      path: `/buoi9-assets/${privateKey}`,
      headers: { Host: 'minio.shop.local' },
    });
    if (anonPrivRes.statusCode === 403) {
      recordResult('AC20', 'Security-Anonymous', 'Anonymous GET on Private Object Blocked', 'PASS', 'HTTP 403 Forbidden as required');
    } else {
      recordResult('AC20', 'Security-Anonymous', 'Anonymous GET on Private Object Blocked', 'FAIL', `Expected 403, got ${anonPrivRes.statusCode}`);
    }

    // 3. Anonymous ListBucket -> 403 Forbidden
    const anonListRes = await sendHttpRequest({
      path: '/buoi9-assets/',
      headers: { Host: 'minio.shop.local' },
    });
    if (anonListRes.statusCode === 403) {
      recordResult('AC21', 'Security-Anonymous', 'Anonymous ListBucket Blocked', 'PASS', 'HTTP 403 Forbidden');
    } else {
      recordResult('AC21', 'Security-Anonymous', 'Anonymous ListBucket Blocked', 'FAIL', `Expected 403, got ${anonListRes.statusCode}`);
    }

    // 4. Anonymous PUT -> 403 Forbidden
    const anonPutRes = await sendHttpRequest({
      method: 'PUT',
      path: `/buoi9-assets/public/hack-${Date.now()}.txt`,
      headers: { Host: 'minio.shop.local' },
      body: 'hacked content',
    });
    if (anonPutRes.statusCode === 403) {
      recordResult('AC22', 'Security-Anonymous', 'Anonymous PutObject Blocked', 'PASS', 'HTTP 403 Forbidden');
    } else {
      recordResult('AC22', 'Security-Anonymous', 'Anonymous PutObject Blocked', 'FAIL', `Expected 403, got ${anonPutRes.statusCode}`);
    }

    // 5. Anonymous DELETE -> 403 Forbidden
    const anonDelRes = await sendHttpRequest({
      method: 'DELETE',
      path: `/buoi9-assets/${publicKey}`,
      headers: { Host: 'minio.shop.local' },
    });
    if (anonDelRes.statusCode === 403) {
      recordResult('AC23', 'Security-Anonymous', 'Anonymous DeleteObject Blocked', 'PASS', 'HTTP 403 Forbidden');
    } else {
      recordResult('AC23', 'Security-Anonymous', 'Anonymous DeleteObject Blocked', 'FAIL', `Expected 403, got ${anonDelRes.statusCode}`);
    }
  } catch (err) {
    recordResult('AC19', 'Security-Anonymous', 'Anonymous Policy Tests', 'FAIL', err.message);
  }

  // --------------------------------------------------------------------------
  // 7. Rename & Move Operations (Safe Copy-then-Delete)
  // --------------------------------------------------------------------------
  console.log('\n--- PHẦN 7: RENAME & MOVE AN TOÀN (COPY -> VERIFY -> DELETE) ---');
  const renamedKey = `private/e2e-renamed-${Date.now()}.txt`;
  try {
    const renameRes = await sendHttpRequest({
      method: 'POST',
      path: '/api/files/rename',
      headers: { Host: 'shop.local' },
      body: { bucket: 'buoi9-assets', key: privateKey, newKey: renamedKey },
    });

    if (renameRes.statusCode === 200 && renameRes.data && renameRes.data.success) {
      // Xác minh đích tồn tại
      const verifyDest = await sendHttpRequest({
        path: `/api/files/download?bucket=buoi9-assets&key=${encodeURIComponent(renamedKey)}`,
        headers: { Host: 'shop.local' },
      });
      // Xác minh nguồn đã bị xóa
      const verifySrc = await sendHttpRequest({
        path: `/api/files/download?bucket=buoi9-assets&key=${encodeURIComponent(privateKey)}`,
        headers: { Host: 'shop.local' },
      });

      if (verifyDest.statusCode === 200 && verifySrc.statusCode === 404) {
        recordResult('AC24', 'Storage-Ops', 'Rename Object (Safe Copy -> Verify -> Delete)', 'PASS', `Renamed ${privateKey} -> ${renamedKey}`);
      } else {
        recordResult('AC24', 'Storage-Ops', 'Rename Object (Safe Copy -> Verify -> Delete)', 'FAIL', `Dest: ${verifyDest.statusCode}, Src: ${verifySrc.statusCode}`);
      }
    } else {
      recordResult('AC24', 'Storage-Ops', 'Rename Object (Safe Copy -> Verify -> Delete)', 'FAIL', `HTTP ${renameRes.statusCode}: ${renameRes.text}`);
    }
  } catch (err) {
    recordResult('AC24', 'Storage-Ops', 'Rename Object (Safe Copy -> Verify -> Delete)', 'FAIL', err.message);
  }

  // Move across buckets
  const movedKey = `archive/moved-${Date.now()}.txt`;
  try {
    const moveRes = await sendHttpRequest({
      method: 'POST',
      path: '/api/files/move',
      headers: { Host: 'shop.local' },
      body: {
        bucket: 'buoi9-assets',
        key: renamedKey,
        targetBucket: 'buoi9-assets-archive',
        targetKey: movedKey,
      },
    });

    if (moveRes.statusCode === 200 && moveRes.data && moveRes.data.success) {
      const verifyDst = await sendHttpRequest({
        path: `/api/files/download?bucket=buoi9-assets-archive&key=${encodeURIComponent(movedKey)}`,
        headers: { Host: 'shop.local' },
      });
      const verifySrc = await sendHttpRequest({
        path: `/api/files/download?bucket=buoi9-assets&key=${encodeURIComponent(renamedKey)}`,
        headers: { Host: 'shop.local' },
      });

      if (verifyDst.statusCode === 200 && verifySrc.statusCode === 404) {
        recordResult('AC25', 'Storage-Ops', 'Move Object Across Buckets (buoi9-assets -> archive)', 'PASS', `Moved to buoi9-assets-archive/${movedKey}`);
      } else {
        recordResult('AC25', 'Storage-Ops', 'Move Object Across Buckets (buoi9-assets -> archive)', 'FAIL', `Dest: ${verifyDst.statusCode}, Src: ${verifySrc.statusCode}`);
      }
    } else {
      recordResult('AC25', 'Storage-Ops', 'Move Object Across Buckets (buoi9-assets -> archive)', 'FAIL', `HTTP ${moveRes.statusCode}`);
    }
  } catch (err) {
    recordResult('AC25', 'Storage-Ops', 'Move Object Across Buckets (buoi9-assets -> archive)', 'FAIL', err.message);
  }

  // Dọn dẹp object sau move
  try {
    const delRes = await sendHttpRequest({
      method: 'DELETE',
      path: `/api/files?bucket=buoi9-assets-archive&key=${encodeURIComponent(movedKey)}`,
      headers: { Host: 'shop.local' },
    });
    if (delRes.statusCode === 200) {
      recordResult('AC26', 'Storage-Ops', 'Delete Object (/api/files)', 'PASS', `Cleaned up buoi9-assets-archive/${movedKey}`);
    }
    // Xóa public test file
    await sendHttpRequest({
      method: 'DELETE',
      path: `/api/files?bucket=buoi9-assets&key=${encodeURIComponent(publicKey)}`,
      headers: { Host: 'shop.local' },
    });
  } catch (err) {
    recordResult('AC26', 'Storage-Ops', 'Delete Object (/api/files)', 'FAIL', err.message);
  }

  // --------------------------------------------------------------------------
  // 8. Validation & Body Size Limit (HTTP 413)
  // --------------------------------------------------------------------------
  console.log('\n--- PHẦN 8: VALIDATION & GIỚI HẠN DUNG LƯỢNG (HTTP 413) ---');
  try {
    // Path traversal attempt in key
    const traversalRes = await sendHttpRequest({
      path: '/api/files/download?bucket=buoi9-assets&key=../../etc/passwd',
      headers: { Host: 'shop.local' },
    });
    if (traversalRes.statusCode === 400) {
      recordResult('AC27', 'Validation', 'Path Traversal Prevention in Key (../../)', 'PASS', 'HTTP 400 Bad Request');
    } else {
      recordResult('AC27', 'Validation', 'Path Traversal Prevention in Key (../../)', 'FAIL', `Expected 400, got ${traversalRes.statusCode}`);
    }
  } catch (err) {
    recordResult('AC27', 'Validation', 'Path Traversal Prevention in Key (../../)', 'FAIL', err.message);
  }

  try {
    // Unsupported file extension / MIME
    const badMimeRes = await sendMultipartUpload({
      bucket: 'buoi9-assets',
      customKey: 'test.exe',
      fileName: 'malicious.exe',
      fileBuffer: Buffer.from('MZ binary header executable content'),
      mimeType: 'application/x-msdownload',
    });
    if (badMimeRes.statusCode === 400) {
      recordResult('AC28', 'Validation', 'MIME Type & Extension Allowlist Filter', 'PASS', 'HTTP 400 Bad Request returned for unauthorized MIME');
    } else {
      recordResult('AC28', 'Validation', 'MIME Type & Extension Allowlist Filter', 'FAIL', `Expected 400, got ${badMimeRes.statusCode}`);
    }
  } catch (err) {
    recordResult('AC28', 'Validation', 'MIME Type & Extension Allowlist Filter', 'FAIL', err.message);
  }

  try {
    // Test HTTP 413: upload buffer > 5 MiB (5.5 MiB)
    const largeBuffer = Buffer.alloc(5.5 * 1024 * 1024, 'A');
    const largeUploadRes = await sendMultipartUpload({
      bucket: 'buoi9-assets',
      customKey: 'large-overflow.txt',
      fileName: 'large.txt',
      fileBuffer: largeBuffer,
      mimeType: 'text/plain',
    });
    if (largeUploadRes.statusCode === 413) {
      recordResult('AC29', 'Validation', 'Upload Size Limit Enforcement (HTTP 413)', 'PASS', 'HTTP 413 Payload Too Large correctly returned');
    } else {
      recordResult('AC29', 'Validation', 'Upload Size Limit Enforcement (HTTP 413)', 'FAIL', `Expected 413, got ${largeUploadRes.statusCode}`);
    }
  } catch (err) {
    recordResult('AC29', 'Validation', 'Upload Size Limit Enforcement (HTTP 413)', 'FAIL', err.message);
  }

  // --------------------------------------------------------------------------
  // 9. Load Balancing Across Instances & Legacy Buoi 8 Endpoints
  // --------------------------------------------------------------------------
  console.log('\n--- PHẦN 9: LOAD BALANCING & BUỔI 8 COMPATIBILITY ---');
  try {
    const instancesSeen = new Set();
    for (let i = 0; i < 10; i++) {
      const res = await sendHttpRequest({ path: '/health', headers: { Host: 'shop.local' } });
      const inst = res.headers['x-instance'] || (res.data && res.data.instance);
      if (inst) instancesSeen.add(inst);
    }
    if (instancesSeen.has('backend-1') && instancesSeen.has('backend-2')) {
      recordResult('AC30', 'Load-Balancing', 'Dual Backend Load Balancing (backend-1 & backend-2)', 'PASS', `Instances served: ${Array.from(instancesSeen).join(', ')}`);
    } else {
      recordResult('AC30', 'Load-Balancing', 'Dual Backend Load Balancing (backend-1 & backend-2)', 'FAIL', `Only saw: ${Array.from(instancesSeen).join(', ')}`);
    }
  } catch (err) {
    recordResult('AC30', 'Load-Balancing', 'Dual Backend Load Balancing (backend-1 & backend-2)', 'FAIL', err.message);
  }

  try {
    // Legacy /api/products
    const prodRes = await sendHttpRequest({ path: '/api/products', headers: { Host: 'shop.local' } });
    if (prodRes.statusCode === 200 && Array.isArray(prodRes.data.data)) {
      recordResult('AC31', 'Buoi8-Compat', 'Legacy Products API (/api/products)', 'PASS', `Fetched ${prodRes.data.data.length} products successfully`);
    } else {
      recordResult('AC31', 'Buoi8-Compat', 'Legacy Products API (/api/products)', 'FAIL', `Expected 200 array, got HTTP ${prodRes.statusCode}`);
    }
  } catch (err) {
    recordResult('AC31', 'Buoi8-Compat', 'Legacy Products API (/api/products)', 'FAIL', err.message);
  }

  // --------------------------------------------------------------------------
  // TỔNG KẾT
  // --------------------------------------------------------------------------
  console.log('\n==============================================================================');
  console.log('📊 TỔNG KẾT KẾT QUẢ KIỂM THỬ:');
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  console.log(`   - TỔNG CỘNG: ${results.length} bài test`);
  console.log(`   - PASS     : ${passCount}`);
  console.log(`   - FAIL     : ${failCount}`);
  console.log('==============================================================================\n');

  return { passCount, failCount, total: results.length, results };
}

runTestSuite()
  .then(({ failCount }) => {
    if (failCount > 0) process.exit(1);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
