# BUỔI 9: MINIO / OBJECT STORAGE S3 — TÍCH HỢP SDK & NGINX PROXY

Dự án thực hành môn **Phát triển hệ thống server nâng cao — Buổi 9**.
Triển khai hệ thống lưu trữ đối tượng **MinIO theo chuẩn AWS S3 API**, tích hợp ứng dụng Express backend 2 instances, NGINX reverse proxy, React Frontend và cơ chế bảo mật **Least-Privilege Service Account**.

> [!IMPORTANT]
> **Tính Độc Lập Hoàn Toàn Với Buổi 8:**
> Dự án sử dụng compose project name `minio-demo-buoi9`, mạng riêng `app_network_buoi9`, volumes riêng (`minio_data_buoi9`, `postgres_data_buoi9`), backend ports `3003`, `3004`, MinIO Console port `9091`, hoàn toàn không xung đột và không làm thay đổi dữ liệu của Buổi 8 (`nginx-demo-buoi8`).

---

## 1. Kiến Trúc Hệ Thống

```text
                                Windows Browser
                                       |
                      +----------------+----------------+
                      |                                 |
                      v (http://shop.local)             v (http://minio.shop.local)
             +-------------------------------------------------------+
             |                  NGINX (Port 80)                      |
             +-------------------------------------------------------+
                      |                                 |
                      v (proxy /api/ & static SPA)      v (proxy S3 API: Host $http_host)
         +-------------------------+                    |
         |  backend_pool (Round)   |                    |
         +------------+------------+                    |
         |            |                                 |
         v            v                                 v
    [backend-1]  [backend-2]                          [MinIO]
      (Port 3000, X-Instance)                     (Port 9000 - S3 API)
         |            |                                 |
         +------------+---------------------------------+
                      | (Docker network: app_network_buoi9)
                      v
              +---------------+
              | PostgreSQL 16 |
              +---------------+

 Giao diện quản trị MinIO Console:
 Browser ---> http://127.0.0.1:9091 ---> MinIO Console (Cổng 9001 nội bộ)
```

---

## 2. Yêu Cầu Môi Trường (Prerequisites)

- **Docker Desktop** hoặc **Docker Engine** (hỗ trợ Docker Compose v2 trở lên).
- **Node.js** >= 18 và **npm** (để chạy bộ kiểm thử chấp nhận E2E trên host hoặc build frontend).
- **curl** (hoặc `curl.exe` tích hợp sẵn trên Windows 10/11).
- **PowerShell 5.1+** (trên Windows) hoặc **Bash** (trên Linux/macOS).
- Cổng `80` và cổng `9091` trên máy host đang rảnh.

---

## 3. Thiết Lập Cấu Hình (Configuration & Credentials)

### 3.1. Tạo tệp cấu hình `.env`
Sao chép mẫu cấu hình từ [.env.example](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/.env.example):
```powershell
# Windows PowerShell:
Copy-Item .env.example .env

# Linux / macOS / Bash:
cp .env.example .env
```

### 3.2. Giải thích chi tiết các biến cấu hình
| Tên biến | Phạm vi áp dụng | Mục đích |
|---|---|---|
| `MINIO_ROOT_USER` | `minio`, `minio-admin` | Tên tài khoản Superadmin của MinIO. Chỉ dùng cho bootstrap/provisioning. |
| `MINIO_ROOT_PASSWORD` | `minio`, `minio-admin` | Mật khẩu Root MinIO. Bắt buộc cấu hình (không có fallback mặc định). |
| `MINIO_BACKEND_ACCESS_KEY` | `backend-1`, `backend-2`, `minio-admin` | Access Key của Service Account cấp riêng cho backend (Least Privilege). |
| `MINIO_BACKEND_SECRET_KEY` | `backend-1`, `backend-2`, `minio-admin` | Secret Key của Service Account backend. |
| `MINIO_DEMO_BUCKETS` | Backend & Provisioning | Danh sách bucket nghiệp vụ: `buoi9-assets,buoi9-assets-archive`. |
| `MINIO_BUCKET` | Backend | Bucket lưu ảnh sản phẩm: `product-images`. |
| `PRESIGNED_URL_MAX_TTL_SECONDS` | Backend | Giới hạn trần TTL tối đa cho Presigned URL phía server (mặc định: `3600`). |
| `MINIO_PRESIGNED_EXPIRY` | Backend | TTL mặc định nếu client không gửi tham số `expiry` (mặc định: `300`). |
| `MINIO_CONSOLE_HOST_PORT` | `minio` | Cổng loopback host cho MinIO Console (mặc định: `9091`, tránh cổng 9001 của Buổi 8). |

