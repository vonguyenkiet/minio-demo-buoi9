#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# MinIO Provisioning Script (Bash) - Buổi 9
# Tác vụ: Khởi tạo Buckets, Bucket Policies và Backend Service Account
# Quyền: Chạy với tư cách Quản trị viên
# ============================================================

echo "============================================================"
echo " [MinIO Provisioning] Khởi tạo hệ thống MinIO Buổi 9"
echo "============================================================"

# 1. Kiểm tra MinIO cluster sẵn sàng
echo "[1/4] Kiểm tra MinIO Cluster Health..."
docker compose exec -T minio mc ready local > /dev/null
echo "   -> MinIO cluster đã sẵn sàng!"

# 2. Khởi tạo demo buckets qua minio-admin
echo "[2/4] Khởi tạo Buckets trong allowlist..."
docker compose run --rm minio-admin node /app/scripts/create-demo-buckets.js

# 3. Thiết lập Bucket Policies
echo "[3/4] Thiết lập Bucket Policies an toàn..."
docker compose run --rm minio-admin node /app/scripts/set-demo-policy.js

# 4. Cấu hình MinIO Service Account cho Backend với Least Privilege
echo "[4/4] Cấu hình MinIO Service Account cho Backend..."
docker cp scripts/backend-service-policy.json minio-demo-buoi9-minio-1:/tmp/backend-service-policy.json

ROOT_USER="${MINIO_ROOT_USER:-buoi9admin}"
ROOT_PASS="${MINIO_ROOT_PASSWORD:-buoi9_minio_root_secret_2026}"
SVC_KEY="${MINIO_BACKEND_ACCESS_KEY:-buoi9_app_svc}"
SVC_SECRET="${MINIO_BACKEND_SECRET_KEY:-Buoi9SvcSecret2026!AppKey}"

docker compose exec -T minio mc alias set minioadmin http://localhost:9000 "$ROOT_USER" "$ROOT_PASS" > /dev/null

if docker compose exec -T minio mc admin user svcacct info minioadmin "$SVC_KEY" > /dev/null 2>&1; then
    echo "   -> Service account '$SVC_KEY' đã tồn tại. Cập nhật policy..."
    docker compose exec -T minio mc admin user svcacct edit minioadmin "$SVC_KEY" --policy /tmp/backend-service-policy.json
else
    echo "   -> Tạo mới service account '$SVC_KEY' với quyền tối thiểu..."
    docker compose exec -T minio mc admin user svcacct add minioadmin "$ROOT_USER" --access-key "$SVC_KEY" --secret-key "$SVC_SECRET" --policy /tmp/backend-service-policy.json
fi

echo "============================================================"
echo " [MinIO Provisioning] Hoàn tất thành công!"
echo "   - Service Account: $SVC_KEY"
echo "   - Policy: Restrict to buoi9-assets, buoi9-assets-archive, product-images"
echo "   - Backend runtime chỉ sử dụng credentials này, không dùng Root."
echo "============================================================"
