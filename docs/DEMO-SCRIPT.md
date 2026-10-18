# DEMO-SCRIPT.md – Kịch bản trình diễn NGINX Demo Buổi 8

Tài liệu hướng dẫn từng bước trình diễn 6 kịch bản demo NGINX cho môn Backend/Server.

---

## Phần 1: Web Server phục vụ Static Files & SPA Routing (Stage 01)

### 1. Mục tiêu
Minh họa NGINX hoạt động như một Web Server tĩnh, phục vụ ứng dụng Single Page Application (React/Vite) trực tiếp từ disk (`/var/www/shop`), kết hợp cấu hình `try_files` để hỗ trợ client-side routing.

### 2. Lệnh thực hiện
```bash
# Gọi trang chủ
curl -sI --resolve shop.local:80:127.0.0.1 http://shop.local/

# Gọi đường dẫn con của SPA (chưa có file vật lý)
curl -sI --resolve shop.local:80:127.0.0.1 http://shop.local/products/1

# Gọi file tài nguyên tĩnh có thật
curl -sI --resolve shop.local:80:127.0.0.1 http://shop.local/assets/index.js
```

### 3. Kết quả mong đợi
- `http://shop.local/`: HTTP 200, `Content-Type: text/html`, header `Server: nginx`.
- `http://shop.local/products/1`: HTTP 200, trả về nội dung `index.html` (SPA fallback).
- `http://shop.local/assets/index.js`: HTTP 200 với `Content-Type: application/javascript` (hoặc 404 nếu hash file khác).

### 4. Cách kiểm tra
- Kiểm tra file log: `tail -n 5 /var/log/nginx/shop.access.log`.
- Thử nghiệm đối chứng: tạm xóa directive `try_files $uri $uri/ /index.html;`, reload NGINX → request `/products/1` sẽ trả HTTP 404. Sau đó khôi phục lại.

### 5. Lỗi hay gặp
- **403 Forbidden**: Do quyền thư mục `/var/www/shop` không cho phép user `nginx` đọc (`chmod -R 755 /var/www/shop`).
- **404 Not Found trên `/`**: Thư mục `/var/www/shop` chưa có file `index.html` (chưa chạy `npm run build` ở frontend).

### 6. Điều cần giải thích cho sinh viên
- Client-side routing: Router trong React thay đổi URL trên thanh địa chỉ mà không reload trang. Khi người dùng bấm F5 tại `/products/1`, request gửi lên NGINX. Nếu không có `try_files`, NGINX tìm thư mục `/var/www/shop/products/1` và báo 404. `try_files` chuyển tiếp request về `index.html` để React Router tự xử lý tiếp.

---

## Phần 2: Reverse Proxy đơn đến Backend (Stage 02)

### 1. Mục tiêu
Minh họa NGINX làm Reverse Proxy, che giấu địa chỉ và cổng thật của backend (3001), forward các request `/api/` vào backend và truyền kèm các HTTP Header nhận dạng (`X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`, `Host`).

### 2. Lệnh thực hiện
```bash
# Lấy danh sách sản phẩm qua proxy
curl -s --resolve shop.local:80:127.0.0.1 http://shop.local/api/products

# Kiểm tra headers backend nhận được
curl -s --resolve shop.local:80:127.0.0.1 http://shop.local/api/whoami
```

### 3. Kết quả mong đợi
- `/api/products`: JSON `{ "success": true, "count": 10, "data": [...] }`.
- `/api/whoami`: JSON chứa thông tin các headers:
  - `headers.x-real-ip`: `127.0.0.1`
  - `headers.x-forwarded-for`: `127.0.0.1`
  - `headers.x-forwarded-proto`: `http`
  - `host`: `shop.local`

### 4. Cách kiểm tra
- Đối chứng header: Tạm thời comment dòng `proxy_set_header X-Real-IP $remote_addr;` trong cấu hình NGINX, reload NGINX, gọi lại `/api/whoami` → kiểm tra trường `headers.x-real-ip` chuyển thành `null`.

### 5. Lỗi hay gặp
- **502 Bad Gateway**: Backend tại `127.0.0.1:3001` chưa khởi động hoặc cổng bị sai.
- **Header Host bị ghi đè**: Nếu thiếu `proxy_set_header Host $host;`, backend sẽ nhận Host là tên upstream thay vì `shop.local`.

### 6. Điều cần giải thích cho sinh viên
- Tại sao backend cần `X-Real-IP` và `X-Forwarded-For`? Vì khi đứng sau proxy, socket TCP kết nối vào backend luôn có địa chỉ IP nguồn là của NGINX (127.0.0.1 hoặc IP container). Nếu backend không đọc header forward, tính năng rate-limit, audit log hoặc geolocation sẽ nhận nhầm tất cả client là IP của proxy.

---

## Phần 3: Upstream Pool, Load Balancing & Cơ chế proxy_pass (Stage 03)