> [!CAUTION]
> **Phân Biệt Root Credentials vs Service Account:**
> - `MINIO_ROOT_USER` & `MINIO_ROOT_PASSWORD`: Tuyệt đối **không** được đưa vào runtime của `backend-1` và `backend-2`.
> - Backend runtime chỉ được phép nhận `MINIO_BACKEND_ACCESS_KEY` và `MINIO_BACKEND_SECRET_KEY`. Nếu thiếu, backend sẽ **fail-fast dừng chạy** chứ tuyệt đối không fallback ngầm sang root.

### 3.3. Cấu hình Windows Hosts
Thêm 2 dòng sau vào file `C:\Windows\System32\drivers\etc\hosts` (mở bằng Notepad Admin):
```text
127.0.0.1 shop.local
127.0.0.1 minio.shop.local
```

---

## 4. Quy Trình Triển Khai Đúng Thứ Tự (3-Step Mandatory Workflow)

> [!WARNING]
> **Không thể chạy `docker compose up -d` một lệnh duy nhất khi mới clone repo!**
> Vì `backend` yêu cầu Service Account đã được khởi tạo sẵn trong MinIO để kết nối, người dùng **bắt buộc** phải tuân thủ đúng thứ tự 3 bước dưới đây:

### Bước 1: Khởi động MinIO và Cơ sở dữ liệu trước
Chỉ khởi động các dịch vụ lưu trữ nền tảng cần thiết:
```powershell
docker compose up -d minio db
```
Chờ vài giây cho đến khi MinIO cluster sẵn sàng (`mc ready local`):
```powershell
docker compose exec -T minio mc ready local
# Đầu ra mong đợi: The cluster 'local' is ready
```

### Bước 2: Chạy Provisioning khởi tạo Bucket & Service Account
Chạy script tự động hóa quản trị:
- Xác thực Root credentials từ `.env`.
- Tạo các bucket: `product-images`, `buoi9-assets`, `buoi9-assets-archive`.
- Áp dụng Bucket Policy cho phép Anonymous đọc `public/*` và xác minh lại bằng API.
- Tạo hoặc cập nhật Service Account với chính sách quyền tối thiểu [backend-service-policy.json](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/scripts/backend-service-policy.json).

