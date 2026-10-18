# CHECKLIST THUYẾT TRÌNH VÀ DEMO — BUỔI 9: MINIO / OBJECT STORAGE S3

Checklist này được thiết kế theo thứ tự trình diễn trên lớp (15-20 phút), giúp sinh viên trình bày lưu loát, tự tin và có bằng chứng trực quan trên giao diện Web UI và MinIO Console.

---

## 1. Mở đầu & Kiến trúc Hệ thống (2 phút)
- [ ] Mở slide hoặc sơ đồ kiến trúc:
  - Giải thích **Object Storage** khác với lưu file cục bộ (Filesystem) và Database:
    - Lưu file cục bộ: Phụ thuộc ổ đĩa server đơn lẻ, khó scale khi có nhiều backend instances.
    - Database (BLOB): Nặng DB, khó backup/restore, chi phí I/O cao.
    - Object Storage S3: Lưu trữ phi cấu trúc không giới hạn, phân tán, gán metadata, truy cập qua HTTP/HTTPS URL hoặc Presigned URL.
  - Sơ đồ luồng NGINX:
    - `http://shop.local`: Phục vụ Frontend React + Express API.
    - `http://minio.shop.local`: Reverse proxy cho MinIO S3 API (giữ nguyên Host header để xác thực AWS Signature V4).
    - `http://127.0.0.1:9091`: Giao diện quản trị MinIO Console.

---

## 2. Kiểm tra Hạ tầng Docker & MinIO Console (3 phút)
- [ ] Chạy lệnh xem các container đang hoạt động:
  ```bash
  docker compose ps
  ```
  - Chỉ ra 5 container: `minio`, `db`, `backend-1`, `backend-2`, `nginx` đều `(healthy)`.
- [ ] Mở trình duyệt truy cập **MinIO Console**:
  - Địa chỉ: `http://127.0.0.1:9091`
  - Đăng nhập:
    - Username: `buoi9admin`
    - Password: `buoi9_minio_root_secret_2026`
- [ ] Trình diễn phần **Buckets** trên MinIO Console:
  - Giới thiệu 2 bucket demo: `buoi9-assets` (bucket chính) và `buoi9-assets-archive` (bucket lưu trữ).
  - Có thể tạo thử một bucket mới trực tiếp qua nút **Create Bucket** trên giao diện MinIO Console để đáp ứng bài thực hành GUI.

---

## 3. Demo Quản lý Object trên Giao diện Web (7 phút)
- [ ] Mở trình duyệt truy cập: `http://localhost/` hoặc `http://shop.local/`
  - Bấm vào mục **🗄 MinIO Storage** trên Navbar (đường dẫn `/storage`).
- [ ] **Thao tác 1: Tạo dữ liệu mẫu nhanh (Quick Seed)**:
  - Bấm nút `👤 + Avatar mẫu`: upload file SVG vào prefix `avatars/` (Private).
  - Bấm nút `📄 + PDF mẫu`: upload file PDF vào prefix `documents/` (Private).
  - Bấm nút `🌐 + File Public`: upload thông báo vào prefix `public/` (Public).
  - Bấm nút `🔒 + File Private`: upload dữ liệu bảo mật vào prefix `private/` (Private).
- [ ] **Thao tác 2: Phân biệt Public vs Private Object**:
  - Đối với file trong `public/`:
    - Bấm nút `👁 Thử URL` -> Mở link trực tiếp `http://minio.shop.local/buoi9-assets/public/...`.
    - Kết quả: **Mở xem được ngay mà không cần chữ ký (Anonymous GET thành công)**.
  - Đối với file trong `private/`:
    - Bấm nút `👁 Thử URL` -> Mở link trực tiếp `http://minio.shop.local/buoi9-assets/private/...`.
    - Kết quả: **Bị MinIO từ chối ngay lập tức: `<Code>AccessDenied</Code>` (HTTP 403 Forbidden)**.
- [ ] **Thao tác 3: Ký Presigned URL có thời hạn**:
  - Trên file `private/`, bấm nút `🔑 Ký URL`.
  - Hộp thoại Modal hiện lên: Hiển thị Presigned URL được ký bằng thuật toán AWS S3 Signature V4 với thời gian hiệu lực 300 giây (5 phút).
  - Bấm nút `🌐 Mở Presigned URL`: Trình duyệt truy cập và tải file thành công!
  - Giải thích: Nhờ chữ ký `X-Amz-Signature` và token trong URL, MinIO xác thực yêu cầu hợp lệ mà không cần cấp tài khoản cho người dùng cuối.
- [ ] **Thao tác 4: Download Stream qua Backend**:
  - Bấm nút `📥 Tải` trên bất kỳ file nào. Backend stream file từ MinIO về máy người dùng với đúng tên file và định dạng MIME.
- [ ] **Thao tác 5: Đổi tên (Rename) trong cùng bucket**:
  - Bấm nút `✏️` trên một file (ví dụ tài liệu PDF) -> đổi tên thành `documents/bao-cao-moi.pdf`.
  - Giải thích: S3 không có thao tác rename nguyên tử, backend thực hiện copy sang key mới, kiểm tra dung lượng khớp rồi mới xóa key cũ.
- [ ] **Thao tác 6: Di chuyển (Move) sang bucket `buoi9-assets-archive`**:
  - Bấm nút `🔄` trên file avatar -> chuyển sang bucket `buoi9-assets-archive`.
  - Chọn tab `buoi9-assets-archive`: thấy file đã nằm trong archive.
  - Quay lại tab `buoi9-assets`: file đã được dọn sạch khỏi bucket chính.
- [ ] **Thao tác 7: Xóa Object**:
  - Bấm nút `🗑` trên một file -> xác nhận xóa -> file biến mất khỏi danh sách và khỏi MinIO.

---

## 4. Demo Kiểm tra Giới hạn File & Bảo vệ Hệ thống (2 phút)
- [ ] Thử upload file > 5 MiB (hoặc chạy lệnh curl):
  - Hệ thống trả về `HTTP 413 Payload Too Large`.
  - Giải thích: Multer và NGINX đồng bộ giới hạn, file tạm được dọn sạch trong khối `finally`, không gây rò rỉ dung lượng ổ đĩa.
- [ ] Thử upload file không đúng định dạng:
  - Hệ thống trả về `HTTP 400 Bad Request` với danh sách loại file cho phép.

---

## 5. Demo Thao tác Xóa Bucket (2 phút)
- [ ] Nhắc lại nguyên tắc: **Không bao giờ xóa bucket còn dữ liệu**.
- [ ] Mở **MinIO Console** (`http://127.0.0.1:9091`):
  - Chọn một bucket rỗng (hoặc bucket test tạo ở Bước 2).
  - Xóa bucket trên Console.
- [ ] Hoặc trình diễn script an toàn trên CLI:
  ```bash
  docker compose run --rm minio-admin node scripts/delete-demo-bucket.js buoi9-assets --confirm
  ```
  - Nếu bucket còn object: Script TỪ CHỐI xóa và thông báo người dùng phải làm rỗng trước.

---

## 6. Tổng kết & Trả lời Câu hỏi (2 phút)
- [ ] Tóm tắt các lợi ích đạt được:
  - Tương thích 100% chuẩn S3 API.
  - Dễ dàng chuyển đổi sang Cloudflare R2 hoặc AWS S3 thật chỉ bằng cách đổi endpoint/credentials.
  - Tách bạch credentials: Root user chỉ dùng trong CLI quản trị, Backend chạy quyền tối thiểu.
  - NGINX làm reverse proxy an toàn cho cả Web UI và S3 API.
