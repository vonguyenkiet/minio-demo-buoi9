# BUỔI 9: MINIO / OBJECT STORAGE S3 — TÍCH HỢP SDK & NGINX PROXY

Dự án độc lập kế thừa từ Buổi 8, bổ sung hệ thống lưu trữ đối tượng **MinIO theo chuẩn AWS S3 API**, tích hợp backend Node.js/Express, giao diện React frontend, reverse proxy NGINX và bộ script quản trị tự động.

---

## 1. Mục tiêu Demo
- Hiểu rõ bản chất **Object Storage** và sự khác biệt với lưu trữ file cục bộ (Filesystem) hoặc lưu trong Database.
- Chạy hệ thống lưu trữ MinIO bằng Docker và truy cập giao diện quản trị **MinIO Console**.
- Thao tác tạo Bucket qua giao diện Console và qua SDK nhiều ngôn ngữ.
- Thực hiện đầy đủ các thao tác với SDK: **Upload, Download, Rename/Move, Delete**.
- Phân biệt rõ đối tượng **Public** (truy cập ẩn danh) và **Private** (bảo mật, yêu cầu xác thực hoặc Presigned URL).
- Tạo và xác thực **Presigned URL** (ký theo chuẩn AWS S3 Signature V4) qua reverse proxy NGINX.
- Xử lý các tình huống lỗi: bucket/object không tồn tại, file quá giới hạn dung lượng, sai định dạng, dọn dẹp file tạm trên ổ đĩa.
- Kế thừa toàn vẹn luồng catalog sản phẩm từ Buổi 8 mà không gây xung đột cổng hay tài nguyên.

---

## 2. Kiến trúc Tổng thể

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

### Nguyên tắc Mạng & Cô lập
- **Không publish cổng S3 API (9000)** ra host: Browser truy cập qua NGINX tại domain `minio.shop.local`.
- **MinIO Console**: Chỉ bind vào loopback `127.0.0.1:9091` (tránh xung đột với cổng 9001 của Buổi 8).
- **Backend Ports**: `127.0.0.1:3003` (backend-1) và `127.0.0.1:3004` (backend-2), tránh các cổng 3001 và 3002 của Buổi 8.
- **NGINX**: Lắng nghe cổng 80 cho cả 2 domain `shop.local` và `minio.shop.local` (và alias `localhost`).
- **Two Clients**:
  1. `minioClient`: Kết nối MinIO nội bộ qua `http://minio:9000`.
  2. `publicSigningClient`: Ký Presigned URL với Host `minio.shop.local` để browser truy cập được qua NGINX.

---

## 3. Công nghệ Sử dụng
- **MinIO**: `cgr.dev/chainguard/minio@sha256:dc455cdd4db6e390b1b26514f15ff37681a777bf8dab41aac445a0259f751e56` (Pinned Immutable Digest).
- **MinIO JavaScript SDK**: `^7.1.3` (Hỗ trợ đầy đủ S3 API).
- **Backend**: Node.js 20, Express, Multer (lưu file tạm trên đĩa và dọn dẹp bằng `finally`).
- **Database**: PostgreSQL 16 Alpine.
- **Web Server / Reverse Proxy**: NGINX 1.30-alpine.
- **Frontend**: React 18, Vite 6, React Router DOM, Dark mode CSS Tokens.

---

## 4. Điều kiện Tiên quyết
- Docker Desktop hoặc Docker Engine với Docker Compose v2.
- Node.js >= 18 và npm (nếu muốn build frontend hoặc chạy test trên host).
- Cổng `80` trên máy tính đang rảnh (không bị chiếm bởi IIS, Apache...).

---

## 5. Hướng dẫn Cấu hình Hosts trên Windows

Để truy cập qua domain `shop.local` và `minio.shop.local`, thêm 2 dòng sau vào file hosts của Windows:

