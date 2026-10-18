# BÁO CÁO KIỂM THỬ THỰC TẾ (TEST REPORT) — BUỔI 9: MINIO / OBJECT STORAGE S3

**Thời điểm thực hiện:** 2026-10-19  
**Môi trường:** Windows, Docker Compose v5.5.1, MinIO pinned digest, NGINX 1.30-alpine, Node.js 20 (Express backend x2 instances).  
**Dự án Buổi 9 độc lập:** `name: minio-demo-buoi9`

---

## 1. Bảng Tiêu chí Đánh giá PASS / FAIL / NOT RUN

| STT | Nhóm Tiêu chí | Mục kiểm tra | Trạng thái | Bằng chứng / Kết quả thực tế |
|---|---|---|---|---|
| 1 | Hạ tầng | Buổi 9 khởi động bằng Docker Compose | **PASS** | 5 containers `minio`, `db`, `backend-1`, `backend-2`, `nginx` đều `(healthy)`. |
| 2 | Hạ tầng | MinIO healthcheck hoạt động đúng | **PASS** | Healthcheck `mc ready local` trả về `ExitCode: 0` sau 20s. |
| 3 | Hạ tầng | MinIO Console truy cập được | **PASS** | Mở trên `127.0.0.1:9091` không xung đột với Buổi 8 (9001). |
| 4 | Hạ tầng | Backend 2 instances hoạt động load balancing | **PASS** | Cả `backend-1` (port 3003) và `backend-2` (port 3004) đều nhận request qua upstream `backend_pool` và gắn header `X-Instance`. |
| 5 | Cô lập | Buổi 8 không bị dừng hoặc sửa đổi | **PASS** | Các container Buổi 8 (`nginx-demo-buoi8-*`) vẫn giữ nguyên trạng thái; source Buổi 8 không bị chỉnh sửa. |
| 6 | Cô lập | Volume và Network riêng biệt | **PASS** | Sử dụng `minio_data_buoi9`, `postgres_data_buoi9`, `app_network_buoi9`. |
| 7 | Cô lập | Image tag không bị ghi đè | **PASS** | Buổi 9 dùng image `minio-demo-buoi9-backend:latest`, không ghi đè `product-api:latest` của Buổi 8. |
| 8 | An ninh mạng | S3 API port không publish trực tiếp ra host | **PASS** | Cổng 9000 không xuất hiện trong `ports` của MinIO; browser truy cập qua NGINX `minio.shop.local`. |
| 9 | Bucket | Tạo 2 demo bucket bằng script CLI | **PASS** | Script `create-demo-buckets.js` tạo thành công `buoi9-assets` và `buoi9-assets-archive`. |
| 10 | Bucket | Tính Idempotent của script tạo bucket | **PASS** | Chạy lại script báo `Bucket đã tồn tại` và thoát mã 0, không làm hỏng dữ liệu. |
| 11 | Object | Upload Avatar (prefix `avatars/`) | **PASS** | Upload file SVG 57 bytes thành công, stat size khớp. |
| 12 | Object | Upload Document (prefix `documents/`) | **PASS** | Upload file PDF 41 bytes thành công. |
| 13 | Object | Liệt kê danh sách object | **PASS** | API `/api/files?bucket=buoi9-assets` trả về đầy đủ metadata danh sách. |
| 14 | Object | Download object stream | **PASS** | API `/api/files/:id/download` trả về HTTP 200 kèm headers `Content-Disposition`, `Content-Length`. |
| 15 | Object | Rename object trong cùng bucket | **PASS** | Đổi tên `documents/test-doc.pdf` -> `documents/test-doc-renamed.pdf` an toàn (copy -> verify -> delete). |
| 16 | Object | Move object giữa 2 bucket demo | **PASS** | Di chuyển avatar sang `buoi9-assets-archive` thành công, nguồn được dọn sạch. |
| 17 | Object | Xóa object khỏi bucket | **PASS** | Xóa `public/test-public.txt` thành công, kiểm tra stat trả về `NotFound`. |
| 18 | Phân quyền | Anonymous đọc object trong `public/` | **PASS** | Anonymous GET `http://minio.shop.local/buoi9-assets/public/...` trả về **HTTP 200 OK**. |
| 19 | Phân quyền | Anonymous đọc object trong `private/` | **PASS** | Anonymous GET `http://minio.shop.local/buoi9-assets/private/...` bị từ chối **HTTP 403 Forbidden**. |
| 20 | Phân quyền | Anonymous đọc `avatars/` và `documents/` | **PASS** | Đều bị từ chối **HTTP 403 Forbidden** (mặc định private). |
| 21 | Phân quyền | Anonymous List Bucket | **PASS** | Bị từ chối **HTTP 403 Forbidden**. |
| 22 | Presigned URL | Ký Presigned URL cho object private | **PASS** | Sinh Presigned URL với AWS S3 Signature V4, TTL 300s. |
| 23 | Presigned URL | Tải file qua Presigned URL qua NGINX | **PASS** | GET qua `http://minio.shop.local/...` trả về **HTTP 200 OK** với nội dung nguyên vẹn. |
| 24 | Presigned URL | Chữ ký bị sửa đổi | **PASS** | Thay đổi token chữ ký bị MinIO từ chối ngay: **HTTP 403 SignatureDoesNotMatch**. |
| 25 | NGINX Proxy | Giữ nguyên Host header | **PASS** | `proxy_set_header Host $http_host;` giữ nguyên `minio.shop.local` giúp khớp chữ ký S3. |
| 26 | Upload Limit | Upload file > 1MB (< 5MB) | **PASS** | Upload file PDF 2MB (2,000,000 bytes) thành công trả về **HTTP 201 Created**. |
| 27 | Upload Limit | Upload file vượt trần (> 5MB) | **PASS** | Upload file 6MB bị từ chối **HTTP 413 Payload Too Large** `{"source":"backend","message":"File too large"}`. |
| 28 | Upload Limit | File không đúng định dạng allowlist | **PASS** | Upload file `.bin` (`application/octet-stream`) bị từ chối **HTTP 400 Bad Request**. |
| 29 | Cleanup | Dọn dẹp file tạm trên đĩa | **PASS** | File tạm trong `/tmp/buoi9-uploads` được xóa sạch trong khối `finally` cả khi thành công lẫn khi lỗi. |
| 30 | CLI Quản trị | Script xóa bucket từ chối bucket không rỗng | **PASS** | Chạy `delete-demo-bucket.js` với bucket có chứa file -> TỪ CHỐI xóa với cảnh báo an toàn. |
| 31 | Kế thừa Buổi 8 | API sản phẩm `/api/products` | **PASS** | Truy vấn danh sách sản phẩm thành công qua NGINX trả về HTTP 200 OK. |
| 32 | Mở rộng | HTTPS / TLS Certificate | **NOT RUN** | Bản đầu tiên triển khai HTTP theo yêu cầu §4.4; chứng chỉ HTTPS chưa khởi tạo. |

