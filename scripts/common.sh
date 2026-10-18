#!/bin/sh
# common.sh – Biến và hàm dùng chung cho tất cả script
# source ./scripts/common.sh

# ============================================================
# Cấu hình
# ============================================================
HOST_NAME="${HOST_NAME:-shop.local}"
RESOLVE_IP="${RESOLVE_IP:-127.0.0.1}"
BASE_URL_HTTP="http://${HOST_NAME}"
BASE_URL_HTTPS="https://${HOST_NAME}"

# Màu sắc terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ============================================================
# Hàm tiện ích
# ============================================================

# curl với --resolve để không cần sửa /etc/hosts
# Dùng: curl_shop [options] <path>
# Ví dụ: curl_shop -sI /api/health
curl_shop_http() {
  curl --resolve "${HOST_NAME}:80:${RESOLVE_IP}" "$@"
}

curl_shop_https() {
  curl --resolve "${HOST_NAME}:443:${RESOLVE_IP}" "$@"
}

# In tiêu đề phần
print_header() {
  echo ""
  echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

print_ok() {
  echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
  echo -e "${RED}❌ $1${NC}"
}

print_info() {
  echo -e "${YELLOW}→ $1${NC}"
}

print_warn() {
  echo -e "${CYAN}⚠ $1${NC}"
}

# Lấy header từ response
# get_header <header_name> <response_string>
get_header() {
  echo "$2" | grep -i "^$1:" | sed 's/^[^:]*: *//' | tr -d '\r'
}

# Kiểm tra có jq không
HAS_JQ=false
if command -v jq >/dev/null 2>&1; then
  HAS_JQ=true
fi

format_json() {
  if $HAS_JQ; then
    echo "$1" | jq .
  else
    echo "$1"
  fi
}
