# 🐳 Product Catalog API – Docker Compose Demo

> **Bài học: Docker Compose** – Minh họa kiến trúc multi-container với Node.js, PostgreSQL, MinIO và Nginx.

---

## ⚡ Demo Nhanh

```bash
# 1. Clone / mở project
cd docker-compose-demo

# 2. Sao chép file cấu hình
cp .env.example .env

# 3. Build và khởi động toàn bộ hệ thống (1 lệnh duy nhất!)
docker compose up -d --build

# 4. Kiểm tra tất cả service đang chạy
docker compose ps

# 5. Test API qua Nginx
curl http://localhost:8080/api/products

# 6. Chứng minh 2 backend instance
curl http://localhost:3001/health
curl http://localhost:3002/health

# 7. Demo load balancing (gọi nhiều lần, observe backend-1/backend-2)
for i in {1..6}; do curl -s http://localhost:8080/health | grep instance; done

# 8. Demo persistence
docker compose down
docker compose up -d
curl http://localhost:8080/api/products   # Dữ liệu vẫn còn!

# 9. Dọn dẹp
docker compose down
```

---

## 1. Giới Thiệu Project

**Product Catalog API** là một backend demo đơn giản để minh họa cách Docker Compose quản lý một hệ thống multi-container hoàn chỉnh.

Hệ thống bao gồm:
- **Express.js API** – RESTful backend cho Product Catalog
- **PostgreSQL** – Lưu trữ thông tin sản phẩm
- **MinIO** – Object storage để lưu ảnh sản phẩm (S3-compatible)
- **Nginx** – Reverse proxy + Load Balancer
- **2 backend instances** – Chạy từ cùng một Docker image

---

## 2. Mục Tiêu Bài Docker Compose

Sau bài demo này, học viên hiểu được:

| Khái niệm | Minh họa trong project |
|-----------|------------------------|
| **Docker Compose** | 1 lệnh khởi động 5 service |
| **Service Discovery** | `DB_HOST=db`, `MINIO_ENDPOINT=minio` |
| **Named Volume** | `postgres_data`, `minio_data` |
| **Persistent Data** | Dữ liệu tồn tại sau `docker compose down` |
| **Healthcheck** | `pg_isready`, `curl /health` |
| **depends_on** | nginx → backend → db/minio |
| **1 Image → N Containers** | `backend-1`, `backend-2` từ `product-api:latest` |
| **Load Balancing** | Nginx round-robin giữa backend-1 và backend-2 |
| **Environment Variables** | `.env` file, không hard-code secrets |
| **Docker Network** | `app_network` bridge network |

---

## 3. Kiến Trúc Hệ Thống

```
                    ┌─────────────────┐
                    │     Client      │
                    │ Browser / curl  │
                    └────────┬────────┘
                             │ HTTP :8080
                             ▼
                    ┌─────────────────┐
                    │      Nginx      │
                    │ Reverse Proxy   │  :8080 → :80
                    │ Load Balancer   │
                    └───────┬─────────┘
                            │ Round-robin
               ┌────────────┴────────────┐
               │                         │
               ▼                         ▼
      ┌─────────────────┐     ┌─────────────────┐
      │   backend-1     │     │   backend-2     │
      │ Express :3000   │     │ Express :3000   │
      │ host: :3001     │     │ host: :3002     │
      │ INSTANCE=       │     │ INSTANCE=       │
      │   backend-1     │     │   backend-2     │
      └───────┬─────────┘     └────────┬────────┘
              │                        │
              │     Cùng IMAGE         │
              │   product-api:latest   │
              │                        │
              └───────────┬────────────┘
                          │
             ┌────────────┴────────────┐
             │                         │
             ▼                         ▼
    ┌─────────────────┐      ┌─────────────────┐
    │   PostgreSQL    │      │      MinIO      │
    │   product_db    │      │ product-images  │
    │   port: 5432    │      │   port: 9000    │
    └────────┬────────┘      └────────┬────────┘
             │                        │
             ▼                        ▼
    ┌─────────────────┐      ┌─────────────────┐
    │  postgres_data  │      │   minio_data    │
    │  Named Volume   │      │  Named Volume   │
    └─────────────────┘      └─────────────────┘
```

### Ports trên máy host