**Trên Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File scripts/provision-minio.ps1
```

**Trên Linux / macOS / Git Bash:**
```bash
bash scripts/provision-minio.sh
```
*(Script có tính **Idempotent**, chạy lại an toàn mà không làm hỏng cấu hình hay mất dữ liệu).*

### Bước 3: Khởi động toàn bộ các dịch vụ còn lại
Sau khi provisioning hoàn tất, khởi động backend, NGINX và frontend:
```powershell
docker compose up -d
```
Kiểm tra trạng thái toàn bộ 5 containers:
```powershell
docker compose ps
# Tất cả 5 containers (minio, db, backend-1, backend-2, nginx) đều phải đạt trạng thái (healthy).
```

---

## 5. Đặc Tả API Presigned URL & Ràng Buộc TTL (API Contract)

Endpoint sinh Presigned URL: `GET /api/files/url`

### Tham số Query:
- `bucket` (bắt buộc): Tên bucket nằm trong allowlist (`buoi9-assets`, `buoi9-assets-archive`, `product-images`).
- `key` (bắt buộc): Đường dẫn file (ví dụ: `private/report.pdf`).
- `expiry` (tùy chọn): Thời gian sống của URL tính bằng giây.

### Quy tắc Xác thực Server-Side:
1. **Bỏ qua tham số `expiry`:** Server áp dụng mặc định an toàn là **300 giây**.
2. **Giá trị hợp lệ:** Số nguyên dương nằm trong khoảng từ `1` đến `PRESIGNED_URL_MAX_TTL_SECONDS` (mặc định: `3600`).
3. **Từ chối và trả về HTTP 400 Bad Request nếu:**
   - `expiry` là số `0` hoặc số âm (`-60`).
   - `expiry` là chuỗi không phải số (`abc`) hoặc số thập phân (`60.5`).
   - `expiry` vượt quá trần cấu hình phía server (`> 3600`).

---

## 6. Quy Trình Kiểm Thử (Testing & Verification)

### 6.1. Kiểm thử Tích hợp Toàn diện (31 E2E Tests trên Host)
Chạy bộ test tự động kiểm tra toàn bộ 9 nhóm chức năng và bảo mật qua NGINX:
```powershell
node scripts/test-buoi9-hardening.js
```
*Kết quả: 31/31 bài test PASS.*

### 6.2. Kiểm thử Triển khai Sạch Cô lập (Clean Deployment Test)
Xác minh khả năng triển khai lại từ đầu với bộ credentials ngẫu nhiên mới sinh, không chạm vào volumes hiện có:
```powershell
node scripts/verify-clean-deployment.js
```
*Kết quả: 10/10 bước PASS, container tự hủy sau test.*

### 6.3. Kiểm thử SDK Quản trị trong Container (`minio-admin`)
```powershell
docker compose run --rm minio-admin node scripts/test-buoi9.js
```

### 6.4. Tự động Tạo Bằng Chứng Kiểm Thử (Evidence Generator)
```powershell
node scripts/generate-evidence.js
```
Toàn bộ 9 file bằng chứng độc lập được lưu tại thư mục [docs/evidence/buoi9/](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/).

---

## 7. Hướng Dẫn Xử Lý Sự Cố (Troubleshooting)

| Dấu hiệu sự cố | Nguyên nhân | Biện pháp khắc phục |
|---|---|---|
| Compose báo lỗi `MINIO_ROOT_USER is required` | Chưa có file `.env` hoặc thiếu biến root | Sao chép `.env.example` thành `.env` và khai báo đủ biến. |
| Backend báo lỗi `[MinIO Configuration Error]` khi khởi động | Thiếu `MINIO_BACKEND_ACCESS_KEY` hoặc `SECRET_KEY` | Kiểm tra `.env` có đầy đủ credentials của Service Account. Backend fail-fast để ngăn chặn chạy thiếu bảo mật. |
| Backend báo lỗi `[MinIO Storage Init] Connection failed...` sau nhiều lần retry | Chưa chạy Bước 2 Provisioning | MinIO chưa có Service Account. Chạy `scripts/provision-minio.ps1` hoặc `provision-minio.sh`. |
| Script `set-demo-policy.js` thoát với mã lỗi 1 | Thiếu bucket bắt buộc trong MinIO | Chạy `scripts/create-demo-buckets.js` trước khi áp dụng policy. Script có cơ chế fail-fast không nuốt lỗi. |
| Truy cập `http://minio.shop.local/...` báo không kết nối được | Chưa cấu hình Windows Hosts | Thêm `127.0.0.1 minio.shop.local` và `127.0.0.1 shop.local` vào file `C:\Windows\System32\drivers\etc\hosts`. |
| Upload file bị lỗi `HTTP 413 Payload Too Large` | Dung lượng file vượt giới hạn | Backend giới hạn upload 5MB (`MAX_FILE_SIZE`). NGINX giới hạn 25MB (`client_max_body_size 25m`). |
| Sinh Presigned URL bị lỗi `HTTP 400 Bad Request` | Tham số `expiry` không hợp lệ hoặc vượt trần | Đảm bảo `expiry` là số nguyên dương `<= PRESIGNED_URL_MAX_TTL_SECONDS` (3600s). |

---

## 8. Nguyên Tắc Bảo Mật & Lưu Ý Lịch Sử Git

> [!CAUTION]
> **Lưu ý quan trọng về Lịch sử Git (Git History Security Notice):**
> Việc loại bỏ secret khỏi mã nguồn hiện tại **không** tự động xóa secret đó khỏi lịch sử các commit trước đây trong Git.
> - Bất kỳ credential nào đã từng xuất hiện trong commit lịch sử đều phải được coi là **đã bị công khai (compromised)**.
> - Khuyến nghị bắt buộc: **Rotate (thu hồi và đổi mới)** toàn bộ Root credentials, Service Account credentials và Database passwords trên bất kỳ hệ thống nào sử dụng cấu hình này.
> - Tuyệt đối không commit tệp `.env` vào repository (đã được cấu hình trong `.gitignore`).

---

## 9. Dừng Dự Án An Toàn

```powershell
docker compose down
```
> [!NOTE]
> Lệnh trên chỉ dừng các container và network của Buổi 9. **Không** dùng `docker compose down -v` để bảo toàn dữ liệu database và các object đã upload trong volume `minio_data_buoi9`.
