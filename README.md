# 怡口全屋净水报价系统

本项目是一个本地/服务器部署的报价系统，包含报价单、产品管理、账号权限、PDF 导出、产品快速导入等功能。

## Docker 部署

本镜像基于 `python:3.11-slim-bookworm`，内置 Chromium 和中文字体，可用于 PDF 导出。支持常见 Linux 服务器架构，包括 `linux/amd64` 和 `linux/arm64`。

### 单机启动

```bash
docker compose up -d --build
```

访问：

```text
http://服务器IP:4173
```

默认管理员：

```text
账号：admin
密码：360304437
```

首次上线后建议立即在网页内修改管理员密码。

### 持久化数据

`docker-compose.yml` 使用 3 个 Docker volume：

- `quote-data`：账号、产品库、报价状态
- `quote-uploads`：产品管理上传的图片
- `quote-pdfs`：临时导出的 PDF

更新镜像时不要删除这些 volume，否则账号和业务数据会丢失。

### 多架构镜像构建

本地构建并推送多架构镜像：

```bash
docker buildx create --use
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/你的GitHub用户名/ecowater-quote-site:latest \
  --push .
```

服务器运行：

```bash
docker run -d \
  --name ecowater-quote-site \
  --restart unless-stopped \
  -p 4173:4173 \
  -v quote-data:/app/data \
  -v quote-uploads:/app/assets/custom-products \
  -v quote-pdfs:/app/generated-pdfs \
  ghcr.io/你的GitHub用户名/ecowater-quote-site:latest
```

## GitHub Actions

仓库包含 `.github/workflows/docker-image.yml`。推送到 `main` 分支或创建 tag 后，会自动构建并推送 `linux/amd64`、`linux/arm64` 镜像到 GitHub Container Registry。