| Service | Host Port | Container Port | Mô tả |
|---------|-----------|----------------|-------|
| Nginx | `8080` | `80` | Entry point chính |
| backend-1 | `3001` | `3000` | Direct access (demo) |
| backend-2 | `3002` | `3000` | Direct access (demo) |
| MinIO API | `9000` | `9000` | S3-compatible API |
| MinIO Console | `9001` | `9001` | Web UI quản lý |

---

## 4. Công Nghệ Sử Dụng

| Công nghệ | Phiên bản | Vai trò |
|-----------|-----------|---------|
| Node.js | 20 LTS | Runtime backend |
| Express.js | 4.x | Web framework |
| PostgreSQL | 16 | Relational database |
| MinIO | latest | Object storage |
| Nginx | 1.25 | Reverse proxy / LB |
| Docker | 24+ | Container runtime |
| Docker Compose | v2 | Orchestration |

---

## 5. Cấu Trúc Thư Mục

```
docker-compose-demo/
│
├── backend/                     # Backend Express.js
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js      # Kết nối PostgreSQL (pool)
│   │   │   └── minio.js         # Kết nối MinIO + bucket init
│   │   │
│   │   ├── controllers/
│   │   │   └── product.controller.js   # HTTP handlers
│   │   │
│   │   ├── routes/
│   │   │   └── product.routes.js       # Express routes
│   │   │
│   │   ├── services/
│   │   │   └── product.service.js      # Business logic
│   │   │
│   │   ├── db/
│   │   │   ├── init.sql         # Tạo bảng products
│   │   │   └── seed.sql         # 10 sản phẩm mẫu
│   │   │
│   │   ├── app.js               # Express app setup
│   │   └── server.js            # Entry point + retry logic
│   │
│   ├── package.json
│   ├── Dockerfile               # Build backend image
│   └── .dockerignore
│
├── nginx/
│   └── nginx.conf               # Nginx reverse proxy config
│
├── scripts/
│   └── test-api.sh              # Script kiểm tra API tự động
│
├── .env                         # Biến môi trường (không commit!)
├── .env.example                 # Template cho .env
├── .gitignore
├── docker-compose.yml           # Định nghĩa toàn bộ hệ thống
└── README.md
```

---

## 6. Chuẩn Bị Môi Trường

### Yêu cầu

- **Docker** phiên bản 24.0 trở lên
- **Docker Compose** v2 (tích hợp trong Docker Desktop)
- **curl** (để test API)

Kiểm tra:
```bash
docker --version
docker compose version
```

### Không cần cài thêm

- Node.js (chạy trong container)
- PostgreSQL (chạy trong container)
- MinIO (chạy trong container)

---

## 7. Cấu Hình `.env`

```bash
# Sao chép file mẫu
cp .env.example .env
```

Nội dung `.env`:

```env
# PostgreSQL
POSTGRES_DB=product_db
POSTGRES_USER=product_user
POSTGRES_PASSWORD=Secure@Pass123

# MinIO
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=MinioPass@123
MINIO_BUCKET=product-images

# Backend
BACKEND_PORT=3000
BACKEND_1_NAME=backend-1
BACKEND_2_NAME=backend-2

# DB connection (service name, không phải localhost!)
DB_HOST=db
DB_PORT=5432
DB_NAME=product_db
DB_USER=product_user
DB_PASSWORD=Secure@Pass123

# MinIO connection (service name, không phải localhost!)
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=MinioPass@123
MINIO_USE_SSL=false
```

> ⚠️ **Quan trọng**: File `.env` đã được thêm vào `.gitignore`. Không commit file này lên Git vì chứa password.

---

## 8. Chạy Project

```bash
# Build image và khởi động tất cả service
docker compose up -d --build
```

Docker Compose sẽ thực hiện theo thứ tự:
1. **Build** `product-api:latest` image từ `./backend/Dockerfile`
2. **Tạo network** `app_network`
3. **Tạo volumes** `postgres_data`, `minio_data`
4. **Start PostgreSQL** → chạy `init.sql` + `seed.sql` → healthcheck
5. **Start MinIO** → healthcheck
6. **Start backend-1** → kết nối DB + MinIO → tạo bucket → healthcheck
7. **Start backend-2** → chờ backend-1 healthy → healthcheck
8. **Start Nginx** → chờ cả 2 backend healthy

