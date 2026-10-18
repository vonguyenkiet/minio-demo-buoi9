#!/bin/bash
# test-api.sh – Script kiểm tra nhanh toàn bộ API (cập nhật Buổi 8)
# Dùng: bash scripts/test-api.sh
# Đọc header X-Instance; dùng --resolve để không cần /etc/hosts

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/common.sh"

BACKEND_1_DIRECT="http://127.0.0.1:3001"
BACKEND_2_DIRECT="http://127.0.0.1:3002"

# ============================================================
# STEP 1: Health checks trực tiếp
# ============================================================
print_header "STEP 1: Health Checks (trực tiếp)"

for BURL in "$BACKEND_1_DIRECT" "$BACKEND_2_DIRECT"; do
  print_info "Kiểm tra ${BURL}/health ..."
  RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "${BURL}/health")
  STATUS=$(echo "$RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
  BODY=$(echo "$RESP" | grep -v "HTTP_STATUS:")
  if [ "$STATUS" = "200" ]; then
    print_ok "${BURL}/health: HTTP $STATUS"
    format_json "$BODY"
  else
    print_error "${BURL}/health FAILED: HTTP $STATUS"
  fi
done

# ============================================================
# STEP 2: Health qua NGINX (dùng --resolve)
# ============================================================
print_header "STEP 2: Health qua NGINX (5 requests, đọc X-Instance)"

for i in 1 2 3 4 5; do
  X_INST=$(curl_shop_http -sI "${BASE_URL_HTTP}/health" | grep -i "^x-instance:" | sed 's/^[^:]*: *//' | tr -d '\r')
  STATUS=$(curl_shop_http -so /dev/null -w "%{http_code}" "${BASE_URL_HTTP}/health")
  printf "  Request %d → %-20s (HTTP %s)\n" "$i" "${X_INST:-N/A}" "$STATUS"
done

# ============================================================
# STEP 3: GET /api/products qua NGINX
# ============================================================
print_header "STEP 3: GET /api/products"

print_info "Lấy danh sách sản phẩm..."
RESP=$(curl_shop_http -s -w "\nHTTP_STATUS:%{http_code}" "${BASE_URL_HTTP}/api/products")
STATUS=$(echo "$RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESP" | grep -v "HTTP_STATUS:")

if [ "$STATUS" = "200" ]; then
  print_ok "GET /api/products: HTTP $STATUS"
  if $HAS_JQ; then
    COUNT=$(echo "$BODY" | jq '.count')
    print_info "Tổng sản phẩm: $COUNT"
    echo "$BODY" | jq '.data[] | {id, name, category, price}'
  else
    echo "$BODY"
  fi
else
  print_error "GET /api/products FAILED: HTTP $STATUS"
  echo "$BODY"
fi

# ============================================================
# STEP 4: GET /api/products/1
# ============================================================
print_header "STEP 4: GET /api/products/1"

RESP=$(curl_shop_http -s -w "\nHTTP_STATUS:%{http_code}" "${BASE_URL_HTTP}/api/products/1")
STATUS=$(echo "$RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESP" | grep -v "HTTP_STATUS:")
if [ "$STATUS" = "200" ]; then
  print_ok "GET /api/products/1: HTTP $STATUS"
  format_json "$BODY"
else
  print_error "GET /api/products/1 FAILED: HTTP $STATUS"
fi

# ============================================================
# STEP 5: POST /api/products
# ============================================================
print_header "STEP 5: POST /api/products (tạo sản phẩm mới)"

RESP=$(curl_shop_http -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST "${BASE_URL_HTTP}/api/products" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Product Buoi8","description":"Script test","price":9990000,"category":"Demo","stock":5}')
STATUS=$(echo "$RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESP" | grep -v "HTTP_STATUS:")
if [ "$STATUS" = "201" ]; then
  print_ok "POST /api/products: HTTP $STATUS"
  format_json "$BODY"
  if $HAS_JQ; then
    NEW_ID=$(echo "$BODY" | jq '.data.id')
    print_info "New product ID: $NEW_ID"
  fi
else
  print_error "POST /api/products FAILED: HTTP $STATUS"
  echo "$BODY"
fi

# ============================================================
# STEP 6: /api/instance và X-Instance header
# ============================================================
print_header "STEP 6: GET /api/instance (đọc header X-Instance)"

RESP_HDRS=$(curl_shop_http -sI "${BASE_URL_HTTP}/api/instance")
X_INST=$(echo "$RESP_HDRS" | grep -i "^x-instance:" | sed 's/^[^:]*: *//' | tr -d '\r')
BODY=$(curl_shop_http -s "${BASE_URL_HTTP}/api/instance")
print_info "X-Instance header: ${X_INST:-NOT FOUND}"
format_json "$BODY"

# ============================================================
# STEP 7: /api/whoami
# ============================================================
print_header "STEP 7: GET /api/whoami"

BODY=$(curl_shop_http -s "${BASE_URL_HTTP}/api/whoami")
format_json "$BODY"

# ============================================================
# STEP 8: /health/db
# ============================================================
print_header "STEP 8: Database + MinIO Health (/health/db)"

BODY=$(curl_shop_http -s "${BASE_URL_HTTP}/health/db")
format_json "$BODY"

# ============================================================
# STEP 9: Validation và 404
# ============================================================
print_header "STEP 9: Validation (400) và 404"

RESP=$(curl_shop_http -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST "${BASE_URL_HTTP}/api/products" \
  -H "Content-Type: application/json" \
  -d '{"name":"","price":-1}')
STATUS=$(echo "$RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
[ "$STATUS" = "400" ] && print_ok "Validation: HTTP $STATUS" || print_error "Expected 400, got $STATUS"

RESP=$(curl_shop_http -s -w "\nHTTP_STATUS:%{http_code}" "${BASE_URL_HTTP}/api/products/99999")
STATUS=$(echo "$RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
[ "$STATUS" = "404" ] && print_ok "404 sản phẩm: HTTP $STATUS" || print_error "Expected 404, got $STATUS"

# ============================================================
# Summary
# ============================================================
print_header "Hoàn thành"
print_ok "test-api.sh kết thúc."
echo ""
echo "Lệnh thêm:"
echo "  bash scripts/lb-test.sh 20"
echo "  bash scripts/body-limit-test.sh"
echo "  bash scripts/failover-test.sh --auto"
