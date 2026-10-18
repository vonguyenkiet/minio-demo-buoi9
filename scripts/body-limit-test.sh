#!/bin/bash
# body-limit-test.sh – Ma trận kiểm tra giới hạn body NGINX vs Backend
# Dùng: bash scripts/body-limit-test.sh
# Cần: curl, dd hoặc head -c

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/common.sh"

PROJECT_DIR="$(cd "$(dirname "$0")/.." && ((pwd -W 2>/dev/null) || pwd))"
EVIDENCE_DIR="${PROJECT_DIR}/docs/evidence"
mkdir -p "$EVIDENCE_DIR"

TMP_DIR="${PROJECT_DIR}/.tmp-body-test-$$"
mkdir -p "$TMP_DIR"
trap "rm -rf '$TMP_DIR'" EXIT

echo "=== Body Limit Test ===" | tee "${EVIDENCE_DIR}/ac15-body-limit.txt"
echo "Thời gian: $(date)" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"
echo "" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"

# Tạo file test
create_file() {
  SIZE_MB=$1
  FILE="${TMP_DIR}/${SIZE_MB}m.bin"
  if command -v dd >/dev/null 2>&1; then
    dd if=/dev/urandom of="$FILE" bs=1M count="$SIZE_MB" 2>/dev/null
  else
    # Fallback với Python
    python3 -c "import os; open('$FILE', 'wb').write(os.urandom(${SIZE_MB}*1024*1024))"
  fi
  echo "$FILE"
}

test_upload() {
  SIZE_MB=$1
  STAGE=$2
  FILE=$3

  echo "" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"
  echo "--- Test: ${SIZE_MB} MiB | Stage: ${STAGE} ---" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"

  RESP=$(curl_shop_http -s -i --max-time 30 \
    -X POST "${BASE_URL_HTTP}/api/upload-test" \
    -H "Content-Type: application/octet-stream" \
    --data-binary "@${FILE}" 2>/dev/null)

  STATUS=$(echo "$RESP" | grep "^HTTP/" | tail -1 | awk '{print $2}')
  SERVER=$(echo "$RESP" | grep -i "^server:" | sed 's/^[^:]*: *//' | tr -d '\r')
  X_INST=$(echo "$RESP" | grep -i "^x-instance:" | sed 's/^[^:]*: *//' | tr -d '\r')
  BODY=$(echo "$RESP" | tail -20)
  BODY_SHORT=$(echo "$BODY" | head -c 80)

  echo "Kích thước: ${SIZE_MB} MiB" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"
  echo "HTTP Status: ${STATUS}" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"
  echo "Server: ${SERVER}" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"
  echo "X-Instance: ${X_INST:-KHÔNG CÓ}" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"
  echo "Body (80 ký tự đầu): ${BODY_SHORT}" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"

  # Phán đoán nguồn 413
  if [ "$STATUS" = "413" ]; then
    if echo "$BODY" | grep -q '"source":"backend"'; then
      echo "Kết luận: 413 từ BACKEND (JSON có source:backend + X-Instance có)" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"
    elif echo "$BODY" | grep -qi "<html"; then
      echo "Kết luận: 413 từ NGINX (HTML, không có X-Instance)" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"
    else
      echo "Kết luận: 413 – cần kiểm tra body để xác định nguồn" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"
    fi
  elif [ "$STATUS" = "200" ]; then
    echo "Kết luận: 200 OK – nằm trong giới hạn" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"
  fi
}

# Tạo file test
print_header "Tạo file test..."
FILE_2M=$(create_file 2)
FILE_6M=$(create_file 6)
FILE_25M=$(create_file 25)
print_ok "Tạo xong: 2MiB, 6MiB, 25MiB"

print_header "Vui lòng chỉ định stage hiện tại:"
echo "  Stage 03 (mặc định 1m NGINX): client_max_body_size không đặt"
echo "  Stage 04 (NGINX 20m): client_max_body_size 20m trong /api/"
echo ""
echo "Test sẽ chạy với cấu hình hiện tại..."
echo ""

# Ma trận test (stage phụ thuộc vào cấu hình đang chạy)
CURRENT_STAGE=$(curl_shop_http -s "${BASE_URL_HTTP}/nginx-health" | grep -o '"stage":"[^"]*"' | cut -d'"' -f4)
echo "Stage đang chạy: ${CURRENT_STAGE:-không xác định}" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"

test_upload 2 "$CURRENT_STAGE" "$FILE_2M"
test_upload 6 "$CURRENT_STAGE" "$FILE_6M"
test_upload 25 "$CURRENT_STAGE" "$FILE_25M"

# Test upload ảnh >5 MiB vào /api/products/1/image (multipart)
echo "" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"
echo "--- Test upload ảnh >5 MiB vào /api/products/1/image ---" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"
RESP=$(curl_shop_http -s -i --max-time 30 \
  -X POST "${BASE_URL_HTTP}/api/products/1/image" \
  -F "image=@${FILE_6M};type=image/png" 2>/dev/null)
STATUS=$(echo "$RESP" | grep "^HTTP/" | tail -1 | awk '{print $2}')
X_INST=$(echo "$RESP" | grep -i "^x-instance:" | sed 's/^[^:]*: *//' | tr -d '\r')
BODY=$(echo "$RESP" | tail -5)
echo "HTTP Status: ${STATUS}" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"
echo "X-Instance: ${X_INST:-KHÔNG CÓ}" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"
echo "Body: ${BODY}" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"
if [ "$STATUS" = "413" ] && [ -n "$X_INST" ]; then
  print_ok "Upload ảnh >5MiB: 413 từ backend (có X-Instance – multer LIMIT_FILE_SIZE)"
else
  print_warn "Upload ảnh >5MiB: HTTP $STATUS (kiểm tra log để xác định nguồn)"
fi

echo "" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"
echo "=== Xong. Xem chi tiết: ${EVIDENCE_DIR}/ac15-body-limit.txt ===" | tee -a "${EVIDENCE_DIR}/ac15-body-limit.txt"