---

## 9. Kiểm Tra Service

```bash
# Xem trạng thái tất cả container
docker compose ps
```

Kết quả mong muốn:

```
NAME                STATUS              PORTS
product-nginx       running (healthy)   0.0.0.0:8080->80/tcp
product-backend-1   running (healthy)   0.0.0.0:3001->3000/tcp
product-backend-2   running (healthy)   0.0.0.0:3002->3000/tcp
product-postgres    running (healthy)   5432/tcp
product-minio       running (healthy)   0.0.0.0:9000-9001->9000-9001/tcp
```

---

## 10. Test API

### Health Check

```bash
# Qua Nginx (load balancer)
curl http://localhost:8080/health

# Trực tiếp backend-1
curl http://localhost:3001/health

# Trực tiếp backend-2
curl http://localhost:3002/health

# Kiểm tra DB + MinIO
curl http://localhost:8080/health/db
```

### Danh sách sản phẩm

```bash
curl http://localhost:8080/api/products
```

### Chi tiết sản phẩm

```bash
curl http://localhost:8080/api/products/1
curl http://localhost:8080/api/products/5
```

### Tạo sản phẩm mới

```bash
curl -X POST http://localhost:8080/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ASUS ZenBook 14",
    "description": "Laptop ASUS ZenBook 14 OLED, chip Intel Core Ultra 7",
    "price": 25990000,
    "category": "Laptop",
    "stock": 8
  }'
```

### Upload ảnh sản phẩm lên MinIO

```bash
# Tạo ảnh test
echo "fake image content" > /tmp/test.jpg

# Upload ảnh cho sản phẩm ID 1
curl -X POST http://localhost:8080/api/products/1/image \
  -F "image=@/tmp/test.jpg"
```

---

## 11. Test PostgreSQL

```bash
# Vào PostgreSQL console
docker compose exec db psql -U product_user -d product_db

# Trong psql:
\dt                             -- Xem danh sách bảng
SELECT * FROM products;         -- Xem tất cả sản phẩm
SELECT count(*) FROM products;  -- Đếm số sản phẩm
\q                              -- Thoát
```

---

## 12. Test MinIO

### MinIO Console (Web UI)

Mở trình duyệt: `http://localhost:9001`

- **Username**: `minioadmin`
- **Password**: `MinioPass@123`

Tại đây có thể xem bucket `product-images` và các object đã upload.

### MinIO API

```bash
# Kiểm tra MinIO health
curl http://localhost:9000/minio/health/live
```

---

## 13. Test Persistence (Dữ Liệu Không Mất Sau Restart)

```bash
# Bước 1: Tạo một sản phẩm mới
curl -X POST http://localhost:8080/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Persistence","description":"Sản phẩm test persistence","price":1000000,"category":"Test","stock":1}'

# Bước 2: Xác nhận đã tạo thành công
curl http://localhost:8080/api/products | grep "Test Persistence"

# Bước 3: Dừng và xóa container (KHÔNG xóa volume)
docker compose down

# Bước 4: Kiểm tra volume vẫn còn
docker volume ls | grep postgres_data

# Bước 5: Khởi động lại
docker compose up -d

# Bước 6: Kiểm tra dữ liệu vẫn tồn tại!
curl http://localhost:8080/api/products | grep "Test Persistence"
```

**Giải thích:**
```
Container bị xóa (docker compose down)
        ↓
Named volume "postgres_data" vẫn còn trên host
        ↓
Container PostgreSQL mới được tạo
        ↓
PostgreSQL mount volume cũ tại /var/lib/postgresql/data
        ↓
Dữ liệu vẫn tồn tại ✅
```

---

## 14. Test Multi-Instance

```bash
# Direct access – thấy rõ instance name
curl http://localhost:3001/health
# → {"status":"ok","instance":"backend-1",...}

curl http://localhost:3002/health
# → {"status":"ok","instance":"backend-2",...}

# Kiểm tra cả 2 dùng cùng image
docker inspect product-backend-1 | grep Image
docker inspect product-backend-2 | grep Image
# → Cùng image ID!
```

---

## 15. Test Nginx Load Balancing

```bash
# Gọi 10 lần và quan sát request phân phối đều
for i in {1..10}; do
  curl -s http://localhost:8080/health | grep '"instance"'
done
```

