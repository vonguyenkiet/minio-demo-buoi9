#!/bin/bash
# failover-test.sh [--auto] – Kiểm tra failover khi dừng backend-1
# Dùng: bash scripts/failover-test.sh [--auto]
# --auto: tự động dừng backend-1 sau 10 giây, khởi động lại sau 30 giây

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/common.sh"

AUTO_MODE=false
[ "$1" = "--auto" ] && AUTO_MODE=true

LOG_FILE="${SCRIPT_DIR}/../docs/evidence/failover-$(date +%H%M%S).log"
mkdir -p "$(dirname "$LOG_FILE")"

echo "=== Failover Test ===" | tee "$LOG_FILE"
echo "Log: $LOG_FILE"
echo "Mode: $([ $AUTO_MODE = true ] && echo AUTO || echo MANUAL)"
echo ""

ERRORS=0
MAX_DELAY=0
FIRST_ERROR_TIME=""
LAST_ERROR_TIME=""
STOP_TIME=""

monitor_loop() {
  while true; do
    NOW=$(date +%H:%M:%S)
    RESULT=$(curl_shop_http -s -w "\n%{http_code}\n%{time_total}" \
      --connect-timeout 3 --max-time 5 \
      "${BASE_URL_HTTP}/api/instance" 2>/dev/null)

    BODY=$(echo "$RESULT" | head -1)
    STATUS=$(echo "$RESULT" | sed -n '2p' | tr -d '\r')
    TIME_TOTAL=$(echo "$RESULT" | sed -n '3p' | tr -d '\r')
    X_INST=$(echo "$BODY" | grep -o '"instance":"[^"]*"' | cut -d'"' -f4)

    LINE="${NOW} | HTTP:${STATUS:-?} | inst:${X_INST:-?} | time:${TIME_TOTAL}s"
    echo "$LINE" | tee -a "$LOG_FILE"

    if [ "$STATUS" != "200" ]; then
      ERRORS=$((ERRORS + 1))
      [ -z "$FIRST_ERROR_TIME" ] && FIRST_ERROR_TIME="$NOW"
      LAST_ERROR_TIME="$NOW"
    fi

    # So sánh delay lớn nhất (cần bc hoặc awk)
    if command -v awk >/dev/null 2>&1; then
      IS_LARGER=$(echo "$TIME_TOTAL $MAX_DELAY" | awk '{print ($1 > $2) ? "yes" : "no"}')
      [ "$IS_LARGER" = "yes" ] && MAX_DELAY="$TIME_TOTAL"
    fi

    sleep 0.5
  done
}

if $AUTO_MODE; then
  # Xác nhận project là nginx-demo-buoi8 trước khi chạy auto
  PROJECT_NAME=$(docker compose ls -q 2>/dev/null | grep -x 'nginx-demo-buoi8')
  if [ -z "$PROJECT_NAME" ]; then
    echo "❌ Lỗi: Project 'nginx-demo-buoi8' chưa chạy hoặc không tìm thấy!"
    exit 1
  fi

  # trap đảm bảo backend-1 được start lại khi script kết thúc hoặc bị ngắt
  cleanup() {
    echo ">>> Cleanup: Khởi động lại backend-1..."
    [ -n "$MONITOR_PID" ] && kill $MONITOR_PID 2>/dev/null
    docker compose start backend-1 2>/dev/null || true
  }
  trap cleanup EXIT INT TERM

  echo "AUTO: Bắt đầu monitor 10 giây..."
  monitor_loop &
  MONITOR_PID=$!

  sleep 10
  STOP_TIME=$(date +%H:%M:%S)
  echo "" | tee -a "$LOG_FILE"
  echo ">>> AUTO: Dừng backend-1 lúc $STOP_TIME" | tee -a "$LOG_FILE"
  docker compose stop backend-1 2>&1 | tee -a "$LOG_FILE"

  sleep 30
  echo ">>> AUTO: Khởi động backend-1 lại lúc $(date +%H:%M:%S)" | tee -a "$LOG_FILE"
  docker compose start backend-1 2>&1 | tee -a "$LOG_FILE"

  sleep 30
  kill $MONITOR_PID 2>/dev/null
  wait $MONITOR_PID 2>/dev/null

  echo "" | tee -a "$LOG_FILE"
  echo "=== Kết quả ===" | tee -a "$LOG_FILE"
  echo "Số lỗi: $ERRORS" | tee -a "$LOG_FILE"
  echo "Delay lớn nhất: ${MAX_DELAY}s" | tee -a "$LOG_FILE"
  echo "Thời điểm dừng backend: $STOP_TIME" | tee -a "$LOG_FILE"
  echo "Lỗi đầu tiên: ${FIRST_ERROR_TIME:-N/A}" | tee -a "$LOG_FILE"
  echo "Lỗi cuối cùng: ${LAST_ERROR_TIME:-N/A}" | tee -a "$LOG_FILE"
  echo "" | tee -a "$LOG_FILE"
  echo "Lưu ý: Không phải HA hoàn chỉnh. Trong window dừng backend-1," | tee -a "$LOG_FILE"
  echo "NGINX round-robin vẫn gửi request đến backend-1 cho đến khi" | tee -a "$LOG_FILE"
  echo "upstream health check phát hiện (passive). Số lỗi phụ thuộc" | tee -a "$LOG_FILE"
  echo "vào cấu hình max_fails/fail_timeout (mặc định: 1 fail / 10s)." | tee -a "$LOG_FILE"
else
  echo "MANUAL mode: Nhấn Ctrl+C để dừng monitor"
  echo "Hướng dẫn:"
  echo "  1. Xem output bên dưới"
  echo "  2. Mở terminal khác: docker compose stop backend-1"
  echo "  3. Quan sát lỗi"
  echo "  4. docker compose start backend-1"
  echo ""
  monitor_loop
fi
