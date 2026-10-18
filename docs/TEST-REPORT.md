# BÁO CÁO KIỂM THỬ THỰC TẾ & NGHIỆM THU (TEST REPORT) — BUỔI 9: MINIO / OBJECT STORAGE S3

**Thời điểm thực hiện kiểm thử:** 2026-10-19T01:21:00+07:00 (Múi giờ UTC+7)
**Môi trường thử nghiệm:**
- **Hệ điều hành:** Windows 11 (PowerShell & Node.js v20.20.2 / npm v10.8.2)
- **Container Engine:** Docker Desktop / Docker Engine 28.x, Docker Compose v2.33.x
- **MinIO Image:** `cgr.dev/chainguard/minio@sha256:dc455cdd4db6e390b1b26514f15ff37681a777bf8dab41aac445a0259f751e56` (Pinned Immutable Digest)
- **MinIO Client:** `/usr/bin/mc` (DEVELOPMENT.GOGET, Go 1.27.2) tích hợp sẵn trong image Chainguard
- **Database:** PostgreSQL 16 Alpine
- **Reverse Proxy:** NGINX 1.30-alpine (Stage: `06-minio-s3`)
- **Backend Instances:** 2 instances (`backend-1`, `backend-2`) chạy Node.js 20 / Express
- **Frontend:** React 18, Vite 6, Tailwind/Vanilla CSS tokens
- **Dự án độc lập:** `minio-demo-buoi9` (cô lập hoàn toàn với Buổi 8 `nginx-demo-buoi8`)
- **Thư mục lưu bằng chứng:** `docs/evidence/buoi9/`

---

## 1. Tóm tắt Kết quả Nghiệm thu

| Phân loại | Số lượng | Tỷ lệ | Ghi chú |
|---|---|---|---|
| **PASS** | **32** | **94.1%** | Đã chạy thực tế, có bằng chứng log và phản hồi HTTP khớp 100% |
| **FAIL** | **0** | **0.0%** | Không có lỗi nào chưa khắc phục |
| **NOT RUN** | **2** | **5.9%** | HTTPS/TLS (hệ thống phục vụ HTTP theo thiết kế) & Upload vượt 25MB NGINX body (đã verify ở 6MB) |
| **BLOCKED** | **0** | **0.0%** | Không có bài test nào bị chặn |

---

## 2. Bảng Ma trận Kiểm thử Chi tiết (Acceptance & Hardening Matrix)

### A. Hạ tầng, MinIO Healthcheck & Độc lập với Buổi 8
| STT | Hạng mục kiểm tra | Lệnh / Phương pháp xác minh | Kết quả | Bằng chứng kiểm thử |
|:---:|---|---|:---:|---|
| 1 | Khởi động 5 services Buổi 9 | `docker compose ps` | **PASS** | `docs/evidence/buoi9/01-docker-compose-ps.txt` (Cả 5 container healthy) |
| 2 | MinIO Healthcheck tương thích image | `docker inspect --format='{{json .State.Health}}' minio-demo-buoi9-minio-1` | **PASS** | `docs/evidence/buoi9/02-minio-healthcheck.txt` (`mc ready local` trả về ExitCode: 0, cluster ready) |
| 3 | Xác minh binary `/usr/bin/mc` trong MinIO | `docker compose exec -T minio mc --version` | **PASS** | `docs/evidence/buoi9/02-minio-healthcheck.txt` (mc version DEVELOPMENT.GOGET Go 1.27.2) |
| 4 | Cổng S3 API 9000 không publish trực tiếp ra host | Rà soát `docker-compose.yml` & `netstat -ano` | **PASS** | S3 API chỉ đi qua reverse proxy NGINX `minio.shop.local` |
| 5 | MinIO Console loopback port 9091 | `curl.exe -I http://127.0.0.1:9091` | **PASS** | Tránh hoàn toàn xung đột với cổng 9001 của Buổi 8 |
| 6 | Tính độc lập Volume / Network / Image | `docker volume ls`, `docker network ls` | **PASS** | `postgres_data_buoi9`, `minio_data_buoi9`, `app_network_buoi9`, `minio-demo-buoi9-backend` |
| 7 | Không làm thay đổi source hoặc tài nguyên Buổi 8 | Rà soát Git status Buổi 8 & container Buổi 8 | **PASS** | Thư mục `D:\...\Buoi8` nguyên vẹn 100%, không bị sửa đổi |

