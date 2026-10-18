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

# 1. Đọc file .env an toàn (không dùng eval, không in secret)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"
if [ ! -f "$ENV_FILE" ]; then
    ENV_FILE=".env"
fi

if [ -f "$ENV_FILE" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
        # Loại bỏ khoảng trắng đầu/cuối
        trimmed="$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
        # Bỏ qua dòng trống hoặc dòng comment
        [[ -z "$trimmed" || "$trimmed" =~ ^# ]] && continue
        if [[ "$trimmed" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
            key="${BASH_REMATCH[1]}"
            val="${BASH_REMATCH[2]}"
            # Xóa dấu nháy bao quanh nếu có
            val="$(echo "$val" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
            # Chỉ gán nếu biến chưa được đặt trong môi trường
            if [ -z "${!key:-}" ]; then
                export "$key"="$val"
            fi
        fi
    done < "$ENV_FILE"
fi

MISSING=""
[ -z "${MINIO_ROOT_USER:-}" ] && MISSING="${MISSING} MINIO_ROOT_USER"
[ -z "${MINIO_ROOT_PASSWORD:-}" ] && MISSING="${MISSING} MINIO_ROOT_PASSWORD"
[ -z "${MINIO_BACKEND_ACCESS_KEY:-}" ] && MISSING="${MISSING} MINIO_BACKEND_ACCESS_KEY"
[ -z "${MINIO_BACKEND_SECRET_KEY:-}" ] && MISSING="${MISSING} MINIO_BACKEND_SECRET_KEY"

if [ -n "$MISSING" ]; then
    echo "[ERROR] Thiếu biến môi trường bắt buộc trong .env:${MISSING}" >&2
    echo "Vui lòng cấu hình đầy đủ file .env từ .env.example." >&2
    exit 1
fi

ROOT_USER="${MINIO_ROOT_USER}"
ROOT_PASS="${MINIO_ROOT_PASSWORD}"
SVC_KEY="${MINIO_BACKEND_ACCESS_KEY}"
SVC_SECRET="${MINIO_BACKEND_SECRET_KEY}"

# 2. Kiểm tra MinIO cluster sẵn sàng
echo "[1/4] Kiểm tra MinIO Cluster Health..."
docker compose exec -T minio mc ready local > /dev/null
echo "   -> MinIO cluster đã sẵn sàng!"

# 3. Khởi tạo demo buckets qua minio-admin
echo "[2/4] Khởi tạo Buckets trong allowlist..."
docker compose run --rm minio-admin node /app/scripts/create-demo-buckets.js

# 4. Thiết lập Bucket Policies
echo "[3/4] Thiết lập Bucket Policies an toàn và xác minh..."
docker compose run --rm minio-admin node /app/scripts/set-demo-policy.js

# 5. Cấu hình MinIO Service Account cho Backend với Least Privilege
echo "[4/4] Cấu hình MinIO Service Account cho Backend..."
# Copy policy JSON dùng tên service compose (không hardcode container name)
docker compose cp scripts/backend-service-policy.json minio:/tmp/backend-service-policy.json

docker compose exec -T minio mc alias set minioadmin http://localhost:9000 "$ROOT_USER" "$ROOT_PASS" > /dev/null

if docker compose exec -T minio mc admin user svcacct info minioadmin "$SVC_KEY" > /dev/null 2>&1; then
    echo "   -> Service account '$SVC_KEY' đã tồn tại. Cập nhật policy..."
    docker compose exec -T minio mc admin user svcacct edit minioadmin "$SVC_KEY" --policy /tmp/backend-service-policy.json > /dev/null
else
    echo "   -> Tạo mới service account '$SVC_KEY' với quyền tối thiểu..."
    docker compose exec -T minio mc admin user svcacct add minioadmin "$ROOT_USER" --access-key "$SVC_KEY" --secret-key "$SVC_SECRET" --policy /tmp/backend-service-policy.json > /dev/null
fi

# Xác minh service account
docker compose exec -T minio mc admin user svcacct info minioadmin "$SVC_KEY" > /dev/null
echo "============================================================"
echo " [MinIO Provisioning] Hoàn tất thành công!"
echo "   - Service Account: $SVC_KEY (Verified ON)"
echo "   - Policy: Restrict to buoi9-assets, buoi9-assets-archive, product-images"
echo "   - Backend runtime chỉ sử dụng credentials này, không dùng Root."
echo "============================================================"
