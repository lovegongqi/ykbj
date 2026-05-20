# 怡口全屋净水报价系统

本项目是怡口全屋净水报价系统，包含报价单、产品管理、账号权限、PDF 导出、产品快速导入等功能。

仓库地址：

```text
https://github.com/lovegongqi/ykbj.git
```

默认管理员：

```text
账号：admin
密码：66778899
```

首次上线后建议立即在网页内修改管理员密码。

## 方式一：服务器直接构建运行

这套方式最稳，不依赖 GitHub 镜像包是否公开。服务器只需要安装 Docker 和 Docker Compose。

```bash
git clone https://github.com/lovegongqi/ykbj.git
cd ykbj
docker compose up -d --build
```

访问：

```text
http://服务器IP:4173
```

更新代码后：

```bash
cd ykbj
git pull
docker compose up -d --build
```

查看运行状态：

```bash
docker compose ps
docker compose logs -f
```

停止：

```bash
docker compose down
```

## 方式二：直接拉 GitHub 镜像运行

仓库推送到 `main` 分支后，GitHub Actions 会自动构建多架构镜像：

```text
ghcr.io/lovegongqi/ykbj:latest
```

支持：

```text
linux/amd64
linux/arm64
```

服务器直接运行：

```bash
git clone https://github.com/lovegongqi/ykbj.git
cd ykbj
docker compose -f docker-compose.prod.yml up -d
```

更新镜像后：

```bash
cd ykbj
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

如果拉取镜像提示无权限，需要到 GitHub 把 `ghcr.io/lovegongqi/ykbj` 这个 Package 设置为 Public，或者先在服务器执行：

```bash
docker login ghcr.io
```

## 数据持久化

Compose 使用 3 个 Docker volume：

- `quote-data`：账号、产品库、报价状态
- `quote-uploads`：产品管理上传的图片
- `quote-pdfs`：临时导出的 PDF

更新镜像或重建容器时不要删除这些 volume。

会清空业务数据的命令是：

```bash
docker compose down -v
```

正常更新不要加 `-v`。

## 端口

默认端口是 `4173`。

如果服务器安全组或防火墙没开放，需要放行 TCP `4173`。

如果要改端口，例如公网用 `8080`：

```yaml
ports:
  - "8080:4173"
```

改完后访问：

```text
http://服务器IP:8080
```

## 反向代理

如果使用 Nginx，可以转发到本机 `4173`：

```nginx
server {
    listen 80;
    server_name 你的域名;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 文件说明

- `Dockerfile`：构建应用镜像，内置 Chromium 和中文字体，用于 PDF 导出
- `docker-compose.yml`：服务器源码构建部署
- `docker-compose.prod.yml`：服务器直接拉取 GHCR 镜像部署
- `.github/workflows/docker-image.yml`：自动构建并推送 `amd64`、`arm64` 镜像