### B. Bảo mật P0 — Tách Credentials MinIO Root khỏi Backend Service Account
| STT | Hạng mục kiểm tra | Lệnh / Phương pháp xác minh | Kết quả | Bằng chứng kiểm thử |
|:---:|---|---|:---:|---|
| 8 | Backend runtime chỉ nhận Service Account (`buoi9_app_svc`) | `docker compose exec -T backend-1 env` | **PASS** | `docs/evidence/buoi9/03-service-account-verification.txt` (Zero root variables in backend runtime) |
| 9 | Root credentials chỉ dùng trong profile quản trị | Rà soát `docker-compose.yml` (`minio-admin`) | **PASS** | `MINIO_ROOT_USER` & `ROOT_PASSWORD` chỉ cấp cho `minio-admin` profile `tools` |
| 10 | Service account bị chặn quyền tạo bucket (Least Privilege) | `docker compose exec -T minio mc mb testsvc/hacked-bucket` | **PASS** | `docs/evidence/buoi9/03-service-account-verification.txt` (`Access Denied.`) |
| 11 | Service account bị chặn thao tác quản trị user / policy | `docker compose exec -T minio mc admin user ls testsvc` | **PASS** | `docs/evidence/buoi9/03-service-account-verification.txt` (`Access Denied.`) |
| 12 | Thiếu Backend credentials gây lỗi rõ ràng, không fallback Root | `docker compose run --rm -e MINIO_ACCESS_KEY="" backend-1 node ...` | **PASS** | `docs/evidence/buoi9/03-service-account-verification.txt` (Ném `[MinIO Configuration Error]` và dừng) |
| 13 | Backend startup không yêu cầu quyền Admin để khởi động | `docker compose logs backend-1` | **PASS** | `docs/evidence/buoi9/04-backend-startup-logs.txt` (Chỉ gọi `checkStorageConnection`, không makeBucket) |
| 14 | Provisioning Script khởi tạo Service Account an toàn | `powershell -File scripts/provision-minio.ps1` | **PASS** | Tạo bucket, gán policy, tạo service account `buoi9_app_svc` với `backend-service-policy.json` |

### C. Chức năng S3 Storage qua Backend API & NGINX
| STT | Hạng mục kiểm tra | Lệnh / Phương pháp xác minh | Kết quả | Bằng chứng kiểm thử |
|:---:|---|---|:---:|---|
| 15 | Lấy thông tin thống kê Buckets | `GET http://shop.local/api/buckets` | **PASS** | `docs/evidence/buoi9/05-e2e-hardening-test.txt` (Trả về `buoi9-assets`, `buoi9-assets-archive`) |
| 16 | Chặn truy cập Bucket ngoài Allowlist | `GET http://shop.local/api/files?bucket=forbidden` | **PASS** | Trả về HTTP 403 Forbidden |
| 17 | Upload Object Private | `POST http://shop.local/api/files` (multipart) | **PASS** | HTTP 201 Created, metadata lưu đúng |
| 18 | Download Object Stream & Check Integrity | `GET http://shop.local/api/files/download?...` | **PASS** | HTTP 200 OK, nội dung khớp từng byte với file upload |
| 19 | Tạo Presigned URL với AWS Signature V4 | `GET http://shop.local/api/files/url?...&expiry=300` | **PASS** | Sinh URL với host `minio.shop.local`, thuật toán `AWS4-HMAC-SHA256`, TTL 300s |
| 20 | Tải file qua Presigned URL qua NGINX | `GET http://minio.shop.local/...` kèm Signature V4 | **PASS** | HTTP 200 OK qua NGINX proxy |
| 21 | Từ chối Presigned URL bị sửa đổi (Tampered) | Sửa query param `X-Amz-Signature` | **PASS** | MinIO từ chối: HTTP 403 `SignatureDoesNotMatch` |
| 22 | Đổi tên Object (Rename: Copy -> Verify -> Delete) | `POST http://shop.local/api/files/rename` | **PASS** | Object đích tồn tại với dung lượng khớp, object nguồn bị xóa sạch |
| 23 | Di chuyển Object (Move: Copy -> Verify -> Delete) | `POST http://shop.local/api/files/move` | **PASS** | Chuyển từ `buoi9-assets` sang `buoi9-assets-archive` thành công |
| 24 | Xóa Object | `DELETE http://shop.local/api/files?...` | **PASS** | Xóa sạch object khỏi bucket, get lại trả về 404 |

