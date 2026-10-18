#!/bin/bash
# cors-check.sh – Kiểm tra backend KHÔNG trả header CORS
# Dùng: bash scripts/cors-check.sh
# Kỳ vọng: không có header access-control-*

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/common.sh"

EVIDENCE_DIR="${SCRIPT_DIR}/../docs/evidence"
mkdir -p "$EVIDENCE_DIR"
OUT="${EVIDENCE_DIR}/ac07-cors-check.txt"

echo "=== CORS Check ===" | tee "$OUT"
echo "Thời gian: $(date)" | tee -a "$OUT"
echo "" | tee -a "$OUT"

# 1. Gọi backend trực tiếp với Origin header giả
echo "--- Gọi backend-1 trực tiếp (127.0.0.1:3001) ---" | tee -a "$OUT"
RESP=$(curl -s -i \
  -H "Origin: http://localhost:8081" \
  http://127.0.0.1:3001/api/products 2>/dev/null)

echo "Response headers:" | tee -a "$OUT"
echo "$RESP" | grep -E "^HTTP|access-control|Access-Control|cors|CORS" | tee -a "$OUT"

CORS_HEADERS=$(echo "$RESP" | grep -i "access-control")
if [ -z "$CORS_HEADERS" ]; then
  print_ok "Backend KHÔNG trả header access-control-* (kỳ vọng)" | tee -a "$OUT"
else
  print_warn "Backend trả CORS headers (không mong đợi):" | tee -a "$OUT"
  echo "$CORS_HEADERS" | tee -a "$OUT"
fi

echo "" | tee -a "$OUT"

# 2. Gọi qua NGINX với Origin header
echo "--- Gọi qua NGINX (shop.local/api/products) ---" | tee -a "$OUT"
RESP2=$(curl_shop_http -s -i \
  -H "Origin: http://localhost:8081" \
  "${BASE_URL_HTTP}/api/products" 2>/dev/null)

CORS_HEADERS2=$(echo "$RESP2" | grep -i "access-control")
if [ -z "$CORS_HEADERS2" ]; then
  print_ok "NGINX KHÔNG thêm header access-control-* (kỳ vọng)" | tee -a "$OUT"
else
  print_warn "NGINX thêm CORS headers:" | tee -a "$OUT"
  echo "$CORS_HEADERS2" | tee -a "$OUT"
fi

echo "" | tee -a "$OUT"
echo "Hướng dẫn cross-origin manual (AC-07):" | tee -a "$OUT"
echo "  1. cd nginx-demo-buoi8 && python3 -m http.server 8081 --directory scripts/cors-test" | tee -a "$OUT"
echo "  2. Mở trình duyệt: http://localhost:8081" | tee -a "$OUT"
echo "  3. Quan sát console – kỳ vọng: CORS error (cross-origin bị chặn)" | tee -a "$OUT"
echo "  4. Mở http://shop.local/ → DevTools → cùng origin → thành công" | tee -a "$OUT"
echo "" | tee -a "$OUT"
echo "=== Xong. Xem: ${OUT} ==="