Kết quả mong muốn (round-robin):
```
"instance":"backend-1"
"instance":"backend-2"
"instance":"backend-1"
"instance":"backend-2"
...
```

Header `X-Instance` trong response cũng cho biết backend nào xử lý:
```bash
curl -v http://localhost:8080/health 2>&1 | grep X-Instance
```

---

## 16. Docker Compose Commands

### Khởi động

```bash
# Chạy tất cả service (background)
docker compose up -d

# Build image + chạy tất cả service
docker compose up -d --build

# Chạy và xem logs ngay (foreground)
docker compose up --build
```

### Kiểm tra

```bash
# Trạng thái tất cả container
docker compose ps

# Xem cấu hình Compose đã được parse (kiểm tra .env)
docker compose config
```

### Logs

```bash
# Xem logs tất cả service
docker compose logs

# Xem logs service cụ thể
docker compose logs backend-1
docker compose logs backend-2
docker compose logs db
docker compose logs nginx

# Follow logs (realtime)
docker compose logs -f backend-1

# Xem N dòng cuối
docker compose logs --tail=50 backend-1
```

### Build

```bash
# Build image mà không chạy
docker compose build

# Build lại (bỏ cache)
docker compose build --no-cache
```

### Restart

```bash
# Restart một service
docker compose restart backend-1

# Restart tất cả
docker compose restart
```

### Exec (chạy lệnh trong container)

```bash
# Vào PostgreSQL console
docker compose exec db psql -U product_user -d product_db

# Vào shell của backend-1
docker compose exec backend-1 sh

# Kiểm tra biến môi trường trong backend-1
docker compose exec backend-1 env | grep INSTANCE

# Kiểm tra biến môi trường trong backend-2
docker compose exec backend-2 env | grep INSTANCE
```

### Dừng và xóa

```bash
# Dừng tất cả container (GIỮ volumes và images)
docker compose down

# ⚠️ XÓA tất cả container VÀ volumes (MẤT DỮ LIỆU!)
docker compose down -v

# Dừng và xóa cả images
docker compose down --rmi all
```

> ⚠️ **Cảnh báo**: `docker compose down -v` sẽ **xóa vĩnh viễn** toàn bộ dữ liệu PostgreSQL trong `postgres_data` volume. Chỉ dùng khi muốn reset hoàn toàn.

---

## 17. Image vs Container

### Image
**Image** là blueprint/template chứa application và tất cả dependencies.

```
product-api:latest (Image)
├── node:20-alpine (base)
├── npm dependencies (express, pg, minio, ...)
├── source code (src/)
└── startup command (node src/server.js)
```

### Container
**Container** là instance đang chạy được tạo từ image.

```
product-api:latest (1 Image)
        ↓
┌──────────────────┬──────────────────┐
│   backend-1      │   backend-2      │
│ (Container)      │ (Container)      │
│ INSTANCE=        │ INSTANCE=        │
│   backend-1      │   backend-2      │
│ port: 3001       │ port: 3002       │
└──────────────────┴──────────────────┘
```

**Kết luận**: Cùng 1 image → chạy nhiều container với cấu hình khác nhau qua environment variables.

---

## 18. Build-time vs Run-time Config

### Build-time (khi `docker build`)
- Được định nghĩa trong `Dockerfile`
- Sử dụng `ARG` trong Dockerfile
- Cố định trong image sau khi build
- **Ví dụ**: Node.js version, npm packages

### Run-time (khi `docker compose up`)
- Được định nghĩa trong `docker-compose.yml` → `environment`
- Đọc từ file `.env` qua `env_file` hoặc `${VAR}` syntax
- Có thể thay đổi mỗi lần chạy mà không cần rebuild
- **Ví dụ**: `DB_PASSWORD`, `INSTANCE_NAME`, `MINIO_ENDPOINT`

```
Build-time:
  Dockerfile → docker build → Image (cố định)

Run-time:
  .env → docker compose up → Container (linh hoạt)
```

**Ưu điểm**: Secrets không bao giờ bị bake vào image.

---

## 19. Service Discovery

Trong Docker Compose network `app_network`, Docker cung cấp **built-in DNS**.

Mỗi service có thể kết nối với service khác bằng **tên service** (không cần biết IP):

