#!/bin/bash
# ===== 电力中长期交易系统 - 一键部署/更新脚本 =====
# 用法: bash deploy.sh [deploy|update|rollback|status]
set -e

ACTION=${1:-deploy}
PROJECT_DIR="/opt/electricity-trading"
GIT_REPO="https://github.com/YOUR_USERNAME/electricity-trading.git"  # ← 改成你的仓库地址
GIT_BRANCH="main"

# ----- 生成随机密码（仅首次） -----
generate_password() {
  openssl rand -base64 18 | tr -d '/+=' | cut -c1-20
}

# ========================================
#  deploy — 全新部署
# ========================================
do_deploy() {
  echo "===== 开始全新部署 ====="

  # -- 1. PostgreSQL Docker --
  echo "[1/10] 部署 PostgreSQL..."
  if docker ps --format '{{.Names}}' | grep -q '^postgres$'; then
    echo "PostgreSQL 容器已存在，跳过"
  else
    PG_PASSWORD=$(generate_password)
    docker run -d \
      --name postgres \
      --restart always \
      --memory="256m" \
      --memory-swap="256m" \
      -e POSTGRES_USER=et_user \
      -e "POSTGRES_PASSWORD=${PG_PASSWORD}" \
      -e POSTGRES_DB=electricity_trading \
      -v pgdata:/var/lib/postgresql/data \
      -p 127.0.0.1:5432:5432 \
      postgres:16-alpine

    echo "等待 PostgreSQL 启动..."
    sleep 5
    echo "PostgreSQL 已启动，密码: ${PG_PASSWORD}"
    echo "请保存此密码！"
  fi

  # -- 2. 克隆代码 --
  echo "[2/10] 克隆代码..."
  if [ -d "${PROJECT_DIR}/.git" ]; then
    echo "项目目录已存在，执行 git pull..."
    cd "${PROJECT_DIR}" && git pull origin "${GIT_BRANCH}"
  else
    git clone -b "${GIT_BRANCH}" "${GIT_REPO}" "${PROJECT_DIR}"
  fi
  cd "${PROJECT_DIR}"

  # -- 3. 环境变量 --
  echo "[3/10] 配置环境变量..."
  if [ ! -f "${PROJECT_DIR}/.env" ]; then
    if [ -n "${PG_PASSWORD}" ]; then
      sed "s/CHANGE_THIS_PASSWORD/${PG_PASSWORD}/g" deploy/.env.production > .env
    else
      cp deploy/.env.production .env
      echo "!!! 请编辑 .env 填入 PostgreSQL 密码后重新运行"
      exit 1
    fi
  fi
  # 加载环境变量供 Prisma 使用
  export $(grep -v '^#' .env | xargs)

  # -- 4. 安装依赖 --
  echo "[4/10] 安装依赖（npm install）..."
  npm install

  # -- 5. 切换 Prisma 为 PostgreSQL --
  echo "[5/10] 切换 Prisma 为 PostgreSQL..."
  PRISMA_SCHEMA="${PROJECT_DIR}/server/src/prisma/schema.prisma"
  # 备份原始文件
  if [ ! -f "${PRISMA_SCHEMA}.sqlite.bak" ]; then
    cp "${PRISMA_SCHEMA}" "${PRISMA_SCHEMA}.sqlite.bak"
  fi
  # 替换 provider 和 url
  sed -i 's/provider = "sqlite"/provider = "postgresql"/' "${PRISMA_SCHEMA}"
  sed -i 's|url *= *"file:./dev.db"|url = env("DATABASE_URL")|' "${PRISMA_SCHEMA}"

  # -- 6. Prisma 生成 + 迁移 --
  echo "[6/10] Prisma generate..."
  npx prisma generate --schema="${PRISMA_SCHEMA}"

  echo "[7/10] Prisma migrate deploy..."
  npx prisma migrate deploy --schema="${PRISMA_SCHEMA}"

  # -- 7. 构建 --
  echo "[8/10] 构建项目..."
  # 构建前端（TypeScript + Vite）
  npm run build -w client
  # 构建后端（TypeScript → CommonJS）
  npm run build -w server

  # -- 8. Nginx --
  echo "[9/10] 配置 Nginx..."
  cp deploy/nginx.conf /etc/nginx/sites-available/electricity-trading
  rm -f /etc/nginx/sites-enabled/default
  ln -sf /etc/nginx/sites-available/electricity-trading /etc/nginx/sites-enabled/
  nginx -t && systemctl reload nginx

  # -- 9. PM2 --
  echo "[10/10] 启动 PM2..."
  # 确保日志目录存在
  mkdir -p /var/log/electricity-trading
  pm2 start deploy/ecosystem.config.js
  pm2 save
  pm2 startup systemd -u root --hp /root

  echo ""
  echo "===== 部署完成 ====="
  echo "访问地址: http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_IP')"
  echo "健康检查: http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_IP')/api/health"
}

