#!/bin/bash
# ===== 电力中长期交易系统 - 服务器初始化脚本 =====
# 在 Ubuntu 22.04 上以 root 执行: bash setup.sh
set -e

echo "========================================="
echo " 电力中长期交易系统 - 服务器初始化"
echo "========================================="

# ----- 1. 系统更新 + 基础工具 -----
echo "[1/8] 更新系统..."
apt update && apt upgrade -y
apt install -y curl wget git ufw nginx build-essential

# ----- 2. Node.js 20 LTS -----
echo "[2/8] 安装 Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi
echo "Node.js $(node -v) | npm $(npm -v)"

# ----- 3. PM2 -----
echo "[3/8] 安装 PM2..."
npm install -g pm2

# ----- 4. Docker -----
echo "[4/8] 安装 Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | bash
  systemctl enable docker
  systemctl start docker
fi
echo "Docker $(docker --version)"

# ----- 5. 创建目录 -----
echo "[5/8] 创建目录结构..."
mkdir -p /opt/electricity-trading
mkdir -p /var/log/electricity-trading
mkdir -p /var/log/nginx

# ----- 6. 防火墙 -----
echo "[6/8] 配置 UFW 防火墙..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP
ufw allow 443/tcp    # HTTPS（预留）
ufw --force enable
ufw status verbose

# ----- 7. 日志轮转 -----
echo "[7/8] 配置日志轮转..."
cat > /etc/logrotate.d/electricity-trading << 'LOGROTATE'
/var/log/electricity-trading/*.log {
    daily
    rotate 30
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    dateext
}
LOGROTATE

cat > /etc/logrotate.d/nginx-electricity << 'LOGROTATE_NGINX'
/var/log/nginx/electricity-trading-*.log {
    daily
    rotate 30
    missingok
    notifempty
    compress
    delaycompress
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 $(cat /var/run/nginx.pid)
    endscript
}
LOGROTATE_NGINX

# ----- 8. 确认 -----
echo "[8/8] 初始化完成！"
echo ""
echo "已安装:"
echo "  Node.js : $(node -v)"
echo "  npm     : $(npm -v)"
echo "  Docker  : $(docker --version)"
echo "  PM2     : $(pm2 -v)"
echo "  Nginx   : $(nginx -v 2>&1)"
echo "  ufw     : active"
echo ""
echo "接下来: 运行 deploy.sh 部署项目"
