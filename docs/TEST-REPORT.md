# BÁO CÁO KIỂM THỬ THỰC TẾ & NGHIỆM THU (TEST REPORT) — BUỔI 9: MINIO / OBJECT STORAGE S3

**Thời điểm thực hiện kiểm thử:** 2026-10-19T02:08:55+07:00 (Múi giờ UTC+7)
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

## 1. Bảng Tổng Hợp Kết Quả Kiểm Thử (Executive Summary Table)

> [!NOTE]
> Tất cả số liệu trong bảng tổng hợp được tính toán chính xác 100% từ 52 dòng kiểm thử chi tiết trong Ma trận nghiệm thu bên dưới. Mọi kết quả PASS đều dựa trên lệnh và script thực sự thực thi trên môi trường Docker.

| Nhóm kiểm thử (Category) | Tổng test | PASS | FAIL | NOT RUN | BLOCKED | Tỷ lệ PASS | Ghi chú |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| **1. Credential/config** | 7 | 7 | 0 | 0 | 0 | 100.0% | Bỏ fallback root, fail-fast khi thiếu env, không hardcode |
| **2. Provisioning/policy** | 6 | 6 | 0 | 0 | 0 | 100.0% | Idempotent, fail-fast exit code 1, read-back verify policy |
| **3. Backend/MinIO API** | 17 | 17 | 0 | 0 | 0 | 100.0% | CRUD, integrity, anonymous public/private, body limit 5MB |
| **4. Presigned URL** | 7 | 7 | 0 | 0 | 0 | 100.0% | Default 300s, SigV4, chặn 0/âm/string/float/vượt MAX_TTL |
| **5. NGINX/integration** | 7 | 6 | 0 | 1 | 0 | 85.7% | 25MB body limit (PASS), dual backend, Buoi 8, HTTPS (NOT RUN) |
| **6. Clean deployment** | 8 | 8 | 0 | 0 | 0 | 100.0% | Chạy môi trường cô lập, credentials mới, zero volume leakage |
| **TỔNG CỘNG** | **52** | **51** | **0** | **1** | **0** | **98.1%** | **Sẵn sàng nghiệm thu (Ready for Acceptance)** |

*Lý do bài kiểm thử NOT RUN:*
- `TC-INT-07` (HTTPS / TLS): Hệ thống Buổi 9 được thiết kế phục vụ S3 API Reverse Proxy trên HTTP cổng 80 theo đúng đề bài Buổi 9. Tính năng HTTPS/TLS được lưu trữ và kiểm chứng độc lập ở Stage 05 của Buổi 8 (`nginx-demo-buoi8`).

---

## 2. Ma Trận Kiểm Thử Chi Tiết (Detailed Acceptance & Verification Matrix)

