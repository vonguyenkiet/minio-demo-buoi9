# DECISIONS.md – Quyết định thiết kế ngoài prompt

| # | Quyết định | Nguyên nhân | Phương án chọn |
|---|---|---|---|
| D1 | React 18 + Vite 6 | Node v24 tương thích; React 18 stable với react-router-dom v6 | `react@^18.3.1`, `vite@^6.3.5` |
| D2 | Dùng `xcopy` thay `rsync` | Không có WSL distro để dùng `rsync` | `xcopy /E /I /H /Y ... /EXCLUDE:...` |
| D3 | Không có WSL distro | Phase 3 (NGINX native) là `NOT RUN (no WSL distro)` | Ghi lại hướng dẫn cài trong README |
| D4 | OpenSSL không có trong PATH Windows | `gen-certs.sh` cần chạy trong Git Bash hoặc WSL | Script detect và hướng dẫn người dùng |
| D5 | Docker Desktop daemon không chạy khi Phase 0 | Ghi trạng thái, không block – người dùng cần Start Docker Desktop | Ghi vào TEST-REPORT.md |
| D6 | `upstream-docker-resolve.conf`: `resolve` không được hỗ trợ NGINX OSS | NGINX Plus feature; NGINX OSS (nginx:1.30-alpine) không hỗ trợ | Ghi `NOT RUN` với lý do |
| D7 | `location ~ ^/health(/db)?$` thay vì riêng hai location | Gộn gọn, khớp `/health` và `/health/db` | Regex location |
| D8 | Ports backend `127.0.0.1:3001:3000` thay `3001:3000` | Bảo mật: không expose ra mọi interface, chỉ localhost | Spec 4.4 |
| D9 | CORS test HTML dùng `localhost:8081` gọi `127.0.0.1:3001` | Port khác nhau → cross-origin → trình duyệt chặn (không có ACAO header) | Đúng kịch bản CORS demo |
| D10 | Frontend `pages/` riêng trong `src/` | Tách biệt routes rõ ràng, dễ mở rộng | Cấu trúc chuẩn Vite/React |
| D11 | MinIO image fallback `cgr.dev/chainguard/minio:latest` | `quay.io/minio/minio:latest` và Docker Hub `minio/minio:latest` đã đóng anonymous pull (401 UNAUTHORIZED) | Dùng `${MINIO_IMAGE:-cgr.dev/chainguard/minio:latest}`, giữ nguyên command và healthcheck |
| D12 | Windows `curl` (Schannel backend) và kiểm tra revocation | Schannel mặc định kiểm tra revocation online, CA local không có OCSP/CRL nên báo unknown revocation | Dùng `--ssl-no-revoke` khi curl trên Windows host; OpenSSL `s_client` trả `Verify return code: 0 (ok)` |