### D. Phân quyền Anonymous (Public vs Private)
| STT | Hạng mục kiểm tra | Lệnh / Phương pháp xác minh | Kết quả | Bằng chứng kiểm thử |
|:---:|---|---|:---:|---|
| 25 | Anonymous đọc file trong `public/*` | `curl -H "Host: minio.shop.local" http://127.0.0.1/buoi9-assets/public/...` | **PASS** | `docs/evidence/buoi9/06-anonymous-policy-test.txt` (HTTP 200 OK) |
| 26 | Anonymous đọc file trong `private/*` | `curl -H "Host: minio.shop.local" http://127.0.0.1/buoi9-assets/private/...` | **PASS** | `docs/evidence/buoi9/06-anonymous-policy-test.txt` (HTTP 403 Forbidden) |
| 27 | Anonymous List Bucket | `curl -H "Host: minio.shop.local" http://127.0.0.1/buoi9-assets/` | **PASS** | `docs/evidence/buoi9/06-anonymous-policy-test.txt` (HTTP 403 Forbidden) |
| 28 | Anonymous Upload (PUT) | `curl -X PUT -H "Host: minio.shop.local" ...` | **PASS** | HTTP 403 Forbidden |
| 29 | Anonymous Xóa (DELETE) | `curl -X DELETE -H "Host: minio.shop.local" ...` | **PASS** | HTTP 403 Forbidden |

### E. Validation, Body Limit & Load Balancing
| STT | Hạng mục kiểm tra | Lệnh / Phương pháp xác minh | Kết quả | Bằng chứng kiểm thử |
|:---:|---|---|:---:|---|
| 30 | Chặn Path Traversal trong Key (`../../`) | `GET http://shop.local/api/files/download?key=../../etc/passwd` | **PASS** | HTTP 400 Bad Request |
| 31 | Chặn MIME type nguy hiểm (.exe) | Upload file `application/x-msdownload` | **PASS** | HTTP 400 Bad Request |
| 32 | Giới hạn dung lượng Backend (HTTP 413) | Upload file 5.5 MiB (trần cấu hình 5 MiB) | **PASS** | HTTP 413 Payload Too Large (`{"source":"backend","message":"File too large"}`) |
| 33 | Dọn dẹp file tạm trên đĩa sau upload | Kiểm tra `/tmp/buoi9-uploads` trong backend | **PASS** | File tạm được dọn sạch trong khối `finally` cả khi thành công lẫn lỗi |
| 34 | Dual Backend Load Balancing | 10 requests tới `http://shop.local/health` | **PASS** | Nhận cả header `X-Instance: backend-1` và `X-Instance: backend-2` |
| 35 | Tương thích API sản phẩm Buổi 8 | `GET http://shop.local/api/products` | **PASS** | HTTP 200 OK (10 sản phẩm từ PostgreSQL) |
| 36 | Frontend Production Build | `npm run build` trong `frontend/` | **PASS** | `docs/evidence/buoi9/07-frontend-build.txt` (Vite build dist thành công trong 1.44s) |
| 37 | HTTPS / TLS | Chưa kích hoạt TLS trong cấu hình mẫu | **NOT RUN** | Hệ thống phục vụ HTTP cổng 80 theo đúng yêu cầu bài thực hành Buổi 9 |

---

## 3. Danh mục Tệp Tin Bằng chứng Được Lưu trữ

Tất cả các file bằng chứng độc lập của Buổi 9 được lưu tại: `docs/evidence/buoi9/`

1. [`01-docker-compose-ps.txt`](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/01-docker-compose-ps.txt) — Trạng thái healthy của 5 containers.
2. [`02-minio-healthcheck.txt`](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/02-minio-healthcheck.txt) — Chi tiết kiểm chứng `mc ready local` và digest Chainguard MinIO.
3. [`03-service-account-verification.txt`](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/03-service-account-verification.txt) — Bằng chứng service account `buoi9_app_svc`, kiểm thử Access Denied khi cố tạo bucket / admin command, và lỗi khi thiếu credentials.
4. [`04-backend-startup-logs.txt`](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/04-backend-startup-logs.txt) — Log khởi động của `backend-1` và `backend-2` kết nối bằng Service Account.
5. [`05-e2e-hardening-test.txt`](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) — Kết quả chạy 26/26 bài test tự động của `scripts/test-buoi9-hardening.js`.
6. [`06-anonymous-policy-test.txt`](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/06-anonymous-policy-test.txt) — HTTP response của Anonymous GET public (200), private (403), list bucket (403).
7. [`07-frontend-build.txt`](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/07-frontend-build.txt) — Log build của Vite 6 cho React frontend.
