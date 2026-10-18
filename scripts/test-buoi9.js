'use strict';

/**
 * test-buoi9.js
 * Kịch bản kiểm thử tự động toàn diện cho Buổi 9: MinIO / Object Storage S3
 * Chạy bên trong container minio-admin hoặc backend (kết nối nội bộ)
 */

const Minio = require('minio');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const endpoint = process.env.MINIO_ENDPOINT || 'minio';
const port = parseInt(process.env.MINIO_PORT, 10) || 9000;
const rootUser = process.env.MINIO_ROOT_USER || 'buoi9admin';
const rootPassword = process.env.MINIO_ROOT_PASSWORD || 'buoi9_minio_root_secret_2026';
const region = process.env.MINIO_REGION || 'us-east-1';

// Client nội bộ với MinIO
const s3Client = new Minio.Client({
  endPoint: endpoint,
  port,
  useSSL: false,
  accessKey: rootUser,
  secretKey: rootPassword,
  region,
});

// Client ký presigned URL công khai
const publicSigningClient = new Minio.Client({
  endPoint: 'minio.shop.local',
  port: 80,
  useSSL: false,
  accessKey: rootUser,
  secretKey: rootPassword,
  region,
});

const results = [];

function record(name, status, details) {
  results.push({ name, status, details });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${status}] ${name}${details ? ': ' + details : ''}`);
}

// Helper gửi HTTP request qua NGINX (IP 172... hoặc tên service nginx trong Docker network)
function requestNginx(path, hostHeader, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'nginx',
        port: 80,
        path,
        method: options.method || 'GET',
        headers: {
          Host: hostHeader,
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
      }
    );
    req.on('error', (err) => reject(err));
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG BUỔI 9: MINIO / OBJECT STORAGE S3');
  console.log('====================================================\n');

  const bucketMain = 'buoi9-assets';
  const bucketArchive = 'buoi9-assets-archive';

  // 1. Kiểm tra 2 Bucket demo tồn tại
  try {
    const existMain = await s3Client.bucketExists(bucketMain);
    const existArchive = await s3Client.bucketExists(bucketArchive);
    if (existMain && existArchive) {
      record('1. Kiểm tra 2 Bucket demo tồn tại', 'PASS', `${bucketMain} & ${bucketArchive} tồn tại`);
    } else {
      record('1. Kiểm tra 2 Bucket demo tồn tại', 'FAIL', `Main: ${existMain}, Archive: ${existArchive}`);
    }
  } catch (err) {
    record('1. Kiểm tra 2 Bucket demo tồn tại', 'FAIL', err.message);
  }

  // 2. Upload Avatar mẫu (private)
  const avatarKey = 'avatars/test-avatar.svg';
  const avatarContent = '<svg><circle cx="50" cy="50" r="40" fill="purple"/></svg>';
  try {
    await s3Client.putObject(bucketMain, avatarKey, Buffer.from(avatarContent), avatarContent.length, {
      'Content-Type': 'image/svg+xml',
    });
    const stat = await s3Client.statObject(bucketMain, avatarKey);
    record('2. Upload Avatar mẫu (prefix avatars/)', 'PASS', `Size: ${stat.size} bytes`);
  } catch (err) {
    record('2. Upload Avatar mẫu (prefix avatars/)', 'FAIL', err.message);
  }

  // 3. Upload Tài liệu PDF mẫu (private)
  const docKey = 'documents/test-doc.pdf';
  const docContent = '%PDF-1.4 test document content for buoi 9';
  try {
    await s3Client.putObject(bucketMain, docKey, Buffer.from(docContent), docContent.length, {
      'Content-Type': 'application/pdf',
    });
    const stat = await s3Client.statObject(bucketMain, docKey);
    record('3. Upload Tài liệu PDF mẫu (prefix documents/)', 'PASS', `Size: ${stat.size} bytes`);
  } catch (err) {
    record('3. Upload Tài liệu PDF mẫu (prefix documents/)', 'FAIL', err.message);
  }

  // 4. Upload Object Public
  const publicKey = 'public/test-public.txt';
  const publicContent = 'Public message readable anonymously without signature';
  try {
    await s3Client.putObject(bucketMain, publicKey, Buffer.from(publicContent), publicContent.length, {
      'Content-Type': 'text/plain',
    });
    record('4. Upload Object Public (prefix public/)', 'PASS', `Key: ${publicKey}`);
  } catch (err) {
    record('4. Upload Object Public (prefix public/)', 'FAIL', err.message);
  }

  // 5. Upload Object Private
  const privateKey = 'private/test-private.txt';
  const privateContent = 'Confidential message requiring Presigned URL';
  try {
    await s3Client.putObject(bucketMain, privateKey, Buffer.from(privateContent), privateContent.length, {
      'Content-Type': 'text/plain',
    });
    record('5. Upload Object Private (prefix private/)', 'PASS', `Key: ${privateKey}`);
  } catch (err) {
    record('5. Upload Object Private (prefix private/)', 'FAIL', err.message);
  }

  // 6. Liệt kê objects trong bucket
  try {
    let count = 0;
    const stream = s3Client.listObjectsV2(bucketMain, '', true);
    await new Promise((resolve, reject) => {
      stream.on('data', () => count++);
      stream.on('error', reject);
      stream.on('end', resolve);
    });
    if (count >= 4) {
      record('6. Liệt kê objects trong bucket', 'PASS', `Tìm thấy ${count} objects trong ${bucketMain}`);
    } else {
      record('6. Liệt kê objects trong bucket', 'FAIL', `Chỉ tìm thấy ${count} objects`);
    }
  } catch (err) {
    record('6. Liệt kê objects trong bucket', 'FAIL', err.message);
  }

  // 7. Anonymous đọc file trong public/ qua NGINX (phải thành công HTTP 200)
  try {
    const res = await requestNginx(`/${bucketMain}/${publicKey}`, 'minio.shop.local');
    if (res.statusCode === 200 && res.body.includes('Public message')) {
      record('7. Anonymous đọc object trong public/ qua NGINX', 'PASS', `HTTP 200 OK - Nội dung khớp`);
    } else {
      record('7. Anonymous đọc object trong public/ qua NGINX', 'FAIL', `HTTP ${res.statusCode} - Body: ${res.body}`);
    }
  } catch (err) {
    record('7. Anonymous đọc object trong public/ qua NGINX', 'FAIL', err.message);
  }

  // 8. Anonymous đọc file trong private/ qua NGINX (phải bị từ chối HTTP 403)
  try {
    const res = await requestNginx(`/${bucketMain}/${privateKey}`, 'minio.shop.local');
    if (res.statusCode === 403) {
      record('8. Anonymous đọc object trong private/ qua NGINX', 'PASS', `HTTP 403 Forbidden - Bị chặn đúng chính sách`);
    } else {
      record('8. Anonymous đọc object trong private/ qua NGINX', 'FAIL', `Mong đợi 403 nhưng nhận HTTP ${res.statusCode}`);
    }
  } catch (err) {
    record('8. Anonymous đọc object trong private/ qua NGINX', 'FAIL', err.message);
  }

  // 9. Anonymous đọc avatar / documents qua NGINX (phải bị từ chối HTTP 403)
  try {
    const res1 = await requestNginx(`/${bucketMain}/${avatarKey}`, 'minio.shop.local');
    const res2 = await requestNginx(`/${bucketMain}/${docKey}`, 'minio.shop.local');
    if (res1.statusCode === 403 && res2.statusCode === 403) {
      record('9. Anonymous đọc avatars/ và documents/ qua NGINX', 'PASS', `HTTP 403 Forbidden cho cả hai`);
    } else {
      record('9. Anonymous đọc avatars/ và documents/ qua NGINX', 'FAIL', `Avatar: ${res1.statusCode}, Doc: ${res2.statusCode}`);
    }
  } catch (err) {
    record('9. Anonymous đọc avatars/ và documents/ qua NGINX', 'FAIL', err.message);
  }

  // 10. Anonymous List Bucket qua NGINX (phải bị từ chối HTTP 403)
  try {
    const res = await requestNginx(`/${bucketMain}`, 'minio.shop.local');
    if (res.statusCode === 403) {
      record('10. Anonymous List Bucket qua NGINX', 'PASS', `HTTP 403 Forbidden - Không thể xem danh sách bucket`);
    } else {
      record('10. Anonymous List Bucket qua NGINX', 'FAIL', `Nhận HTTP ${res.statusCode}`);
    }
  } catch (err) {
    record('10. Anonymous List Bucket qua NGINX', 'FAIL', err.message);
  }

  // 11. Presigned URL hợp lệ cho object private qua NGINX (phải thành công HTTP 200)
  try {
    const presignedUrl = await publicSigningClient.presignedGetObject(bucketMain, privateKey, 300);
    const parsed = new URL(presignedUrl);
    const pathAndQuery = parsed.pathname + parsed.search;

    const res = await requestNginx(pathAndQuery, 'minio.shop.local');
    if (res.statusCode === 200 && res.body.includes('Confidential message')) {
      record('11. Presigned URL hợp lệ cho object private qua NGINX', 'PASS', `HTTP 200 OK - Tải dữ liệu mật thành công`);
    } else {
      record('11. Presigned URL hợp lệ cho object private qua NGINX', 'FAIL', `HTTP ${res.statusCode} - Body: ${res.body}`);
    }
  } catch (err) {
    record('11. Presigned URL hợp lệ cho object private qua NGINX', 'FAIL', err.message);
  }

  // 12. Presigned URL với chữ ký bị sửa đổi (phải bị từ chối HTTP 403 SignatureDoesNotMatch)
  try {
    const presignedUrl = await publicSigningClient.presignedGetObject(bucketMain, privateKey, 300);
    const parsed = new URL(presignedUrl);
    // Thay đổi chữ ký
    const tamperedSearch = parsed.search.replace(/X-Amz-Signature=[a-f0-9]{8}/, 'X-Amz-Signature=ffffffff');
    const pathAndQuery = parsed.pathname + tamperedSearch;

    const res = await requestNginx(pathAndQuery, 'minio.shop.local');
    if (res.statusCode === 403 && res.body.includes('SignatureDoesNotMatch')) {
      record('12. Presigned URL bị sai chữ ký', 'PASS', `HTTP 403 SignatureDoesNotMatch - MinIO phát hiện giả mạo`);
    } else {
      record('12. Presigned URL bị sai chữ ký', 'FAIL', `Nhận HTTP ${res.statusCode} - Body: ${res.body}`);
    }
  } catch (err) {
    record('12. Presigned URL bị sai chữ ký', 'FAIL', err.message);
  }

  // 13. Rename object trong cùng bucket (copy -> verify -> delete)
  const renamedKey = 'documents/test-doc-renamed.pdf';
  try {
    // Copy
    await s3Client.copyObject(bucketMain, renamedKey, `/${bucketMain}/${encodeURI(docKey)}`);
    // Verify target
    const targetStat = await s3Client.statObject(bucketMain, renamedKey);
    // Delete source
    await s3Client.removeObject(bucketMain, docKey);

    // Verify source no longer exists
    let sourceExists = true;
    try {
      await s3Client.statObject(bucketMain, docKey);
    } catch (e) {
      sourceExists = false;
    }

    if (targetStat.size > 0 && !sourceExists) {
      record('13. Rename object trong cùng bucket', 'PASS', `Đã đổi ${docKey} -> ${renamedKey}`);
    } else {
      record('13. Rename object trong cùng bucket', 'FAIL', `Target size: ${targetStat.size}, sourceExists: ${sourceExists}`);
    }
  } catch (err) {
    record('13. Rename object trong cùng bucket', 'FAIL', err.message);
  }

  // 14. Move object sang bucket khác (buoi9-assets -> buoi9-assets-archive)
  try {
    const archiveKey = 'avatars/archived-avatar.svg';
    // Copy sang archive
    await s3Client.copyObject(bucketArchive, archiveKey, `/${bucketMain}/${encodeURI(avatarKey)}`);
    // Verify target
    const archiveStat = await s3Client.statObject(bucketArchive, archiveKey);
    // Delete source
    await s3Client.removeObject(bucketMain, avatarKey);

    // Verify source no longer exists
    let sourceExists = true;
    try {
      await s3Client.statObject(bucketMain, avatarKey);
    } catch (e) {
      sourceExists = false;
    }

    if (archiveStat.size > 0 && !sourceExists) {
      record('14. Move object giữa 2 bucket demo', 'PASS', `Đã chuyển sang ${bucketArchive}/${archiveKey}`);
    } else {
      record('14. Move object giữa 2 bucket demo', 'FAIL', `Archive size: ${archiveStat.size}, sourceExists: ${sourceExists}`);
    }
  } catch (err) {
    record('14. Move object giữa 2 bucket demo', 'FAIL', err.message);
  }

  // 15. Delete object
  try {
    await s3Client.removeObject(bucketMain, publicKey);
    let publicExists = true;
    try {
      await s3Client.statObject(bucketMain, publicKey);
    } catch (e) {
      publicExists = false;
    }

    if (!publicExists) {
      record('15. Xóa object khỏi bucket', 'PASS', `Object ${publicKey} đã được xóa sạch`);
    } else {
      record('15. Xóa object khỏi bucket', 'FAIL', `Object vẫn còn tồn tại`);
    }
  } catch (err) {
    record('15. Xóa object khỏi bucket', 'FAIL', err.message);
  }

  // 16. Kế thừa luồng sản phẩm Buổi 8
  try {
    const res = await requestNginx('/api/products', 'shop.local');
    if (res.statusCode === 200 && res.body.includes('"success":true')) {
      record('16. Kế thừa API sản phẩm Buổi 8 (/api/products)', 'PASS', `HTTP 200 OK - Danh sách sản phẩm hoạt động`);
    } else {
      record('16. Kế thừa API sản phẩm Buổi 8 (/api/products)', 'FAIL', `HTTP ${res.statusCode} - Body: ${res.body}`);
    }
  } catch (err) {
    record('16. Kế thừa API sản phẩm Buổi 8 (/api/products)', 'FAIL', err.message);
  }

  console.log('\n====================================================');
  console.log('TỔNG HỢP KẾT QUẢ KIỂM THỬ:');
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  console.log(`PASS: ${passCount} / ${results.length}`);
  console.log(`FAIL: ${failCount} / ${results.length}`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
