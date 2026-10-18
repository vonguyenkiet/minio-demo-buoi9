# TÀI LIỆU API HỆ THỐNG BUỔI 9: MINIO / OBJECT STORAGE S3

Hệ thống cung cấp RESTful API quản lý Object Storage theo chuẩn S3, tích hợp qua Express backend và reverse proxy NGINX.

---

## 1. Nguyên tắc Định danh Object `(bucket, key)`

Trong Object Storage S3, một object được định danh duy nhất bởi cặp:
```text
(bucket, key)
```
API hỗ trợ 2 cách truyền định danh:
1. **Query Parameters / Body**: `bucket=buoi9-assets&key=avatars/user.svg`
2. **URL-Safe ID (Base64url)**: `:id` là chuỗi encode `base64url(bucket:key)`.
   - Ví dụ: `buoi9-assets:documents/doc.pdf` -> `YnVvaTktYXNzZXRzOmRvY3VtZW50cy9kb2MucGRm`

---

## 2. Danh mục Endpoints

| Method | Endpoint | Mục đích | Headers / Params | Response Status |
|---|---|---|---|---|
| `GET` | `/api/buckets` | Lấy danh sách demo buckets & số lượng object | Không | `200 OK` |
| `GET` | `/api/files` | Liệt kê danh sách object trong bucket | Query: `bucket`, `prefix` | `200 OK` |
| `POST` | `/api/files` | Upload object lên MinIO | Multipart: `file`, `bucket`, `prefix`, `customKey` | `201 Created` |
| `GET` | `/api/files/:id/download` | Tải object trực tiếp từ MinIO qua Backend stream | Params: `:id` (hoặc Query: `bucket`, `key`) | `200 OK` |
| `GET` | `/api/files/:id/url` | Tạo Presigned URL truy cập object | Query: `expiry` (giây, mặc định 300) | `200 OK` |
| `POST` | `/api/files/:id/rename` | Đổi tên object trong cùng bucket (Copy -> Verify -> Delete) | Body: `{ "newKey": "..." }` | `200 OK` |
| `POST` | `/api/files/:id/move` | Di chuyển object sang bucket khác | Body: `{ "targetBucket": "...", "targetKey": "..." }` | `200 OK` |
| `DELETE` | `/api/files/:id` | Xóa object khỏi bucket | Params: `:id` (hoặc Query: `bucket`, `key`) | `200 OK` |

---

## 3. Chi tiết từng Endpoint

### 3.1. GET `/api/buckets`
Lấy trạng thái các bucket demo trong allowlist (`buoi9-assets`, `buoi9-assets-archive`).

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "bucket": "buoi9-assets",
      "exists": true,
      "objectCount": 3,
      "totalSize": 2000100,
      "isDemoBucket": true
    },
    {
      "bucket": "buoi9-assets-archive",
      "exists": true,
      "objectCount": 1,
      "totalSize": 57,
      "isDemoBucket": true
    }
  ]
}
```

---

### 3.2. GET `/api/files`
Liệt kê các object trong bucket.

**Query Parameters:**
- `bucket` (bắt buộc, mặc định: `buoi9-assets`)
- `prefix` (tùy chọn: `avatars/`, `documents/`, `public/`, `private/`)

**Response (200 OK):**
```json
{
  "success": true,
  "bucket": "buoi9-assets",
  "prefix": "",
  "count": 2,
  "data": [
    {
      "id": "YnVvaTktYXNzZXRzOmRvY3VtZW50cy8xNzkyMzQ0OTE3MDU3LXRlc3QtMm1iLnBkZg",
      "bucket": "buoi9-assets",
      "key": "documents/1792344917057-test-2mb.pdf",
      "name": "1792344917057-test-2mb.pdf",
      "prefix": "documents/",
      "size": 2000000,
      "lastModified": "2026-10-18T17:35:17.000Z",
      "etag": "d41d8cd98f00b204e9800998ecf8427e",
      "isPublic": false
    }
  ]
}
```

---

### 3.3. POST `/api/files`
Upload file lên MinIO. Backend nhận file qua multipart/form-data, ghi vào file tạm tại `/tmp/buoi9-uploads`, dùng MinIO SDK `fPutObject` stream lên MinIO và luôn dọn file tạm trong khối `finally`.

**Form-data Fields:**
- `file`: File upload (tối đa 5 MiB theo cấu hình `UPLOAD_TEST_LIMIT_BYTES`)
- `bucket`: `buoi9-assets` hoặc `buoi9-assets-archive`
- `prefix`: `avatars/`, `documents/`, `public/`, `private/`
- `customKey`: (tùy chọn)

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Upload file lên MinIO thành công.",
  "data": {
    "id": "YnVvaTktYXNzZXRzOnB1YmxpYy9ub3RpY2UudHh0",
    "bucket": "buoi9-assets",
    "key": "public/notice.txt",
    "size": 128,
    "mimeType": "text/plain",
    "isPublic": true,
    "directPublicUrl": "http://minio.shop.local/buoi9-assets/public/notice.txt"
  }
}
```

**Lỗi có thể gặp:**
- `400 Bad Request`: Định dạng file không thuộc allowlist (`JPG, PNG, GIF, WebP, SVG, PDF, JSON, TXT, DOCX`).
- `413 Payload Too Large`: Dung lượng file vượt quá giới hạn 5 MiB.
- `404 Not Found`: Bucket không tồn tại.

---

### 3.4. GET `/api/files/:id/url`
Tạo Presigned URL có thời hạn (mặc định 300 giây = 5 phút). Ký bằng `publicSigningClient` với Host `minio.shop.local` để browser truy cập trực tiếp qua NGINX.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Presigned URL có hiệu lực trong 300 giây",
  "data": {
    "bucket": "buoi9-assets",
    "key": "private/test-private.txt",
    "presignedUrl": "http://minio.shop.local/buoi9-assets/private/test-private.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Expires=300&X-Amz-Signature=...",
    "expiresIn": 300,
    "expiresAt": "2026-10-18T17:40:00.000Z"
  }
}
```

---

### 3.5. POST `/api/files/:id/rename`
Đổi tên object trong cùng bucket.

**Body (JSON):**
```json
{
  "newKey": "documents/bao-cao-tai-chinh-2026.pdf"
}
```

**Quy trình an toàn:**
1. Kiểm tra object nguồn tồn tại.
2. Kiểm tra key mới hợp lệ.
3. Copy sang key mới qua `copyObject`.
4. Xác minh kích thước object đích khớp với nguồn.
5. Chỉ xóa key nguồn sau khi đích đã xác minh thành công. Nếu copy lỗi, nguồn được giữ nguyên.

---

### 3.6. POST `/api/files/:id/move`
Di chuyển object sang bucket khác trong allowlist (ví dụ từ `buoi9-assets` sang `buoi9-assets-archive`).

**Body (JSON):**
```json
{
  "targetBucket": "buoi9-assets-archive",
  "targetKey": "archived-documents/doc.pdf"
}
```

---

### 3.7. DELETE `/api/files/:id`
Xóa object khỏi bucket.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Đã xóa object \"public/notice.txt\" khỏi bucket \"buoi9-assets\".",
  "bucket": "buoi9-assets",
  "key": "public/notice.txt"
}
```

> **Lưu ý bảo mật:** Hệ thống TUYỆT ĐỐI KHÔNG cung cấp API xóa bucket. Thao tác xóa bucket chỉ thực hiện qua MinIO Console hoặc script CLI có cờ xác nhận `--confirm` khi bucket đã rỗng hoàn toàn.
