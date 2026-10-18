# BUỔI 9: MINIO / OBJECT STORAGE S3 — TÍCH HỢP SDK & NGINX PROXY

Dự án thực hành môn **Phát triển hệ thống server nâng cao — Buổi 9**.
Triển khai hệ thống lưu trữ đối tượng **MinIO theo chuẩn AWS S3 API**, tích hợp ứng dụng Express backend 2 instances, NGINX reverse proxy, React Frontend và cơ chế bảo mật **Least-Privilege Service Account**.

> [!IMPORTANT]
> **Tính Độc Lập Hoàn Toàn Với Buổi 8:**
> Dự án sử dụng compose project name `minio-demo-buoi9`, mạng riêng `app_network_buoi9`, volumes riêng (`minio_data_buoi9`, `postgres_data_buoi9`), backend ports `3003`, `3004`, MinIO Console port `9091`, hoàn toàn không xung đột và không làm thay đổi dữ liệu của Buổi 8.

---

## 1. Kiến trúc Hệ thống

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

### Nguyên tắc Bảo mật MinIO (P0 Security Hardening)
1. **Tách biệt vai trò Credentials**:
   - `MINIO_ROOT_USER` & `MINIO_ROOT_PASSWORD`: Dành riêng cho quản trị viên thực hiện provisioning thông qua CLI container `minio-admin`. **Tuyệt đối không đưa vào runtime `backend-1` hay `backend-2`**.
   - `MINIO_BACKEND_ACCESS_KEY` & `MINIO_BACKEND_SECRET_KEY`: Service account riêng biệt (`buoi9_app_svc`) với chính sách quyền tối thiểu (**Least Privilege**).
2. **Chính sách quyền tối thiểu (IAM Policy)**:
   - Backend chỉ được phép thao tác trên các bucket trong allowlist: `buoi9-assets`, `buoi9-assets-archive`, `product-images`.
   - Các quyền cho phép: `s3:GetBucketLocation`, `s3:ListBucket`, `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`.
   - **Bị chặn tuyệt đối**: Tạo bucket (`s3:CreateBucket`), xóa bucket, quản trị user, gán policy.
3. **Quyền truy cập ẩn danh (Anonymous Policy)**:
   - **Public**: Chỉ cho phép `s3:GetObject` trên prefix `buoi9-assets/public/*` và `product-images/*`.
   - **Private**: Prefix `private/*`, `avatars/*`, `documents/*` và toàn bộ bucket `buoi9-assets-archive` đều bị từ chối truy cập ẩn danh (**HTTP 403 Forbidden**).
   - Anonymous **bị chặn hoàn toàn** các quyền: List bucket, Upload (PUT), Delete.
4. **MinIO Healthcheck**:
   - Sử dụng lệnh `mc ready local` với binary `/usr/bin/mc` có sẵn trong image `cgr.dev/chainguard/minio@sha256:...`. Xác minh cluster sẵn sàng trước khi backend khởi động.

---

## 2. Điều kiện Tiên quyết
- Docker Desktop hoặc Docker Engine với Docker Compose v2.
- Node.js >= 18 và npm (nếu muốn chạy script kiểm thử trên host hoặc build frontend).
- Cổng `80` trên máy host đang rảnh (không bị chiếm bởi IIS, Skype, Apache).

---

## 3. Cấu hình Windows Hosts

Để truy cập web app và MinIO S3 API qua đúng domain đã cấu hình trong reverse proxy, thêm vào file `C:\Windows\System32\drivers\etc\hosts`:

```text
127.0.0.1 shop.local
127.0.0.1 minio.shop.local
```

*(Lưu ý: Nếu chưa cấu hình hosts, bạn vẫn có thể truy cập qua `http://localhost/`)*.

---

## 4. Hướng dẫn Triển khai Từng bước (Step-by-Step Setup)

### Bước 1: Khởi tạo tệp cấu hình `.env`
Sao chép `.env.example` thành `.env`:
```powershell
Copy-Item .env.example .env
```
Các biến mẫu trong `.env` đã được thiết lập sẵn cho môi trường thực hành môn học:
- MinIO Root: `buoi9admin` / `buoi9_minio_root_secret_2026` (Chỉ dùng cho container admin).
- MinIO Backend Service Account: `buoi9_app_svc` / `Buoi9SvcSecret2026!AppKey` (Dành riêng cho runtime backend).

### Bước 2: Build Frontend (nếu chưa có `frontend/dist`)
```powershell
cd frontend
npm install
npm run build
cd ..
```

### Bước 3: Khởi động các dịch vụ bằng Docker Compose
```powershell
docker compose up -d
```

Kiểm tra trạng thái các container:
```powershell
docker compose ps
```
Chờ vài giây cho đến khi cả 5 containers (`minio`, `db`, `backend-1`, `backend-2`, `nginx`) đều ở trạng thái `(healthy)`.

### Bước 4: Khởi tạo Bucket, Policy và Service Account (Provisioning)
Chạy script quản trị để tự động:
1. Kiểm tra MinIO cluster health (`mc ready local`).
2. Khởi tạo các bucket: `product-images`, `buoi9-assets`, `buoi9-assets-archive`.
3. Gán anonymous read policy cho `buoi9-assets/public/*` và `product-images/*`.
4. Tạo/cập nhật MinIO Service Account `buoi9_app_svc` với policy `scripts/backend-service-policy.json`.

