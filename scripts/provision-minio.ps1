# ============================================================
# MinIO Provisioning Script (PowerShell) - Buổi 9
# Tác vụ: Khởi tạo Buckets, Bucket Policies và Backend Service Account
# Quyền: Chạy với tư cách Quản trị viên (chỉ thực hiện một lần hoặc khi cập nhật quyền)
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " [MinIO Provisioning] Bat dau khoi tao he thong MinIO Buoi 9" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Doc bien moi truong tu .env mot cach an toan (khong hardcode, khong dung eval)
$envFilePath = Join-Path $PSScriptRoot "..\.env"
if (-not (Test-Path $envFilePath)) {
    $envFilePath = ".env"
}

$envMap = @{}
if (Test-Path $envFilePath) {
    Get-Content $envFilePath | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $idx = $line.IndexOf("=")
            $key = $line.Substring(0, $idx).Trim()
            $val = $line.Substring($idx + 1).Trim()
            # Loai bo dau ngoac kep/ngoac don o hai dau gia tri
            if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
                $val = $val.Substring(1, $val.Length - 2)
            }
            $envMap[$key] = $val
        }
    }
}

function Resolve-Var($varName) {
    $envVal = [System.Environment]::GetEnvironmentVariable($varName)
    if ($envVal) { return $envVal }
    if ($envMap.ContainsKey($varName)) { return $envMap[$varName] }
    return $null
}

$rootUser   = Resolve-Var "MINIO_ROOT_USER"
$rootPass   = Resolve-Var "MINIO_ROOT_PASSWORD"
$svcKey     = Resolve-Var "MINIO_BACKEND_ACCESS_KEY"
$svcSecret  = Resolve-Var "MINIO_BACKEND_SECRET_KEY"

$missing = @()
if (-not $rootUser)  { $missing += "MINIO_ROOT_USER" }
if (-not $rootPass)  { $missing += "MINIO_ROOT_PASSWORD" }
if (-not $svcKey)    { $missing += "MINIO_BACKEND_ACCESS_KEY" }
if (-not $svcSecret) { $missing += "MINIO_BACKEND_SECRET_KEY" }

if ($missing.Count -gt 0) {
    Write-Host "[ERROR] Thieu bien moi truong bat buoc trong .env: $($missing -join ', ')" -ForegroundColor Red
    Write-Host "Vui long kiem tra file .env (sao chep tu .env.example va cau hinh day du credentials)." -ForegroundColor Red
    exit 1
}

# 2. Kiem tra MinIO cluster san sang
Write-Host "[1/4] Kiem tra MinIO Cluster Health..." -ForegroundColor Yellow
$readyOutput = docker compose exec -T minio mc ready local 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] MinIO chua san sang: $readyOutput" -ForegroundColor Red
    exit 1
}
Write-Host "   -> MinIO cluster da san sang!" -ForegroundColor Green

# 3. Khoi tao demo buckets qua minio-admin
Write-Host "[2/4] Khoi tao Buckets trong allowlist..." -ForegroundColor Yellow
docker compose run --rm minio-admin node /app/scripts/create-demo-buckets.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Khoi tao buckets that bai!" -ForegroundColor Red
    exit 1
}

# 4. Thiet lap Bucket Policies (Anonymous GetObject cho public/*)
Write-Host "[3/4] Thiet lap Bucket Policies an toan va xac minh..." -ForegroundColor Yellow
docker compose run --rm minio-admin node /app/scripts/set-demo-policy.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Thiet lap policies that bai!" -ForegroundColor Red
    exit 1
}

# 5. Khoi tao / Cap nhat Service Account cho Backend voi Least Privilege
Write-Host "[4/4] Cau hinh MinIO Service Account cho Backend..." -ForegroundColor Yellow

# Copy policy JSON vao container dung service name cua compose (khong hardcode container name)
docker compose cp scripts/backend-service-policy.json minio:/tmp/backend-service-policy.json
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Khong the copy backend-service-policy.json vao container minio!" -ForegroundColor Red
    exit 1
}

# Dang ky alias admin
docker compose exec -T minio mc alias set minioadmin http://localhost:9000 $rootUser $rootPass > $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Khong the dang ky alias minioadmin voi root credentials duoc cung cap!" -ForegroundColor Red
    exit 1
}

# Kiem tra service account da ton tai chua
$checkSvc = docker compose exec -T minio mc admin user svcacct info minioadmin $svcKey 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   -> Service account '$svcKey' da ton tai. Cap nhat policy..." -ForegroundColor Yellow
    docker compose exec -T minio mc admin user svcacct edit minioadmin $svcKey --policy /tmp/backend-service-policy.json > $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Cap nhat policy cho service account that bai!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "   -> Tao moi service account '$svcKey' voi quyen toi thieu..." -ForegroundColor Yellow
    docker compose exec -T minio mc admin user svcacct add minioadmin $rootUser --access-key $svcKey --secret-key $svcSecret --policy /tmp/backend-service-policy.json > $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Tao service account that bai!" -ForegroundColor Red
        exit 1
    }
}

# Xac minh service account sau khi tao
$verifySvc = docker compose exec -T minio mc admin user svcacct info minioadmin $svcKey 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Xac minh service account sau khi tao that bai!" -ForegroundColor Red
    exit 1
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " [MinIO Provisioning] Hoan tat thanh cong!" -ForegroundColor Green
Write-Host "   - Service Account: $svcKey (Verified ON)" -ForegroundColor Green
Write-Host "   - Policy: Restrict to buoi9-assets, buoi9-assets-archive, product-images" -ForegroundColor Green
Write-Host "   - Backend runtime se su dung credentials nay, khong dung Root." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
