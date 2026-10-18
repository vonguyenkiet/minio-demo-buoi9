#!/bin/bash
# gen-certs.sh – Tạo chứng chỉ TLS cho demo (idempotent)
# Dùng: bash scripts/gen-certs.sh
# Yêu cầu: openssl >= 1.1.1
# KHÔNG in khóa riêng – chỉ in thông tin chứng chỉ

export MSYS_NO_PATHCONV=1

get_pwd() {
  (pwd -W 2>/dev/null) || pwd
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && get_pwd)"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && get_pwd)"
CERTS_DIR="${PROJECT_DIR}/certs"
SELFSIGNED_DIR="${CERTS_DIR}/selfsigned"
CA_DIR="${CERTS_DIR}/ca"
EVIDENCE_DIR="${PROJECT_DIR}/docs/evidence"

mkdir -p "$SELFSIGNED_DIR" "$CA_DIR" "$EVIDENCE_DIR"

# Kiểm tra openssl
if ! command -v openssl >/dev/null 2>&1; then
  echo "❌ openssl không tìm thấy trong PATH."
  echo "   Trên Windows: dùng Git Bash hoặc cài openssl qua Chocolatey/Winget"
  echo "   Trong WSL: sudo apt install openssl"
  echo "   Trong Docker: docker run --rm -v \$(pwd)/certs:/out alpine sh"
  exit 1
fi

echo "=== gen-certs.sh – Tạo chứng chỉ TLS ==="
echo "openssl: $(openssl version)"
echo ""

# ============================================================
# 1. Chứng chỉ tự ký (selfsigned)
# ============================================================
SELFSIGNED_KEY="${SELFSIGNED_DIR}/shop.local.key"
SELFSIGNED_CRT="${SELFSIGNED_DIR}/shop.local.crt"

if [ -f "$SELFSIGNED_CRT" ] && [ -f "$SELFSIGNED_KEY" ]; then
  echo "✅ Chứng chỉ tự ký đã tồn tại – bỏ qua tạo lại"
  echo "   (Xóa ${SELFSIGNED_DIR}/ để tạo lại)"
else
  echo "→ Tạo chứng chỉ tự ký..."
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$SELFSIGNED_KEY" \
    -out "$SELFSIGNED_CRT" \
    -days 365 \
    -subj "/CN=shop.local" \
    -addext "subjectAltName=DNS:shop.local"
  chmod 600 "$SELFSIGNED_KEY"
  echo "✅ Chứng chỉ tự ký đã tạo"
fi

# Xác minh SAN
echo ""
echo "--- Xác minh chứng chỉ tự ký ---"
openssl x509 -in "$SELFSIGNED_CRT" -noout -text | grep -A5 "Subject Alternative"
openssl x509 -in "$SELFSIGNED_CRT" -noout -text | grep "CA:"

# ============================================================
# 2. Root CA và chứng chỉ domain được ký bởi CA
# ============================================================
ROOT_CA_KEY="${CA_DIR}/rootCA.key"
ROOT_CA_CRT="${CA_DIR}/rootCA.crt"
DOMAIN_KEY="${CA_DIR}/shop.local.key"
DOMAIN_CSR="${CA_DIR}/shop.local.csr"
DOMAIN_CRT="${CA_DIR}/shop.local.crt"
DOMAIN_EXT="${CA_DIR}/shop.local.ext"

if [ -f "$ROOT_CA_CRT" ] && [ -f "$DOMAIN_CRT" ]; then
  echo ""
  echo "✅ Root CA và chứng chỉ domain đã tồn tại – bỏ qua tạo lại"
else
  echo ""
  echo "→ Tạo Root CA..."
  openssl genrsa -out "$ROOT_CA_KEY" 4096
  chmod 600 "$ROOT_CA_KEY"
  openssl req -x509 -new -nodes -key "$ROOT_CA_KEY" \
    -sha256 -days 825 \
    -subj "/CN=Shop Local Demo Root CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -out "$ROOT_CA_CRT"
  echo "✅ Root CA đã tạo"

  echo "→ Tạo khóa và CSR cho domain..."
  openssl genrsa -out "$DOMAIN_KEY" 2048
  chmod 600 "$DOMAIN_KEY"
  openssl req -new -key "$DOMAIN_KEY" \
    -subj "/CN=shop.local" \
    -out "$DOMAIN_CSR"

  echo "→ Tạo file extension..."
  cat > "$DOMAIN_EXT" << 'EOF'
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:shop.local
EOF

  echo "→ Ký chứng chỉ domain bằng Root CA..."
  openssl x509 -req \
    -in "$DOMAIN_CSR" \
    -CA "$ROOT_CA_CRT" \
    -CAkey "$ROOT_CA_KEY" \
    -CAcreateserial \
    -out "$DOMAIN_CRT" \
    -days 365 \
    -sha256 \
    -extfile "$DOMAIN_EXT"
  echo "✅ Chứng chỉ domain đã ký"
fi

# ============================================================
# Xác minh chuỗi chứng chỉ
# ============================================================
VERIFY_OUT="${EVIDENCE_DIR}/cert-verify.txt"
echo "" | tee "$VERIFY_OUT"
echo "=== Xác minh chứng chỉ ===" | tee -a "$VERIFY_OUT"
echo "Thời gian: $(date)" | tee -a "$VERIFY_OUT"

echo "" | tee -a "$VERIFY_OUT"
echo "--- Root CA (phải có CA:TRUE và keyCertSign) ---" | tee -a "$VERIFY_OUT"
openssl x509 -in "$ROOT_CA_CRT" -noout -text 2>&1 | grep -E "CA:|keyCertSign|cRLSign|Subject:|Issuer:" | tee -a "$VERIFY_OUT"

echo "" | tee -a "$VERIFY_OUT"
echo "--- Chứng chỉ domain (phải có CA:FALSE, serverAuth, SAN) ---" | tee -a "$VERIFY_OUT"
openssl x509 -in "$DOMAIN_CRT" -noout -text 2>&1 | grep -E "CA:|serverAuth|DNS:|Subject:|Issuer:" | tee -a "$VERIFY_OUT"

echo "" | tee -a "$VERIFY_OUT"
echo "--- Xác minh chuỗi ---" | tee -a "$VERIFY_OUT"
openssl verify -CAfile "$ROOT_CA_CRT" "$DOMAIN_CRT" 2>&1 | tee -a "$VERIFY_OUT"

echo "" | tee -a "$VERIFY_OUT"
echo "=== Hoàn thành ===" | tee -a "$VERIFY_OUT"
echo "Chứng chỉ tự ký: ${SELFSIGNED_DIR}/"
echo "Root CA + domain: ${CA_DIR}/"
echo "Bước tiếp theo: bash scripts/use-cert.sh selfsigned docker"
echo "Evidence: ${VERIFY_OUT}"
echo ""
echo "⚠️ rootCA.key KHÔNG được commit, KHÔNG được copy ra ngoài certs/ca/"
