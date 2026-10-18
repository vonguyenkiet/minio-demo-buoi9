# ============================================================
# Dockerfile – Product Catalog API
# ============================================================
# Sử dụng Node.js LTS (Alpine để image nhỏ gọn)
FROM node:20-alpine

# Cài thêm curl để dùng cho healthcheck
RUN apk add --no-cache curl

# Tạo user không phải root để tăng bảo mật
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Đặt thư mục làm việc
WORKDIR /app

# Copy package files trước để tận dụng Docker layer cache
COPY package*.json ./

# Cài dependencies (bỏ qua devDependencies)
RUN npm ci --omit=dev

# Copy source code
COPY src/ ./src/

# Đổi owner sang user không phải root
RUN chown -R appuser:appgroup /app

# Chuyển sang user không phải root
USER appuser

# Expose port 3000
EXPOSE 3000

# Healthcheck: kiểm tra /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Chạy application
CMD ["node", "src/server.js"]