**Trên Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File scripts/provision-minio.ps1
```

**Trên Linux / Git Bash:**
```bash
bash scripts/provision-minio.sh
```

*(Script có tính **idempotent**, có thể chạy lại an toàn nhiều lần mà không làm mất dữ liệu)*.

### Bước 5: Xác minh Backend đang dùng Service Account
Xem log khởi động của `backend-1`:
```powershell
docker compose logs backend-1
```
Đầu ra xác nhận:
```text
[Server] Checking MinIO storage connectivity (Least-Privilege Service Account)...
[MinIO] ✅ Bucket "product-images" sẵn sàng (truy cập hợp lệ qua Service Account).
[MinIO] ✅ Bucket "buoi9-assets" sẵn sàng (truy cập hợp lệ qua Service Account).
[MinIO] ✅ Bucket "buoi9-assets-archive" sẵn sàng (truy cập hợp lệ qua Service Account).
[Server] ✅ backend-1 is running!
```

---

## 5. Địa chỉ Truy cập & Thao tác Thực tế

| Dịch vụ | Địa chỉ URL | Ghi chú |
|---|---|---|
| **Web Shop Catalog & Storage UI** | [http://shop.local/](http://shop.local/) hoặc [http://localhost/](http://localhost/) | Giao diện React Frontend |
| **Storage Management GUI** | [http://shop.local/storage](http://shop.local/storage) | Quản lý Upload, Presigned URL, Move, Rename |
| **MinIO S3 API Reverse Proxy** | [http://minio.shop.local/](http://minio.shop.local/) | Proxy qua NGINX với `Host: $http_host` |
| **MinIO Web Console** | [http://127.0.0.1:9091](http://127.0.0.1:9091) | Đăng nhập bằng `buoi9admin` / `buoi9_minio_root_secret_2026` |
| **Backend 1 Direct Health** | [http://127.0.0.1:3003/health](http://127.0.0.1:3003/health) | Cổng test instance 1 |
| **Backend 2 Direct Health** | [http://127.0.0.1:3004/health](http://127.0.0.1:3004/health) | Cổng test instance 2 |

---

## 6. Hướng dẫn Kiểm thử & Bằng chứng Nghiệm thu

### 6.1. Chạy Bộ Test Hardening Tự động (26 bài test)
Chạy script kiểm thử tích hợp toàn diện qua NGINX:
```powershell
node scripts/test-buoi9-hardening.js
```
Bộ test tự động xác minh:
- Health check backend, DB, MinIO, NGINX.
- Bảo mật P0: Service account không có quyền tạo bucket (`Access Denied`), backend không chạy khi thiếu credentials.
- CRUD đối tượng qua API: Upload, Download, Integrity bit-for-bit.
- Presigned URL: Chuẩn AWS Signature V4, TTL 300s, từ chối URL bị sửa đổi (HTTP 403).
- Phân quyền Anonymous: Public GET (200), Private GET (403), List (403), Put (403), Delete (403).
- Rename & Move an toàn: Copy sang đích -> Xác minh dung lượng -> Xóa nguồn.
- Validation: Chặn path traversal (`../../`), chặn MIME type lạ, giới hạn kích thước file (HTTP 413).
- Load balancing: Requests phân phối đều qua `backend-1` và `backend-2`.
- Kế thừa API sản phẩm Buổi 8 (`/api/products`).

### 6.2. Chạy Bộ Test SDK MinIO (`scripts/test-buoi9.js`)
Chạy trong container quản trị `minio-admin`:
```powershell
docker compose run --rm minio-admin node scripts/test-buoi9.js
```

### 6.3. Tự động sinh Toàn bộ File Bằng chứng
```powershell
node scripts/generate-evidence.js
```
Các file bằng chứng độc lập của Buổi 9 được lưu tại `docs/evidence/buoi9/`.

---

## 7. Xử lý Sự cố Thường gặp (Troubleshooting)

1. **Truy cập `http://minio.shop.local/...` báo `Cannot GET` hoặc không vào được:**
   - Nguyên nhân: Chưa cấu hình file `hosts` của Windows.
   - Khắc phục: Thêm `127.0.0.1 minio.shop.local` và `127.0.0.1 shop.local` vào file `C:\Windows\System32\drivers\etc\hosts`.
2. **Backend báo lỗi `[MinIO Configuration Error] MINIO_ACCESS_KEY... chưa được cấu hình`:**
   - Nguyên nhân: Thiếu biến môi trường `MINIO_BACKEND_ACCESS_KEY` trong `.env`.
   - Khắc phục: Kiểm tra `.env` đã có đầy đủ `MINIO_BACKEND_ACCESS_KEY=buoi9_app_svc` và `MINIO_BACKEND_SECRET_KEY=...`.
3. **Cổng 80 bị chiếm dụng:**
   - Nguyên nhân: Dịch vụ IIS (World Wide Web Publishing Service) hoặc ứng dụng khác đang chiếm cổng 80.
   - Khắc phục: Mở PowerShell (Admin) chạy `Stop-Service W3SVC` hoặc đổi cổng NGINX trong `docker-compose.yml`.

---

## 8. Dừng Dự án An toàn
```powershell
docker compose down
```
> [!CAUTION]
> Tuyệt đối không dùng `docker compose down -v` nếu muốn giữ lại dữ liệu upload và database. Lệnh trên chỉ dừng các container và network của Buổi 9, hoàn toàn không chạm vào tài nguyên của Buổi 8.