### 1. Mục tiêu
- Trình diễn cân bằng tải (Round-Robin) giữa hai backend instances (`backend-1` và `backend-2`).
- Phân tích sự khác biệt giữa 4 biến thể cú pháp `proxy_pass` (có URI, không URI, dấu slash `/`).

### 2. Lệnh thực hiện
```bash
# Test Load Balancing 20 requests
bash scripts/lb-test.sh 20

# Test 4 biến thể proxy_pass
bash scripts/pp-variants-test.sh
```

### 3. Kết quả mong đợi
- **Load Balancing**: 20 requests phân phối đồng đều ~50/50 giữa `backend-1` và `backend-2` (mỗi bên ~10 requests). Header `X-Instance` luân phiên đổi giữa hai instance.
- **Biến thể proxy_pass**:
  - `/pp/nouri/api/whoami` (proxy_pass không URI): Backend nhận `/pp/nouri/api/whoami` → trả JSON 404 với thông báo `Route GET /pp/nouri/api/whoami not found`.
  - `/pp/slash/api/whoami` (proxy_pass có `/` cuối): NGINX cắt bỏ `/pp/slash/`, backend nhận `/api/whoami` → trả JSON 200.
  - `/pp/apiuri/whoami` (proxy_pass `/api/`): NGINX thay `/pp/apiuri/` bằng `/api/`, backend nhận `/api/whoami` → trả JSON 200.
  - `/pp/bad/api/whoami` (location `/pp/bad` không slash cuối, proxy_pass `/`): Backend nhận `//api/whoami` (double slash).

### 4. Cách kiểm tra
- Đổi trọng số cân bằng tải: Thêm `server ... weight=3;` vào một instance trong upstream, chạy lại `lb-test.sh 40` để quan sát tỉ lệ nhận request chuyển thành ~75% vs ~25%.

### 5. Lỗi hay gặp
- **Tỉ lệ không đều**: Do cache keep-alive hoặc trình duyệt gửi preflight. Cần dùng script curl chạy tuần tự không keepalive connection.

### 6. Điều cần giải thích cho sinh viên
- Quy tắc vàng của NGINX `proxy_pass`:
  - Nếu `proxy_pass` **KHÔNG CÓ URI** (ví dụ `http://backend_pool`): NGINX giữ nguyên toàn bộ request URI của client.
  - Nếu `proxy_pass` **CÓ URI** (kể cả chỉ là một dấu `/` như `http://backend_pool/`): NGINX sẽ thay thế phần đường dẫn khớp với directive `location` bằng URI khai báo trong `proxy_pass`.

---

## Phần 4: Giới hạn Body Size & Phân biệt lỗi 413 (Stage 03 vs Stage 04)

### 1. Mục tiêu
Chứng minh và phân biệt lỗi HTTP 413 (Payload Too Large) phát sinh từ NGINX (tầng Web Server) khác với lỗi 413 phát sinh từ Backend (tầng Application).

### 2. Lệnh thực hiện
```bash
# Chạy script kiểm tra ma trận kích thước body
bash scripts/body-limit-test.sh
```

### 3. Kết quả mong đợi
- **Ở Stage 03** (NGINX mặc định `client_max_body_size 1m`):
  - Request 2 MiB: Bị NGINX chặn ngay lập tức. HTTP Status 413, trang lỗi HTML của NGINX, không có header `X-Instance`, log NGINX ghi `client intended to send too large body`. Request không bao giờ chạm tới backend.
- **Ở Stage 04** (NGINX đặt `client_max_body_size 20m`):
  - Request 2 MiB: Thành công HTTP 200.
  - Request 6 MiB: NGINX cho qua (vì < 20 MiB), nhưng backend giới hạn 5 MiB nên backend trả về HTTP 413 với JSON `{ "success": false, "source": "backend", "message": "..." }`, có header `X-Instance`.
  - Request 25 MiB: Vượt quá 20 MiB, bị NGINX chặn với 413 HTML.

### 4. Cách kiểm tra
- Quan sát log NGINX: `docker compose logs nginx | grep -E "413|large"`.
- Quan sát log Backend: `docker compose logs backend-1 | grep 413`.

### 5. Lỗi hay gặp
- Backend không trả 413 mà trả 500: Do Global Error Handler chưa phân loại lỗi `entity.too.large` của body-parser hoặc `LIMIT_FILE_SIZE` của multer. Trong demo này đã được xử lý chuẩn trong `backend/src/app.js`.

### 6. Điều cần giải thích cho sinh viên
- Tại sao cần chặn ở NGINX trước? Nếu để file 100MB tràn vào backend mới ngắt thì băng thông mạng và tài nguyên I/O của application process đã bị lãng phí. NGINX được viết bằng C, tối ưu xử lý I/O non-blocking nên từ chối kết nối dung lượng lớn ở NGINX sẽ bảo vệ backend khỏi các cuộc tấn công DoS/cạn kiệt tài nguyên.

---

## Phần 5: Domain Local & HTTPS / TLS (Stage 05)

