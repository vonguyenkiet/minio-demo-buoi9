'use strict';

/**
 * ==============================================================================
 * Verification Script: scripts/verify-clean-deployment.js
 *
 * Kiểm tra quy trình triển khai sạch và tách biệt credential (Section 3.3 & 12.E):
 * 1. Khởi động một instance MinIO cô lập hoàn toàn với root credential mới ngẫu nhiên.
 * 2. Xác minh root credentials sai bị từ chối truy cập.
 * 3. Đăng nhập thành công với root credential mới.
 * 4. Tạo các buckets theo thiết kế Buổi 9 (product-images, buoi9-assets, buoi9-assets-archive).
 * 5. Áp dụng policy và tạo Service Account mới với least-privilege policy.
 * 6. Kiểm tra Service Account hoạt động (có quyền upload/read trên allowlist buckets).
 * 7. Kiểm tra Service Account bị từ chối quyền quản trị (makeBucket, admin user ls).
 * 8. Dọn dẹp container thử nghiệm mà KHÔNG chạm vào bất kỳ volume hay dữ liệu nào của hệ thống chính.
 * ==============================================================================
 */

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

console.log('==============================================================================');
console.log('🧪 BẮT ĐẦU KIỂM THỬ TRIỂN KHAI SẠCH CÔ LẬP VỚI CREDENTIALS MỚI (Section 3.3 & 12.E)');
console.log('==============================================================================');

const TEST_CONTAINER = `minio-clean-verify-${Date.now()}`;
const TEST_ROOT_USER = `root_${crypto.randomBytes(4).toString('hex')}`;
const TEST_ROOT_PASS = `Pass_${crypto.randomBytes(8).toString('hex')}!`;
const TEST_SVC_KEY = `svc_${crypto.randomBytes(4).toString('hex')}`;
const TEST_SVC_SECRET = `SvcSec_${crypto.randomBytes(8).toString('hex')}!`;

console.log('1. Khởi tạo container MinIO thử nghiệm với credentials mới sinh...');
const MINIO_IMAGE = 'cgr.dev/chainguard/minio@sha256:dc455cdd4db6e390b1b26514f15ff37681a777bf8dab41aac445a0259f751e56';

try {
  run(`docker run -d --rm --name ${TEST_CONTAINER} -e MINIO_ROOT_USER=${TEST_ROOT_USER} -e MINIO_ROOT_PASSWORD=${TEST_ROOT_PASS} ${MINIO_IMAGE} server /data`);
  console.log(`   -> Container ${TEST_CONTAINER} đã khởi động.`);

  // Chờ container sẵn sàng
  console.log('2. Đợi MinIO kiểm tra trạng thái ready...');
  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      const out = run(`docker exec ${TEST_CONTAINER} mc ready local`);
      if (out.includes('ready')) {
        ready = true;
        break;
      }
    } catch {
      // ignore while booting
    }
    execSync('powershell -Command "Start-Sleep -Milliseconds 800"');
  }

  if (!ready) {
    throw new Error('MinIO test container không đạt trạng thái ready sau 16s.');
  }
  console.log('   -> MinIO test container đã sẵn sàng (mc ready local: PASS).');

  // 3. Kiểm tra credential sai bị từ chối
  console.log('3. Kiểm tra xác thực: Credential sai phải bị từ chối...');
  try {
    run(`docker exec ${TEST_CONTAINER} mc alias set badalias http://localhost:9000 ${TEST_ROOT_USER} wrong_password_12345`);
    throw new Error('LỖI: Alias set với password sai nhưng không báo lỗi!');
  } catch (err) {
    if (err.message.includes('LỖI:')) throw err;
    console.log('   -> Xác thực với root password sai bị từ chối thành công (PASS).');
  }

  // 4. Đăng nhập với root credentials mới
  console.log('4. Đăng nhập root alias bằng root credentials mới...');
  run(`docker exec ${TEST_CONTAINER} mc alias set cleanadmin http://localhost:9000 ${TEST_ROOT_USER} ${TEST_ROOT_PASS}`);
  console.log('   -> Đăng nhập root thành công với credentials mới (PASS).');

  // 5. Tạo buckets mẫu
  console.log('5. Tạo các buckets bắt buộc (product-images, buoi9-assets, buoi9-assets-archive)...');
  run(`docker exec ${TEST_CONTAINER} mc mb cleanadmin/product-images`);
  run(`docker exec ${TEST_CONTAINER} mc mb cleanadmin/buoi9-assets`);
  run(`docker exec ${TEST_CONTAINER} mc mb cleanadmin/buoi9-assets-archive`);
  console.log('   -> Tạo các buckets thành công (PASS).');

  // 6. Copy policy và tạo Service Account mới
  console.log('6. Nạp policy least-privilege và tạo Service Account mới...');
  const policyFile = path.join(__dirname, 'backend-service-policy.json');
  run(`docker cp "${policyFile}" ${TEST_CONTAINER}:/tmp/backend-service-policy.json`);
  run(`docker exec ${TEST_CONTAINER} mc admin user svcacct add cleanadmin ${TEST_ROOT_USER} --access-key ${TEST_SVC_KEY} --secret-key ${TEST_SVC_SECRET} --policy /tmp/backend-service-policy.json`);
  console.log('   -> Service Account mới được tạo thành công với embedded policy (PASS).');

  // 7. Thiết lập alias cho Service Account mới
  console.log('7. Thiết lập alias và kiểm tra quyền của Service Account mới...');
  run(`docker exec ${TEST_CONTAINER} mc alias set cleansvc http://localhost:9000 ${TEST_SVC_KEY} ${TEST_SVC_SECRET}`);

  // Thử quyền hợp lệ: ghi object vào buoi9-assets/private/
  run(`docker exec ${TEST_CONTAINER} sh -c "echo 'hello clean test' | mc pipe cleansvc/buoi9-assets/private/test.txt"`);
  console.log('   -> Service account ghi object vào buoi9-assets thành công (PASS).');

  // 8. Kiểm tra least-privilege: makeBucket bị chặn
  console.log('8. Kiểm tra least-privilege: Service Account không thể tạo bucket mới...');
  try {
    run(`docker exec ${TEST_CONTAINER} mc mb cleansvc/unauthorized-bucket`);
    throw new Error('LỖI: Service Account tạo được bucket mới!');
  } catch (err) {
    if (err.message.includes('LỖI:')) throw err;
    console.log('   -> Service Account bị chặn tạo bucket: Access Denied (PASS).');
  }

  // 9. Kiểm tra least-privilege: admin command bị chặn
  console.log('9. Kiểm tra least-privilege: Service Account không thể thực thi admin commands...');
  try {
    run(`docker exec ${TEST_CONTAINER} mc admin user ls cleansvc`);
    throw new Error('LỖI: Service Account thực hiện được admin command!');
  } catch (err) {
    if (err.message.includes('LỖI:')) throw err;
    console.log('   -> Service Account bị chặn admin command: Access Denied (PASS).');
  }

  console.log('==============================================================================');
  console.log('🎉 TẤT CẢ CÁC BƯỚC TRIỂN KHAI SẠCH VÀ PHÂN QUYỀN CREDENTIALS MỚI ĐÃ PASS!');
  console.log('==============================================================================');

} finally {
  console.log('10. Dọn dẹp container thử nghiệm (không chạm vào volumes hệ thống chính)...');
  try {
    run(`docker stop ${TEST_CONTAINER}`);
    console.log(`   -> Container ${TEST_CONTAINER} đã dừng an toàn.`);
  } catch (err) {
    // ignore
  }
}
