#!/bin/bash
# pp-variants-test.sh – So sánh 4 biến thể proxy_pass (stage 03 DEMO)
# Dùng: bash scripts/pp-variants-test.sh
# Yêu cầu: stage 03 đang chạy (có các location /pp/*)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/common.sh"

EVIDENCE_DIR="${SCRIPT_DIR}/../docs/evidence"
mkdir -p "$EVIDENCE_DIR"

OUT="${EVIDENCE_DIR}/ac05-pp-variants.txt"
echo "=== proxy_pass Variants Test ===" | tee "$OUT"
echo "Thời gian: $(date)" | tee -a "$OUT"
echo "" | tee -a "$OUT"
echo "Lý thuyết:" | tee -a "$OUT"
echo "  /pp/nouri/ → http://backend_pool        → backend nhận path đầy đủ" | tee -a "$OUT"
echo "  /pp/slash/ → http://backend_pool/        → backend nhận phần sau prefix" | tee -a "$OUT"
echo "  /pp/apiuri/→ http://backend_pool/api/    → backend nhận /api/ + phần sau" | tee -a "$OUT"
echo "  /pp/bad    → http://backend_pool/        → backend nhận //... (double slash)" | tee -a "$OUT"
echo "" | tee -a "$OUT"

test_variant() {
  LABEL=$1
  PATH_REQ=$2
  GIATHIET=$3

  RAW_RESP=$(curl_shop_http -s -w "\nHTTP_STATUS:%{http_code}" \
    "${BASE_URL_HTTP}${PATH_REQ}" 2>/dev/null)
  STATUS=$(echo "$RAW_RESP" | grep "^HTTP_STATUS:" | cut -d: -f2 | tr -d '\r')
  BODY=$(echo "$RAW_RESP" | grep -v "^HTTP_STATUS:")

  # Trích xuất path từ JSON (jq -> python3 -> node)
  EXTRACT_INFO=""
  if command -v jq >/dev/null 2>&1; then
    EXTRACT_INFO=$(echo "$BODY" | jq -r 'if .path then "OK:" + .path elif .message then "OK:" + (.message | capture("Route\\s+\\w+\\s+(?<p>\\S+)\\s+not found")?.p // .message) else "OK:JSON-KHONG-CO-PATH" end' 2>/dev/null || echo "ERR:$(echo "$BODY" | head -c 80)")
  elif command -v python3 >/dev/null 2>&1 && python3 -c "import sys" 2>/dev/null; then
    EXTRACT_INFO=$(python3 -c '
import sys, json, re
body = sys.stdin.read().strip()
try:
    data = json.loads(body)
    if "path" in data:
        print("OK:" + str(data["path"]))
    elif "message" in data:
        m = re.search(r"Route\s+\w+\s+(\S+)\s+not found", str(data["message"]))
        if m:
            print("OK:" + m.group(1))
        else:
            print("OK:" + str(data["message"]))
    else:
        print("OK:JSON-KHONG-CO-PATH")
except Exception:
    print("ERR:" + body[:80])
' <<< "$BODY" 2>/dev/null)
  elif command -v node >/dev/null 2>&1; then
    EXTRACT_INFO=$(node -e '
let body = "";
process.stdin.on("data", c => body += c);
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(body.trim());
    if (data.path) console.log("OK:" + data.path);
    else if (data.message) {
      const m = data.message.match(/Route\s+\w+\s+(\S+)\s+not found/);
      if (m) console.log("OK:" + m[1]);
      else console.log("OK:" + data.message);
    } else console.log("OK:JSON-KHONG-CO-PATH");
  } catch (e) {
    console.log("ERR:" + body.trim().slice(0, 80));
  }
});
' <<< "$BODY" 2>/dev/null)
  fi

  RECV_PATH=""
  if echo "$EXTRACT_INFO" | grep -q "^OK:"; then
    RECV_PATH=$(echo "$EXTRACT_INFO" | sed 's/^OK://')
  else
    RAW_SNIPPET=$(echo "$EXTRACT_INFO" | sed 's/^ERR://')
    RECV_PATH="không trích xuất được (body: ${RAW_SNIPPET})"
  fi

  echo "--- ${LABEL} ---" | tee -a "$OUT"
  echo "Request:         ${PATH_REQ}" | tee -a "$OUT"
  echo "Giả thuyết:      ${GIATHIET}" | tee -a "$OUT"
  echo "HTTP Status:     ${STATUS}" | tee -a "$OUT"
  echo "Path backend:    ${RECV_PATH}" | tee -a "$OUT"
  echo "Body (80 ký):    $(echo "$BODY" | head -c 80)" | tee -a "$OUT"
  echo "" | tee -a "$OUT"
}

# Variant A: không có URI sau upstream → backend nhận path đầy đủ
test_variant "A: /pp/nouri/ (no URI)" \
  "/pp/nouri/api/whoami" \
  "/pp/nouri/api/whoami"

# Variant B: URI là "/" → strip prefix
test_variant "B: /pp/slash/ (URI=/)" \
  "/pp/slash/api/whoami" \
  "/api/whoami"

# Variant C: URI là "/api/" → rewrite
test_variant "C: /pp/apiuri/ (URI=/api/)" \
  "/pp/apiuri/whoami" \
  "/api/whoami"

# Variant D: location không có "/" cuối + URI "/" → double slash
test_variant "D: /pp/bad (no trailing /)" \
  "/pp/bad/api/whoami" \
  "//api/whoami"

echo "=== Xong. Xem: ${OUT} ==="