```
backend-1 muốn kết nối PostgreSQL:
  ❌ Sai:  DB_HOST=localhost    (localhost = chính backend-1)
  ❌ Sai:  DB_HOST=172.20.0.3  (IP có thể thay đổi)
  ✅ Đúng: DB_HOST=db           (Docker DNS tự resolve)

backend-1 muốn kết nối MinIO:
  ❌ Sai:  MINIO_ENDPOINT=localhost
  ✅ Đúng: MINIO_ENDPOINT=minio

Nginx muốn proxy đến backend:
  ❌ Sai:  server localhost:3001;
  ✅ Đúng: server backend-1:3000;
           server backend-2:3000;
```

**Cách kiểm tra**:
```bash
# Ping từ backend-1 đến db
docker compose exec backend-1 ping -c 3 db

# Ping từ backend-1 đến minio
docker compose exec backend-1 ping -c 3 minio
```

---

## 20. Named Volume vs Bind Mount

### Named Volume

```yaml
volumes:
  postgres_data:    # Docker quản lý, lưu trong /var/lib/docker/volumes/
```

- Docker tự quản lý vị trí lưu trữ
- Dữ liệu tồn tại sau khi container bị xóa
- Phù hợp cho **production data** (database, object storage)
- **Ví dụ**: `postgres_data`, `minio_data`

### Bind Mount

```yaml
volumes:
  - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
  - ./backend/src/db/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
```

- Mount thư mục/file từ máy host vào container
- Thay đổi trên host → có hiệu lực ngay trong container
- Phù hợp cho **config files**, **development**
- **Ví dụ**: nginx.conf, SQL init scripts

---

## 21. Horizontal Scaling vs Vertical Scaling

### Horizontal Scaling (Scale Out)
**Tăng số lượng instance**

```
1 backend → 2 backend → N backend
```

- **Ưu điểm**: Linh hoạt, không downtime, chi phí thấp hơn
- **Ví dụ trong project**: `backend-1` + `backend-2`
- Nginx load balancing phân phối đều request

### Vertical Scaling (Scale Up)
**Tăng tài nguyên của 1 instance**

```
1 backend (2GB RAM) → 1 backend (8GB RAM)
```

- **Ưu điểm**: Đơn giản hơn
- **Nhược điểm**: Giới hạn phần cứng, thường có downtime
- **Ví dụ**: Tăng `mem_limit` trong docker-compose.yml

---

## 22. Healthcheck + depends_on

### Healthcheck

Docker kiểm tra health của container bằng lệnh trong `healthcheck`:

```yaml
# PostgreSQL
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U product_user -d product_db"]
  interval: 10s      # Kiểm tra mỗi 10s
  timeout: 5s        # Timeout sau 5s
  retries: 5         # Thử 5 lần trước khi mark unhealthy
  start_period: 30s  # Chờ 30s trước lần kiểm tra đầu tiên

# Backend
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
```

### depends_on với condition

```yaml
backend-1:
  depends_on:
    db:
      condition: service_healthy    # Chờ db healthy
    minio:
      condition: service_healthy    # Chờ minio healthy

nginx:
  depends_on:
    backend-1:
      condition: service_healthy    # Chờ backend-1 healthy
    backend-2:
      condition: service_healthy    # Chờ backend-2 healthy
```

> **Lưu ý quan trọng**: `depends_on + healthcheck` chỉ kiểm soát **thứ tự khởi động** ở mức Compose. Nó không đảm bảo application hoàn toàn sẵn sàng. Vì vậy, backend có **retry logic** để tự kết nối lại.

---

## 23. Logging Limits

Cấu hình trong `docker-compose.yml`:

```yaml
logging:
  driver: "json-file"     # Lưu log dạng JSON
  options:
    max-size: "10m"       # Mỗi file log tối đa 10MB
    max-file: "3"         # Giữ tối đa 3 file log
```

- `max-size: "10m"` → Khi log đạt 10MB, file cũ bị rotate
- `max-file: "3"` → Chỉ giữ 3 file log gần nhất
- **Tổng tối đa**: 30MB log mỗi service

**Mục đích**: Tránh log phát triển vô hạn và làm đầy ổ đĩa server.

---

## 24. Resource Limits