### 1. Mục tiêu
- Trình diễn cấu hình NGINX HTTPS an toàn với TLS 1.2 / TLS 1.3.
- Chuyển hướng tự động HTTP sang HTTPS (301 Redirect).
- So sánh chứng chỉ Tự ký (Self-Signed) gây cảnh báo bảo mật trên trình duyệt với chứng chỉ ký bởi Private Root CA được Trust Store tin cậy.

### 2. Lệnh thực hiện
```bash
# 1. Sinh chứng chỉ
bash scripts/gen-certs.sh

# 2. Sử dụng chứng chỉ tự ký
bash scripts/use-cert.sh selfsigned docker

# 3. Kích hoạt stage 05
NGINX_STAGE=05-https docker compose up -d --force-recreate nginx

# 4. Kiểm tra redirect 80 -> 443
curl -sI --resolve shop.local:80:127.0.0.1 http://shop.local/api/health

# 5. Kiểm tra kết nối HTTPS với cert tự ký
curl --resolve shop.local:443:127.0.0.1 https://shop.local/api/health  # Báo lỗi chứng chỉ (exit code 60)
curl -k --resolve shop.local:443:127.0.0.1 https://shop.local/api/health # Thành công với cờ -k

# 6. Chuyển sang chứng chỉ Root CA
bash scripts/use-cert.sh ca docker
curl --resolve shop.local:443:127.0.0.1 --cacert certs/ca/rootCA.crt https://shop.local/api/health # Thành công không cần -k!
```

### 3. Kết quả mong đợi
- Port 80 trả `HTTP/1.1 301 Moved Permanently`, `Location: https://shop.local/api/health`.
- `openssl verify -CAfile certs/ca/rootCA.crt certs/ca/shop.local.crt` trả `OK`.
- Trình duyệt: Khi mở `https://shop.local` với chứng chỉ tự ký sẽ hiện màn hình cảnh báo đỏ `Your connection is not private`. Sau khi import `rootCA.crt` vào Windows Trust Store, trình duyệt hiển thị biểu tượng ổ khóa an toàn màu xanh.

### 4. Cách kiểm tra
- Chạy lệnh kiểm tra TLS handshake:
  `openssl s_client -connect 127.0.0.1:443 -servername shop.local -CAfile certs/ca/rootCA.crt </dev/null`

### 5. Lỗi hay gặp
- **Trình duyệt vẫn báo lỗi SAN**: Nếu chứng chỉ không có phần mở rộng `subjectAltName = DNS:shop.local` (Chrome và Edge từ chối chứng chỉ chỉ có Common Name). `gen-certs.sh` đã có SAN hợp lệ.
- **Quên flush DNS**: Sau khi sửa file hosts, cần chạy `ipconfig /flushdns` trên Windows.

### 6. Điều cần giải thích cho sinh viên
- Chuỗi tin cậy (Chain of Trust): Trình duyệt không biết `shop.local.crt` là ai, nhưng nếu nó biết và tin tưởng `Shop Local Demo Root CA`, và thấy chữ ký trên `shop.local.crt` khớp với Root CA đó, nó sẽ tin tưởng toàn bộ kết nối.

---

## Phần 6: Failover & Passive Health Check (Stage 03)

### 1. Mục tiêu
Minh họa cơ chế chịu lỗi bị động (Passive Health Check) của NGINX Upstream khi một backend gặp sự cố dừng đột ngột.

### 2. Lệnh thực hiện
```bash
# Chạy script failover tự động
bash scripts/failover-test.sh --auto
```

### 3. Kết quả mong đợi
- Trước khi dừng: Requests gửi đều vào 2 instance.
- Khi dừng `backend-1`: NGINX phát hiện kết nối lỗi (hoặc timeout theo `proxy_connect_timeout 10s`), đánh dấu `backend-1` là failed (theo `max_fails=1 fail_timeout=10s`), tự động chuyển tiếp request thất bại sang `backend-2`.
- Người dùng nhận response từ `backend-2`, không bị gián đoạn toàn bộ hệ thống.
- Khi `backend-1` khởi động lại: Sau thời gian `fail_timeout`, NGINX thử gửi lại request và tự động phục hồi cân bằng tải.

### 4. Cách kiểm tra
- Dừng cả 2 backend cùng lúc (`docker compose stop backend-1 backend-2`) → NGINX trả HTTP 502 Bad Gateway vì không còn upstream nào khả dụng.

### 5. Lỗi hay gặp
- Request bị treo lâu khi backend chết: Nếu không cấu hình `proxy_connect_timeout` (mặc định 60s), người dùng phải chờ rất lâu trước khi NGINX retry sang backend khác. Đã tối ưu về 10s.

### 6. Điều cần giải thích cho sinh viên
- Tại sao gọi là "Passive Health Check"? Vì NGINX OSS không chủ động ping định kỳ vào backend (đó là tính năng Active Health Check của NGINX Plus). NGINX OSS chỉ phát hiện backend chết khi có request thật từ người dùng gửi đến và kết nối bị từ chối hoặc timeout.
