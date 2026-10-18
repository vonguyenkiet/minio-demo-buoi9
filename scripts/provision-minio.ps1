# ============================================================
# MinIO Provisioning Script (PowerShell) - Buổi 9
# Tác vụ: Khởi tạo Buckets, Bucket Policies và Backend Service Account
# Quyền: Chạy với tư cách Quản trị viên (chỉ thực hiện một lần hoặc khi cập nhật quyền)
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " [MinIO Provisioning] Bat dau khoi tao he thong MinIO Buoi 9" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Kiem tra MinIO cluster san sang
Write-Host "[1/4] Kiem tra MinIO Cluster Health..." -ForegroundColor Yellow
$readyOutput = docker compose exec -T minio mc ready local 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] MinIO chua san sang: $readyOutput" -ForegroundColor Red
    exit 1
}
Write-Host "   -> MinIO cluster da san sang!" -ForegroundColor Green

# 2. Khoi tao demo buckets qua minio-admin
Write-Host "[2/4] Khoi tao Buckets trong allowlist..." -ForegroundColor Yellow
docker compose run --rm minio-admin node /app/scripts/create-demo-buckets.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Khoi tao buckets that bai!" -ForegroundColor Red
    exit 1
}

# 3. Thiet lap Bucket Policies (Anonymous GetObject cho public/*)
Write-Host "[3/4] Thiet lap Bucket Policies an toan..." -ForegroundColor Yellow
docker compose run --rm minio-admin node /app/scripts/set-demo-policy.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Thiet lap policies that bai!" -ForegroundColor Red
    exit 1
}

# 4. Khoi tao / Cap nhat Service Account cho Backend voi Least Privilege
Write-Host "[4/4] Cau hinh MinIO Service Account cho Backend..." -ForegroundColor Yellow

# Copy policy JSON vao container
docker cp scripts/backend-service-policy.json minio-demo-buoi9-minio-1:/tmp/backend-service-policy.json

# Lay thong tin tu .env
$rootUser = "buoi9admin"
$rootPass = "buoi9_minio_root_secret_2026"
$svcKey   = "buoi9_app_svc"
$svcSecret = "Buoi9SvcSecret2026!AppKey"

# Dang ky alias admin
docker compose exec -T minio mc alias set minioadmin http://localhost:9000 $rootUser $rootPass > $null

# Kiem tra service account da ton tai chua
$checkSvc = docker compose exec -T minio mc admin user svcacct info minioadmin $svcKey 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   -> Service account '$svcKey' da ton tai. Cap nhat policy..." -ForegroundColor Yellow
    docker compose exec -T minio mc admin user svcacct edit minioadmin $svcKey --policy /tmp/backend-service-policy.json
} else {
    Write-Host "   -> Tao moi service account '$svcKey' voi quyen toi thieu..." -ForegroundColor Yellow
    docker compose exec -T minio mc admin user svcacct add minioadmin $rootUser --access-key $svcKey --secret-key $svcSecret --policy /tmp/backend-service-policy.json
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " [MinIO Provisioning] Hoan tat thanh cong!" -ForegroundColor Green
Write-Host "   - Service Account: $svcKey" -ForegroundColor Green
Write-Host "   - Policy: Restrict to buoi9-assets, buoi9-assets-archive, product-images" -ForegroundColor Green
Write-Host "   - Backend runtime se su dung credentials nay, khong dung Root." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