Cấu hình trong `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: "1.0"      # Giới hạn tối đa 1 CPU core
      memory: 512M     # Giới hạn tối đa 512MB RAM
```

**Mục đích**: 
- Ngăn một container chiếm quá nhiều tài nguyên
- Đảm bảo các service khác vẫn có đủ tài nguyên
- Quan trọng trong môi trường production

---

## 25. Các Lỗi Thường Gặp

### ❌ Lỗi: `connection refused` khi backend kết nối DB

**Nguyên nhân**: Backend start trước khi PostgreSQL sẵn sàng.

**Giải pháp**: 
- Project đã có retry logic trong `server.js`
- Backend tự động thử kết nối lại 10 lần với delay 3s

### ❌ Lỗi: `localhost` không resolve

**Nguyên nhân**: Dùng `DB_HOST=localhost` thay vì `DB_HOST=db`

**Giải pháp**: Trong container, `localhost` = chính container đó. Phải dùng service name.

### ❌ Lỗi: Port đã được dùng

**Nguyên nhân**: Port `8080`, `3001`, `3002`, `9000`, `9001` đang được dùng bởi service khác.

**Giải pháp**:
```bash
# Kiểm tra port đang dùng
netstat -tulpn | grep 8080

# Dừng service đang dùng port hoặc thay đổi port trong docker-compose.yml
```

### ❌ Lỗi: Dữ liệu mất sau restart

**Nguyên nhân**: Đã dùng `docker compose down -v` (xóa volume)

**Giải pháp**: Chỉ dùng `docker compose down` (giữ volume).

### ❌ Lỗi: MinIO bucket chưa được tạo

**Nguyên nhân**: Backend start trước MinIO fully initialized

**Giải pháp**: Backend tự động tạo bucket khi start, có retry logic.

### ❌ Lỗi: `permission denied` khi chạy test script

**Giải pháp**:
```bash
chmod +x scripts/test-api.sh
bash scripts/test-api.sh
```

---

## 📋 DEMO SCRIPT – 5-10 Phút

### STEP 1 – Build và chạy toàn hệ thống

```bash
docker compose up -d --build
```

**Giải thích khi demo:**
> "Chỉ cần 1 lệnh duy nhất, Docker Compose sẽ:
> 1. Build backend image từ Dockerfile
> 2. Tạo Docker network
> 3. Tạo persistent volumes
> 4. Khởi động PostgreSQL → seed 10 sản phẩm
> 5. Khởi động MinIO → tạo bucket
> 6. Khởi động 2 backend instances
> 7. Khởi động Nginx load balancer"

---

### STEP 2 – Kiểm tra container

```bash
docker compose ps
```

Chỉ ra 5 service đang running/healthy:
```
product-nginx
product-backend-1
product-backend-2
product-postgres
product-minio
```

---

### STEP 3 – Test API thật

```bash
curl http://localhost:8080/api/products
```

**Giải thích khi demo:**
> "API trả về 10 sản phẩm từ PostgreSQL. Đây là dữ liệu thật, không phải mock."

---

### STEP 4 – Chứng minh Service Discovery

```bash
docker compose exec backend-1 env | grep -E "DB_HOST|MINIO_ENDPOINT"
```

Kết quả:
```
DB_HOST=db
MINIO_ENDPOINT=minio
```

**Giải thích khi demo:**
> "Backend kết nối database bằng hostname 'db', không phải localhost.
> Đây là Docker DNS – mỗi service name được tự động resolve thành IP container."

---

### STEP 5 – Chứng minh 2 backend instances

```bash
# Direct access
curl http://localhost:3001/health
curl http://localhost:3002/health

# Xem cả 2 dùng cùng image
docker inspect product-backend-1 --format='{{.Image}}'
docker inspect product-backend-2 --format='{{.Image}}'
```

**Giải thích khi demo:**
> "2 container đang chạy từ cùng 1 Docker image (product-api:latest).
> Sự khác biệt duy nhất là INSTANCE_NAME environment variable."

---

### STEP 6 – Demo Nginx Load Balancing

```bash
# Gọi 8 lần liên tiếp
for i in {1..8}; do
  curl -s http://localhost:8080/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Request {sys.argv[1]} → {d[\"instance\"]}')" $i
done
```