1. Mở Notepad bằng quyền **Run as Administrator**.
2. Mở file: `C:\Windows\System32\drivers\etc\hosts`.
3. Thêm vào cuối file:
   ```text
   127.0.0.1 shop.local
   127.0.0.1 minio.shop.local
   ```
4. Lưu file.

*(Lưu ý: Nếu chưa kịp cấu hình hosts, bạn vẫn có thể truy cập Web UI trực tiếp qua `http://localhost/`)*.

---

## 6. Khởi động Dự án Buổi 9

### Bước 1: Chuẩn bị biến môi trường `.env`
Sao chép `.env.example` thành `.env`:
```powershell
Copy-Item .env.example .env
```
File `.env` đã được thiết lập sẵn các giá trị cô lập cho Buổi 9:
- `COMPOSE_PROJECT_NAME=minio-demo-buoi9`
- `MINIO_CONSOLE_HOST_PORT=9091`
- `MINIO_DEMO_BUCKETS=buoi9-assets,buoi9-assets-archive`
- `NGINX_STAGE=06-minio-s3`

### Bước 2: Build Frontend (nếu chưa có `frontend/dist`)
```powershell
cd frontend
npm install
npm run build
cd ..
```

### Bước 3: Khởi động hệ thống bằng Docker Compose
```powershell
docker compose up -d
```

Kiểm tra trạng thái các container:
```powershell
docker compose ps
```
Cả 5 container (`minio`, `db`, `backend-1`, `backend-2`, `nginx`) phải hiển thị trạng thái `(healthy)`.

---

## 7. Các Địa chỉ Truy cập Chính
- **Giao diện Web Ứng dụng**: `http://shop.local/` (hoặc `http://localhost/`)
- **Giao diện Quản lý MinIO Storage**: `http://shop.local/storage` (hoặc `http://localhost/storage`)
- **MinIO S3 API qua NGINX**: `http://minio.shop.local/`
- **MinIO Console**: `http://127.0.0.1:9091`
  - Username: `buoi9admin`
  - Password: `buoi9_minio_root_secret_2026`

---

## 8. Danh mục Buckets & Prefixes

Hệ thống sử dụng 2 bucket riêng biệt:
1. `buoi9-assets`: Bucket chính chứa tài nguyên đang sử dụng.
2. `buoi9-assets-archive`: Bucket thứ hai dùng để minh họa thao tác di chuyển (Move) giữa các bucket.

### Quy ước Prefixes:
- `avatars/`: Ảnh đại diện người dùng (Mặc định Private).
- `documents/`: Tài liệu PDF, văn bản (Mặc định Private).
- `public/`: Tài nguyên công khai, bất kỳ ai cũng có thể đọc mà không cần chữ ký.
- `private/`: Tài nguyên nhạy cảm, bắt buộc phải có Presigned URL.

---

## 9. Quản trị Bucket & Scripts SDK

### 9.1. Tạo Bucket qua MinIO Console (Thực hành GUI)
1. Mở `http://127.0.0.1:9091` và đăng nhập.
2. Bấm mục **Administrator -> Buckets -> Create Bucket**.
3. Nhập tên bucket (ví dụ `buoi9-assets`) và bấm **Create Bucket**.

### 9.2. Chạy Script Tạo Bucket Tự động (Idempotent)
Chạy script trong container CLI nội bộ `minio-admin` (không cấp root credentials vào runtime backend):
```powershell
docker compose run --rm minio-admin node scripts/create-demo-buckets.js
```

### 9.3. Chạy Script Thiết lập Policy cho `public/*`
Thiết lập quyền Anonymous GetObject chỉ cho prefix `public/*`:
```powershell
docker compose run --rm minio-admin node scripts/set-demo-policy.js
```

### 9.4. Script CLI Xóa Bucket An toàn
Script chỉ xóa bucket trong allowlist và **bắt buộc bucket phải rỗng hoàn toàn**:
```powershell
docker compose run --rm minio-admin node scripts/delete-demo-bucket.js buoi9-assets --confirm
```
*(Nếu bucket còn object, script sẽ từ chối xóa và báo lỗi an toàn)*.