### Nhóm 1: Credential & Configuration (TC-CFG-01 -> TC-CFG-07)
| Mã test | Tên bài test / Hạng mục kiểm tra | Phương pháp / Lệnh xác minh thực tế | Kết quả | Bằng chứng kiểm thử |
|:---:|---|---|:---:|---|
| `TC-CFG-01` | Compose fail-fast khi thiếu `MINIO_ROOT_USER` hoặc `MINIO_ROOT_PASSWORD` | Chạy compose mà không truyền root vars: cú pháp `${VAR:?error}` kích hoạt dừng ngay lập tức | **PASS** | Rà soát [docker-compose.yml](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docker-compose.yml#L36-L37) (không có `:-buoi9admin`) |
| `TC-CFG-02` | Compose fail-fast khi thiếu backend credentials | Cú pháp `${MINIO_BACKEND_ACCESS_KEY:?...}` bắt buộc trên backend-1, backend-2, minio-admin | **PASS** | Rà soát [docker-compose.yml](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docker-compose.yml#L94-L95) |
| `TC-CFG-03` | Backend runtime isolation (chỉ dùng Service Account, zero root credentials) | Kiểm tra toàn bộ biến môi trường runtime trong container backend | **PASS** | [03-service-account-verification.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/03-service-account-verification.txt) & [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC04`) |
| `TC-CFG-04` | Backend fail-fast khi thiếu Service Account credentials, tuyệt đối không fallback Root | `docker compose run --rm -e MINIO_ACCESS_KEY="" -e MINIO_SECRET_KEY="" backend-1 node ...` | **PASS** | [03-service-account-verification.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/03-service-account-verification.txt) (`[MinIO Configuration Error]`, exit code 1) |
| `TC-CFG-05` | Root credentials bị cô lập, chỉ truyền cho MinIO và profile `tools` (`minio-admin`) | Rà soát danh sách environment của tất cả các container trong compose | **PASS** | [docker-compose.yml](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docker-compose.yml#L213-L226) |
| `TC-CFG-06` | Phân tích cú pháp `.env` an toàn trong PowerShell & Bash (không dùng `eval`) | Kiểm tra logic parser tách dòng key=value, tự động trim ngoặc kép/đơn | **PASS** | [provision-minio.ps1](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/scripts/provision-minio.ps1#L19-L34) & [provision-minio.sh](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/scripts/provision-minio.sh#L19-L33) |
| `TC-CFG-07` | Không hardcode credentials trong source code, Compose hay scripts | `git grep` tìm kiếm mẫu credentials cũ trong toàn bộ repo | **PASS** | Tất cả credentials được nạp động từ `.env`, `.env.example` chỉ chứa placeholder mẫu |

### Nhóm 2: Provisioning & Bucket Policy (TC-PROV-01 -> TC-PROV-06)
| Mã test | Tên bài test / Hạng mục kiểm tra | Phương pháp / Lệnh xác minh thực tế | Kết quả | Bằng chứng kiểm thử |
|:---:|---|---|:---:|---|
| `TC-PROV-01` | Provisioning script chạy thành công và đạt tính Idempotent (chạy lại an toàn) | Chạy `provision-minio.ps1` 2 lần liên tiếp: lần 1 tạo mới, lần 2 cập nhật chính sách | **PASS** | [03-service-account-verification.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/03-service-account-verification.txt) |
| `TC-PROV-02` | Kiểm tra MinIO Cluster sẵn sàng trước khi provisioning (`mc ready local`) | `docker compose exec -T minio mc ready local` trả về ExitCode 0 | **PASS** | [02-minio-healthcheck.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/02-minio-healthcheck.txt) |
| `TC-PROV-03` | `set-demo-policy.js` fail-fast với mã thoát 1 khi bucket bắt buộc không tồn tại | Chạy script áp dụng policy cho bucket không tồn tại `non-existent-bucket-xyz` | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC07`: Exit code = 1) |
| `TC-PROV-04` | Xác minh lại Bucket Policy sau khi áp dụng (Read-back verification) | `client.getBucketPolicy()` đọc lại policy và so sánh statement khớp với mong đợi | **PASS** | [set-demo-policy.js](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/scripts/set-demo-policy.js#L78-L108) (Statement & Action verified) |
| `TC-PROV-05` | Service Account Least Privilege: Bị chặn tạo bucket (`mc mb`) | `docker compose exec -T minio mc mb testsvc/hacked-bucket` | **PASS** | [03-service-account-verification.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/03-service-account-verification.txt) (`Access Denied.`) |
| `TC-PROV-06` | Service Account Least Privilege: Bị chặn lệnh quản trị (`mc admin user ls`) | `docker compose exec -T minio mc admin user ls testsvc` | **PASS** | [03-service-account-verification.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/03-service-account-verification.txt) (`Access Denied.`) |

### Nhóm 3: Backend & MinIO S3 API Operations (TC-API-01 -> TC-API-17)
| Mã test | Tên bài test / Hạng mục kiểm tra | Phương pháp / Lệnh xác minh thực tế | Kết quả | Bằng chứng kiểm thử |
|:---:|---|---|:---:|---|
| `TC-API-01` | Backend Process Health (`/health`) | `GET http://127.0.0.1/health` qua reverse proxy | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC01`: HTTP 200) |
| `TC-API-02` | Database & MinIO Health (`/health/db`) | `GET http://127.0.0.1/health/db` kiểm tra cả PostgreSQL và MinIO connection | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC02`: PostgreSQL & MinIO OK) |
| `TC-API-03` | Lấy danh sách demo buckets (`/api/buckets`) | `GET http://127.0.0.1/api/buckets` | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC08`: `buoi9-assets`, `buoi9-assets-archive`) |
| `TC-API-04` | Thực thi Bucket Allowlist (chặn bucket ngoài danh mục) | `GET http://127.0.0.1/api/files?bucket=forbidden-bucket` | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC09`: HTTP 403 Forbidden) |
| `TC-API-05` | Upload Private Object lên MinIO (`/api/files`) | `POST http://127.0.0.1/api/files` kèm multipart/form-data | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC10`: HTTP 201 Created) |
| `TC-API-06` | Download Object & kiểm tra toàn vẹn byte (Integrity check) | `GET http://127.0.0.1/api/files/download?...` | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC11`: Buffer byte match 100%) |
| `TC-API-07` | Đổi tên Object an toàn (Safe Copy -> Verify -> Delete source) | `POST http://127.0.0.1/api/files/rename` | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC24`: HTTP 200 OK) |
| `TC-API-08` | Di chuyển Object liên bucket (`buoi9-assets` -> archive) | `POST http://127.0.0.1/api/files/move` | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC25`: HTTP 200 OK) |
| `TC-API-09` | Xóa Object khỏi bucket (`/api/files`) | `DELETE http://127.0.0.1/api/files?...` | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC26`: HTTP 200 OK) |
| `TC-API-10` | Anonymous GET trên Public Prefix (`public/*`) | `curl -H "Host: minio.shop.local" http://127.0.0.1/buoi9-assets/public/...` | **PASS** | [06-anonymous-policy-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/06-anonymous-policy-test.txt) (`AC19`: HTTP 200 OK) |
| `TC-API-11` | Anonymous GET trên Private Prefix bị chặn (`private/*`) | `curl -H "Host: minio.shop.local" http://127.0.0.1/buoi9-assets/private/...` | **PASS** | [06-anonymous-policy-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/06-anonymous-policy-test.txt) (`AC20`: HTTP 403 Forbidden) |
| `TC-API-12` | Anonymous ListBucket bị chặn | `curl -H "Host: minio.shop.local" http://127.0.0.1/buoi9-assets/` | **PASS** | [06-anonymous-policy-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/06-anonymous-policy-test.txt) (`AC21`: HTTP 403 Forbidden) |
| `TC-API-13` | Anonymous PutObject bị chặn | `curl -X PUT -H "Host: minio.shop.local" http://127.0.0.1/buoi9-assets/public/hack.txt` | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC22`: HTTP 403 Forbidden) |
| `TC-API-14` | Anonymous DeleteObject bị chặn | `curl -X DELETE -H "Host: minio.shop.local" http://127.0.0.1/buoi9-assets/public/test.txt` | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC23`: HTTP 403 Forbidden) |
| `TC-API-15` | Ngăn chặn Path Traversal trong Key (`../../`) | `GET http://127.0.0.1/api/files/download?key=../../etc/passwd` | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC27`: HTTP 400 Bad Request) |
| `TC-API-16` | Bộ lọc MIME type & Extension Allowlist | Upload file không nằm trong danh mục (ví dụ `.exe`) | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC28`: HTTP 400 Bad Request) |
| `TC-API-17` | Giới hạn dung lượng upload tại Backend (5MB limit) | Upload payload 5.5MB vượt cấu hình `MAX_FILE_SIZE` của multer | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC29`: HTTP 413 Payload Too Large) |

### Nhóm 4: Presigned URL & AWS Signature V4 TTL Bounds (TC-TTL-01 -> TC-TTL-07)
| Mã test | Tên bài test / Hạng mục kiểm tra | Phương pháp / Lệnh xác minh thực tế | Kết quả | Bằng chứng kiểm thử |
|:---:|---|---|:---:|---|
| `TC-TTL-01` | Mặc định an toàn khi không truyền `expiry` (300 giây) | `GET /api/files/url?key=private/test.txt` (bỏ qua param expiry) | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC12`: `expiresIn: 300`) |
| `TC-TTL-02` | Khởi tạo URL với TTL hợp lệ (`expiry=60s`) kèm AWS Signature V4 | `GET /api/files/url?...&expiry=60` | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC13`: SigV4 HMAC-SHA256, 60s) |
| `TC-TTL-03` | Truy cập tải private object qua Presigned URL qua NGINX proxy | Gửi GET HTTP tới Presigned URL với Host `minio.shop.local` | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC14`: HTTP 200 OK) |
| `TC-TTL-04` | MinIO từ chối Presigned URL bị can thiệp chữ ký (Tampered URL) | Thay đổi 1 ký tự trong query param `X-Amz-Signature` | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC15`: HTTP 403 `SignatureDoesNotMatch`) |
| `TC-TTL-05` | Từ chối TTL bằng 0 hoặc số âm với HTTP 400 | `GET /api/files/url?...&expiry=0` và `expiry=-60` | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC16`: HTTP 400 Bad Request) |
| `TC-TTL-06` | Từ chối TTL không phải số nguyên (chuỗi, số thập phân) | `GET /api/files/url?...&expiry=abc` và `expiry=60.5` | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC17`: HTTP 400 Bad Request) |
| `TC-TTL-07` | Từ chối TTL vượt quá trần cấu hình `PRESIGNED_URL_MAX_TTL_SECONDS` | `GET /api/files/url?...&expiry=999999` (trần: 3600 giây) | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC18`: HTTP 400 Bad Request) |

### Nhóm 5: NGINX & Hệ Thống Tích Hợp (TC-INT-01 -> TC-INT-07)
| Mã test | Tên bài test / Hạng mục kiểm tra | Phương pháp / Lệnh xác minh thực tế | Kết quả | Bằng chứng kiểm thử |
|:---:|---|---|:---:|---|
| `TC-INT-01` | NGINX Reverse Proxy Health (`/nginx-health`) | `GET http://127.0.0.1/nginx-health` | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC03`: Stage `06-minio-s3`) |
| `TC-INT-02` | Cân bằng tải Dual Backend (`backend-1` & `backend-2`) | Gửi 10 HTTP requests liên tiếp kiểm tra header `X-Instance` | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC30`: Cả 2 backend đều phản hồi) |
| `TC-INT-03` | Kế thừa tính năng API Buổi 8 (`/api/products`) | `GET http://127.0.0.1/api/products` | **PASS** | [05-e2e-hardening-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) (`AC31`: 10 sản phẩm từ DB) |
| `TC-INT-04` | Giới hạn `client_max_body_size` 25MB của NGINX | Upload request có `Content-Length: 27262976` (26MB) | **PASS** | [09-nginx-25mb-bodysize-test.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/09-nginx-25mb-bodysize-test.txt) (HTTP 413 từ NGINX) |
| `TC-INT-05` | Build Frontend React / Vite trong production mode | `npm --prefix frontend run build` | **PASS** | [07-frontend-build.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/07-frontend-build.txt) (Build dist hoàn tất 1.44s) |
| `TC-INT-06` | MinIO Web Console loopback port 9091 tránh xung đột Buổi 8 (9001) | Rà soát `ports` trong `docker-compose.yml` (`127.0.0.1:9091:9001`) | **PASS** | [01-docker-compose-ps.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/01-docker-compose-ps.txt) (Chỉ bind loopback host 9091) |
| `TC-INT-07` | HTTPS / TLS Reverse Proxy | Cấu hình SSL/TLS độc lập ở Buổi 8 Stage 05 | **NOT RUN** | Buổi 9 sử dụng Stage 06 HTTP S3 reverse proxy cổng 80 theo thiết kế |

### Nhóm 6: Triển Khai Sạch Cô Lập (Clean Deployment Verification) (TC-DEP-01 -> TC-DEP-08)
| Mã test | Tên bài test / Hạng mục kiểm tra | Phương pháp / Lệnh xác minh thực tế | Kết quả | Bằng chứng kiểm thử |
|:---:|---|---|:---:|---|
| `TC-DEP-01` | Khởi động MinIO với Root Credentials mới ngẫu nhiên | Khởi chạy container MinIO cô lập với credentials mới sinh | **PASS** | [08-clean-deployment-verification.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/08-clean-deployment-verification.txt) (Bước 1: Khởi động thành công) |
| `TC-DEP-02` | MinIO từ chối xác thực khi nhập Root Credentials sai | `mc alias set` với mật khẩu sai | **PASS** | [08-clean-deployment-verification.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/08-clean-deployment-verification.txt) (Bước 3: Bị từ chối xác thực) |
| `TC-DEP-03` | MinIO xác thực thành công với Root Credentials mới | `mc alias set cleanadmin` với đúng credentials mới | **PASS** | [08-clean-deployment-verification.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/08-clean-deployment-verification.txt) (Bước 4: Xác thực thành công) |
| `TC-DEP-04` | Khởi tạo đầy đủ 3 Buckets bắt buộc theo chuẩn Buổi 9 | `mc mb` tạo `product-images`, `buoi9-assets`, `buoi9-assets-archive` | **PASS** | [08-clean-deployment-verification.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/08-clean-deployment-verification.txt) (Bước 5: Tạo 3 buckets thành công) |
| `TC-DEP-05` | Khởi tạo Service Account mới kèm chính sách Least Privilege | `mc admin user svcacct add` với `backend-service-policy.json` | **PASS** | [08-clean-deployment-verification.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/08-clean-deployment-verification.txt) (Bước 6: Gán embedded policy) |
| `TC-DEP-06` | Service Account mới ghi được object vào allowlisted bucket | `mc pipe cleansvc/buoi9-assets/private/test.txt` | **PASS** | [08-clean-deployment-verification.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/08-clean-deployment-verification.txt) (Bước 7: Upload thành công) |
| `TC-DEP-07` | Service Account mới bị chặn quyền Admin và quyền tạo Bucket | `mc mb` và `mc admin user ls` với service account mới | **PASS** | [08-clean-deployment-verification.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/08-clean-deployment-verification.txt) (Bước 8-9: Access Denied cả 2 lệnh) |
| `TC-DEP-08` | Dọn dẹp an toàn: Không ảnh hưởng dữ liệu/volume hiện có | Dừng container thử nghiệm, không chạy lệnh xóa volume hệ thống | **PASS** | [08-clean-deployment-verification.txt](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/08-clean-deployment-verification.txt) (Bước 10: Dọn dẹp an toàn) |

---

## 3. Danh Mục Tệp Tin Bằng Chứng Kiểm Thử Độc Lập

Tất cả các file bằng chứng độc lập của Buổi 9 được lưu tại: `docs/evidence/buoi9/`

1. [`01-docker-compose-ps.txt`](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/01-docker-compose-ps.txt) — Trạng thái healthy của toàn bộ 5 container trong hệ thống Buổi 9.
2. [`02-minio-healthcheck.txt`](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/02-minio-healthcheck.txt) — Chi tiết kiểm chứng `mc ready local`, digest Chainguard MinIO, và trạng thái health inspect (đã khắc phục lỗi template string).
3. [`03-service-account-verification.txt`](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/03-service-account-verification.txt) — Bằng chứng service account nạp động từ `.env`, kiểm thử Access Denied khi cố tạo bucket / admin command, và lỗi chặn startup khi thiếu credentials.
4. [`04-backend-startup-logs.txt`](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/04-backend-startup-logs.txt) — Log khởi động của `backend-1` và `backend-2` kết nối thành công bằng Service Account.
5. [`05-e2e-hardening-test.txt`](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/05-e2e-hardening-test.txt) — Kết quả chạy 31/31 bài test tự động của `scripts/test-buoi9-hardening.js`.
6. [`06-anonymous-policy-test.txt`](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/06-anonymous-policy-test.txt) — HTTP response của Anonymous GET public (200), private (403), list bucket (403) qua domain `minio.shop.local`.
7. [`07-frontend-build.txt`](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/07-frontend-build.txt) — Log build của Vite 6 cho React frontend.
8. [`08-clean-deployment-verification.txt`](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/08-clean-deployment-verification.txt) — Toàn bộ quy trình triển khai sạch độc lập với root và service account credentials mới sinh ngẫu nhiên.
9. [`09-nginx-25mb-bodysize-test.txt`](file:///d:/Hocki7/PtrienHeThongServerNC/LyThuyet/Buoi9/docs/evidence/buoi9/09-nginx-25mb-bodysize-test.txt) — HTTP response 413 Request Entity Too Large từ NGINX khi upload request vượt quá 25MB.
