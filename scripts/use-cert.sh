#!/bin/bash
# use-cert.sh <selfsigned|ca> [docker|native]
# Sao chép cặp chứng chỉ vào active/ (docker) hoặc /etc/nginx/certs/ (native)
# Không bao giờ sao chép rootCA.key
# Dùng: bash scripts/use-cert.sh selfsigned docker
#        bash scripts/use-cert.sh ca docker
#        bash scripts/use-cert.sh ca native   (yêu cầu sudo)

get_pwd() {
  (pwd -W 2>/dev/null) || pwd
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && get_pwd)"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && get_pwd)"
CERTS_DIR="${PROJECT_DIR}/certs"

CERT_TYPE="${1:-selfsigned}"
ENV_TYPE="${2:-docker}"

# Validate tham số
if [ "$CERT_TYPE" != "selfsigned" ] && [ "$CERT_TYPE" != "ca" ]; then
  echo "Dùng: $0 <selfsigned|ca> [docker|native]"
  exit 1
fi

if [ "$CERT_TYPE" = "selfsigned" ]; then
  SRC_CRT="${CERTS_DIR}/selfsigned/shop.local.crt"
  SRC_KEY="${CERTS_DIR}/selfsigned/shop.local.key"
else
  SRC_CRT="${CERTS_DIR}/ca/shop.local.crt"
  SRC_KEY="${CERTS_DIR}/ca/shop.local.key"
fi

# Kiểm tra file nguồn
if [ ! -f "$SRC_CRT" ] || [ ! -f "$SRC_KEY" ]; then
  echo "❌ Không tìm thấy chứng chỉ: ${SRC_CRT} hoặc ${SRC_KEY}"
  echo "   Chạy: bash scripts/gen-certs.sh"
  exit 1
fi

if [ "$ENV_TYPE" = "docker" ]; then
  DEST_DIR="${CERTS_DIR}/active"
  mkdir -p "$DEST_DIR"
  cp "$SRC_CRT" "${DEST_DIR}/shop.local.crt"
  cp "$SRC_KEY"  "${DEST_DIR}/shop.local.key"
  chmod 600 "${DEST_DIR}/shop.local.key"
  echo "✅ Đã sao chép vào certs/active/"
  echo "   Loại: ${CERT_TYPE}"
  echo ""
  echo "Bước tiếp theo:"
  echo "  NGINX_STAGE=05-https docker compose up -d --force-recreate nginx"
  echo "  docker compose exec nginx nginx -t"
elif [ "$ENV_TYPE" = "native" ]; then
  DEST_DIR="/etc/nginx/certs"
  echo "→ Sao chép vào ${DEST_DIR}/ (cần sudo)..."
  sudo mkdir -p "$DEST_DIR"
  sudo cp "$SRC_CRT" "${DEST_DIR}/shop.local.crt"
  sudo cp "$SRC_KEY"  "${DEST_DIR}/shop.local.key"
  sudo chmod 600 "${DEST_DIR}/shop.local.key"
  echo "✅ Đã sao chép vào ${DEST_DIR}/"
  echo "→ Reload NGINX..."
  sudo nginx -t && sudo systemctl reload nginx 2>/dev/null || sudo service nginx reload
else
  echo "❌ Môi trường không hợp lệ: ${ENV_TYPE}"
  echo "   Dùng: docker hoặc native"
  exit 1
fi