---

## 10. Hướng dẫn Thao tác SDK & Giao diện Web

Trên giao diện Web (`http://shop.local/storage`):

1. **Upload Avatar / Tài liệu**:
   - Chọn prefix mong muốn (`avatars/`, `documents/`, `public/`, `private/`).
   - Chọn file từ máy tính và bấm **Bắt đầu Upload**.
   - Hoặc bấm các nút **Thao tác mẫu nhanh** (`+ Avatar mẫu`, `+ PDF mẫu`, `+ File Public`, `+ File Private`) để tạo ngay dữ liệu demo.

2. **Tạo Presigned URL cho File Private**:
   - Bấm nút **🔑 Ký URL** trên bất kỳ file private nào.
   - Hộp thoại Modal hiển thị Presigned URL với AWS S3 Signature V4 và thời gian hiệu lực 300s (5 phút).
   - Bấm **Mở Presigned URL** để kiểm chứng file được tải về thành công.

3. **Kiểm tra Public vs Private**:
   - Bấm nút **👁 Thử URL** trên file trong `public/`: Mở trực tiếp link `http://minio.shop.local/buoi9-assets/public/...` -> **Xem được ngay (HTTP 200)**.
   - Bấm nút **👁 Thử URL** trên file trong `private/`: MinIO trả về lỗi **Access Denied (HTTP 403 Forbidden)**.

4. **Đổi tên (Rename) trong cùng bucket**:
   - Bấm nút **✏️** trên file -> nhập tên mới -> xác nhận.
   - Backend thực hiện quy trình: Copy sang key mới -> Xác minh dung lượng khớp -> Xóa key cũ.

5. **Di chuyển (Move) giữa 2 bucket**:
   - Bấm nút **🔄** trên file -> chọn bucket đích `buoi9-assets-archive` -> xác nhận.
   - File được sao chép sang bucket mới và xóa ở bucket cũ.

6. **Xóa Object**:
   - Bấm nút **🗑** để xóa vĩnh viễn object khỏi MinIO.

---

## 11. Chạy Bộ Kiểm thử Tự động (Automated Test Suite)

Để kiểm tra toàn diện 16 tiêu chí của Buổi 9, chạy lệnh:
```powershell
docker compose run --rm minio-admin node scripts/test-buoi9.js
```
Kết quả kiểm thử bao gồm:
- Kiểm tra kết nối S3 và tồn tại bucket.
- Upload Avatar, PDF, file Public, file Private.
- Kiểm tra Anonymous đọc Public (HTTP 200).
- Kiểm tra Anonymous đọc Private (HTTP 403).
- Kiểm tra Presigned URL hợp lệ (HTTP 200).
- Kiểm tra Presigned URL bị sai chữ ký (HTTP 403 SignatureDoesNotMatch).
- Kiểm tra Rename và Move an toàn.
- Kiểm tra API sản phẩm Buổi 8 (/api/products).

---

## 12. Dừng Buổi 9 An toàn (Không ảnh hưởng Buổi 8)

Khi muốn dừng Buổi 9:
```powershell
docker compose down
```
> **CẢNH BÁO:** Tuyệt đối không dùng `docker compose down -v` nếu muốn giữ lại dữ liệu upload. Lệnh trên chỉ dừng các container và network của Buổi 9, hoàn toàn không chạm vào container hay dữ liệu của Buổi 8.

---

## 13. Giới hạn & Trạng thái HTTPS
- **Credentials Phân quyền**: Hiện tại backend đang nhận credentials cấu hình qua biến môi trường. Để đạt phân quyền tối thiểu tuyệt đối, có thể tạo thêm Service Account hạn chế trong MinIO Console (**Identity -> Service Accounts**).
- **HTTPS**: Theo phạm vi bản đầu tiên (§4.4), hệ thống chạy qua HTTP cổng 80. HTTPS được đánh dấu là `NOT RUN` và có thể mở rộng sau.
