#!/bin/sh
# lb-test.sh [N=20] – Kiểm tra load balancing qua header X-Instance
# Dùng: bash scripts/lb-test.sh [số_request]
# Dùng --resolve để không cần sửa /etc/hosts

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/common.sh"

N="${1:-20}"
echo "=== Load Balancing Test: ${N} requests đến ${HOST_NAME}/api/instance ==="
echo ""

# Đếm theo instance
declare -A counts 2>/dev/null || true
declare -A counts

SUCCESS=0
FAIL=0

i=1
while [ "$i" -le "$N" ]; do
  RESPONSE=$(curl_shop_http -s -w "\nHTTP_STATUS:%{http_code}\nX_INSTANCE:%{header_x_instance}" \
    "${BASE_URL_HTTP}/api/instance" 2>/dev/null)

  HTTP_STATUS=$(echo "$RESPONSE" | grep "^HTTP_STATUS:" | cut -d: -f2 | tr -d '\r')
  # X-Instance có thể đến từ header trong response
  X_INST=$(curl_shop_http -sI "${BASE_URL_HTTP}/api/instance" 2>/dev/null | \
    grep -i "^x-instance:" | sed 's/^[^:]*: *//' | tr -d '\r')

  if [ -z "$X_INST" ]; then
    # Fallback: lấy từ body JSON
    BODY=$(curl_shop_http -s "${BASE_URL_HTTP}/api/instance" 2>/dev/null)
    X_INST=$(echo "$BODY" | grep -o '"instance":"[^"]*"' | cut -d'"' -f4)
  fi

  if [ "$HTTP_STATUS" = "200" ] && [ -n "$X_INST" ]; then
    # Cộng dồn đếm
    var_name="count_$(echo "$X_INST" | tr '-' '_')"
    OLD_COUNT=$(eval "echo \${$var_name:-0}")
    NEW_COUNT=$((OLD_COUNT + 1))
    eval "$var_name=$NEW_COUNT"
    export "$var_name"
    SUCCESS=$((SUCCESS + 1))
    printf "  Request %3d → %-20s (HTTP %s)\n" "$i" "$X_INST" "$HTTP_STATUS"
  else
    FAIL=$((FAIL + 1))
    printf "  Request %3d → FAIL (HTTP %s)\n" "$i" "${HTTP_STATUS:-?}"
  fi
  i=$((i + 1))
done

echo ""
echo "=== Tóm tắt ==="
echo "Tổng: ${N}  Thành công: ${SUCCESS}  Thất bại: ${FAIL}"
echo ""
echo "Phân phối theo instance:"
# In danh sách instance đã đếm
for var in $(set | grep "^count_" | cut -d= -f1); do
  inst=$(echo "$var" | sed 's/^count_//' | tr '_' '-')
  count=$(eval "echo \$$var")
  pct=$((count * 100 / N))
  printf "  %-20s: %3d/%d (%d%%)\n" "$inst" "$count" "$N" "$pct"
done
echo "=== Xong ==="