Hoặc đơn giản hơn:
```bash
for i in {1..8}; do
  echo -n "Request $i → "
  curl -s http://localhost:8080/health | grep -o '"instance":"[^"]*"'
done
```

**Giải thích khi demo:**
> "Nginx phân phối request theo round-robin giữa backend-1 và backend-2.
> Đây là bước đầu tiên của horizontal scaling."

---

### STEP 7 – Demo Persistence

```bash
# Tạo sản phẩm mới
curl -X POST http://localhost:8080/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo Persistence Product","description":"Test persistence","price":5000000,"category":"Demo","stock":1}'

# Đếm số sản phẩm
curl -s http://localhost:8080/api/products | grep '"count"'

# Dừng và xóa container
docker compose down

# Khởi động lại (KHÔNG có --build để thấy rõ volume được giữ)
docker compose up -d

# Kiểm tra dữ liệu vẫn còn
curl -s http://localhost:8080/api/products | grep '"count"'
curl http://localhost:8080/api/products | grep "Demo Persistence"
```

---

### STEP 8 – Demo Logs

```bash
docker compose logs -f backend-1
```

Trong terminal khác:
```bash
curl http://localhost:8080/api/products
```

**Giải thích khi demo:**
> "Logs cho thấy từng request được xử lý bởi backend-1."

---

### STEP 9 – Demo Restart

```bash
# Restart backend-1
docker compose restart backend-1

# Gọi API nhiều lần – request tạm thời chỉ đến backend-2
for i in {1..4}; do
  curl -s http://localhost:8080/health | grep '"instance"'
done
```

---

### STEP 10 – Demo Upload ảnh (MinIO integration)

```bash
# Tạo ảnh test
echo "test image" > /tmp/product.jpg

# Upload ảnh cho sản phẩm ID 1
curl -X POST http://localhost:8080/api/products/1/image \
  -F "image=@/tmp/product.jpg"

# Xem image_url đã được lưu
curl http://localhost:8080/api/products/1 | grep image_url
```

**Giải thích khi demo:**
> "Backend nhận file, upload lên MinIO, lấy URL, cập nhật PostgreSQL.
> Đây chứng minh hệ thống thực sự sử dụng cả PostgreSQL lẫn MinIO."

---

### STEP 11 – Kết thúc demo

```bash
# Dừng tất cả (GIỮ dữ liệu)
docker compose down

# Nếu muốn reset hoàn toàn (XÓA dữ liệu)
# docker compose down -v   ← CẢNH BÁO: xóa vĩnh viễn!
```

---

## ✅ Test Checklist

```
[ ] docker compose config chạy thành công (không có lỗi syntax)
[ ] docker compose up -d --build thành công
[ ] 5 container đều có status healthy/running
[ ] PostgreSQL healthy (pg_isready pass)
[ ] MinIO hoạt động và bucket "product-images" tồn tại
[ ] backend-1 hoạt động (curl :3001/health → backend-1)
[ ] backend-2 hoạt động (curl :3002/health → backend-2)
[ ] Nginx hoạt động (curl :8080/nginx-health)
[ ] GET /health qua Nginx hoạt động
[ ] GET /api/products trả về 10 sản phẩm mẫu
[ ] GET /api/products/:id trả về sản phẩm cụ thể
[ ] POST /api/products tạo sản phẩm thành công
[ ] POST /api/products/:id/image upload ảnh lên MinIO thành công
[ ] Dữ liệu persistent sau docker compose down + up
[ ] MinIO data persistent sau restart
[ ] backend-1 kết nối db bằng hostname "db" (không phải localhost)
[ ] backend-2 kết nối MinIO bằng hostname "minio" (không phải localhost)
[ ] backend-1 và backend-2 dùng cùng image product-api:latest
[ ] Nginx phân phối request round-robin giữa backend-1 và backend-2
[ ] docker compose logs hoạt động
[ ] docker compose restart backend-1 hoạt động
[ ] docker compose down hoạt động (không mất dữ liệu)
```

---

## 📚 Tài Liệu Tham Khảo

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Docker Networking](https://docs.docker.com/network/)
- [PostgreSQL Docker Image](https://hub.docker.com/_/postgres)
- [MinIO Docker Image](https://hub.docker.com/r/minio/minio)
- [Nginx Docker Image](https://hub.docker.com/_/nginx)