---

## 2. Bằng chứng Lệnh Thực tế & Log Đầu ra

### 2.1. Kết quả Chạy Bộ Test Tự động (`scripts/test-buoi9.js`)
Lệnh chạy trong container `minio-admin`:
```bash
docker compose run --rm minio-admin node scripts/test-buoi9.js
```
Kết quả thực tế:
```text
====================================================
BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG BUỔI 9: MINIO / OBJECT STORAGE S3
====================================================

✅ [PASS] 1. Kiểm tra 2 Bucket demo tồn tại: buoi9-assets & buoi9-assets-archive tồn tại
✅ [PASS] 2. Upload Avatar mẫu (prefix avatars/): Size: 57 bytes
✅ [PASS] 3. Upload Tài liệu PDF mẫu (prefix documents/): Size: 41 bytes
✅ [PASS] 4. Upload Object Public (prefix public/): Key: public/test-public.txt
✅ [PASS] 5. Upload Object Private (prefix private/): Key: private/test-private.txt
✅ [PASS] 6. Liệt kê objects trong bucket: Tìm thấy 4 objects trong buoi9-assets
✅ [PASS] 7. Anonymous đọc object trong public/ qua NGINX: HTTP 200 OK - Nội dung khớp
✅ [PASS] 8. Anonymous đọc object trong private/ qua NGINX: HTTP 403 Forbidden - Bị chặn đúng chính sách
✅ [PASS] 9. Anonymous đọc avatars/ và documents/ qua NGINX: HTTP 403 Forbidden cho cả hai
✅ [PASS] 10. Anonymous List Bucket qua NGINX: HTTP 403 Forbidden - Không thể xem danh sách bucket
✅ [PASS] 11. Presigned URL hợp lệ cho object private qua NGINX: HTTP 200 OK - Tải dữ liệu mật thành công
✅ [PASS] 12. Presigned URL bị sai chữ ký: HTTP 403 SignatureDoesNotMatch - MinIO phát hiện giả mạo
✅ [PASS] 13. Rename object trong cùng bucket: Đã đổi documents/test-doc.pdf -> documents/test-doc-renamed.pdf
✅ [PASS] 14. Move object giữa 2 bucket demo: Đã chuyển sang buoi9-assets-archive/avatars/archived-avatar.svg
✅ [PASS] 15. Xóa object khỏi bucket: Object public/test-public.txt đã được xóa sạch
✅ [PASS] 16. Kế thừa API sản phẩm Buổi 8 (/api/products): HTTP 200 OK - Danh sách sản phẩm hoạt động

====================================================
TỔNG HỢP KẾT QUẢ KIỂM THỬ:
PASS: 16 / 16
FAIL: 0 / 16
====================================================
```

### 2.2. Kiểm thử Upload file 2MB (> 1MB, < 5MB)
Lệnh:
```bash
curl.exe -i -F "file=@test-2mb.bin;filename=test-2mb.pdf;type=application/pdf" -F "bucket=buoi9-assets" -F "prefix=documents/" http://127.0.0.1/api/files
```
Kết quả:
```text
HTTP/1.1 201 Created
Server: nginx/1.30.5
X-Instance: backend-1
Content-Type: application/json; charset=utf-8
{"success":true,"message":"Upload file lên MinIO thành công.","data":{"bucket":"buoi9-assets","key":"documents/1792344917057-test-2mb.pdf","size":2000000,...}}
```

### 2.3. Kiểm thử Upload file 6MB (> 5MB)
Lệnh:
```bash
curl.exe -i -F "file=@test-6mb.bin;filename=test-6mb.pdf;type=application/pdf" http://127.0.0.1/api/files
```
Kết quả:
```text
HTTP/1.1 413 Payload Too Large
Server: nginx/1.30.5
X-Instance: backend-2
Content-Type: application/json; charset=utf-8
{"success":false,"source":"backend","message":"File too large"}
```

### 2.4. Kiểm thử Script Xóa Bucket Từ chối khi Bucket không rỗng
Lệnh:
```bash
docker compose run --rm minio-admin node scripts/delete-demo-bucket.js buoi9-assets --confirm
```
Kết quả:
```text
====================================================
[Script] Yêu cầu xóa bucket: "buoi9-assets"
====================================================
[Script] ❌ TỪ CHỐI XÓA: Bucket "buoi9-assets" đang chứa 2 object(s)!
         Nguyên tắc an toàn: Không tự động xóa object. Hãy xóa toàn bộ object trước
         thông qua MinIO Console hoặc Backend UI rồi chạy lại lệnh này.
```