# ========================================
#  update — 代码更新
# ========================================
do_update() {
  echo "===== 更新项目 ====="
  cd "${PROJECT_DIR}"

  echo "[1/5] 拉取代码..."
  git pull origin "${GIT_BRANCH}"

  echo "[2/5] 安装新依赖..."
  npm install

  echo "[3/5] 确保 Prisma schema 使用 PostgreSQL..."
  PRISMA_SCHEMA="${PROJECT_DIR}/server/src/prisma/schema.prisma"
  if grep -q 'provider = "sqlite"' "${PRISMA_SCHEMA}"; then
    sed -i 's/provider = "sqlite"/provider = "postgresql"/' "${PRISMA_SCHEMA}"
    sed -i 's|url *= *"file:./dev.db"|url = env("DATABASE_URL")|' "${PRISMA_SCHEMA}"
  fi

  echo "[4/5] Prisma generate + migrate..."
  export $(grep -v '^#' .env | xargs)
  npx prisma generate --schema="${PRISMA_SCHEMA}"
  npx prisma migrate deploy --schema="${PRISMA_SCHEMA}"

  echo "[5/5] 重新构建 + 重启..."
  npm run build -w client
  npm run build -w server
  pm2 restart electricity-trading

  echo "===== 更新完成 ====="
}

# ========================================
#  rollback — 回滚到上一个版本
# ========================================
do_rollback() {
  echo "===== 回滚 ====="
  cd "${PROJECT_DIR}"

  # 回到上一个 commit 的构建产物（如有备份）
  if [ -d "${PROJECT_DIR}/client/dist.bak" ] && [ -d "${PROJECT_DIR}/server/dist.bak" ]; then
    rm -rf client/dist server/dist
    mv client/dist.bak client/dist
    mv server/dist.bak server/dist
    echo "已还原备份构建产物"
  fi

  # Git 回滚
  git log --oneline -5
  echo ""
  read -p "输入要回滚到的 commit hash（留空则回滚到上一个）: " COMMIT
  if [ -z "${COMMIT}" ]; then
    git reset --hard HEAD~1
  else
    git reset --hard "${COMMIT}"
  fi

  pm2 restart electricity-trading
  echo "===== 回滚完成 ====="
}

# ========================================
#  status — 查看状态
# ========================================
do_status() {
  echo "===== 服务状态 ====="
  pm2 status
  echo ""
  echo "===== PostgreSQL ====="
  docker ps --filter name=postgres --format '{{.Names}} {{.Status}}'
  echo ""
  echo "===== Nginx ====="
  systemctl status nginx --no-pager -l | head -5
  echo ""
  echo "===== 端口监听 ====="
  ss -tlnp | grep -E '3000|80|5432'
  echo ""
  echo "===== 磁盘 ====="
  df -h / | tail -1
  echo ""
  echo "===== 内存 ====="
  free -h | head -2
}

# ========================================
case "${ACTION}" in
  deploy)   do_deploy ;;
  update)   do_update ;;
  rollback) do_rollback ;;
  status)   do_status ;;
  *)
    echo "用法: bash deploy.sh [deploy|update|rollback|status]"
    exit 1
    ;;
esac
