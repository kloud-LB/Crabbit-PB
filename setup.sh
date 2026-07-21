#!/usr/bin/env bash
# Crabbit! V3 — 一键启动脚本
# 使用方法: bash setup.sh
set -e

cd "$(dirname "$0")"

echo "🦀 Crabbit! V3 部署脚本"
echo "========================"
echo ""

# 1. 检查 .env
if ! grep -q "sk-" .env 2>/dev/null || grep -q "请替换" .env 2>/dev/null; then
    echo "⚠️  请先编辑 .env 文件，填入真实的 DEEPSEEK_API_KEY"
    echo "   nano .env"
    echo ""
fi

# 2. 检查 Docker
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker 未运行，请先启动 Docker Desktop"
    exit 1
fi

echo "✅ Docker 运行中"
echo ""

# 3. 拉取镜像（如果还没有）
echo "📦 拉取 Docker 镜像..."
docker compose pull pocketbase redis 2>&1 | tail -3
echo ""

# 4. 启动基础设施（PB + Redis）
echo "🚀 启动 PocketBase + Redis..."
docker compose up pocketbase redis -d 2>&1
sleep 3

# 5. 等待 PocketBase 就绪
echo "⏳ 等待 PocketBase 就绪..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:8090/api/health >/dev/null 2>&1; then
        echo "✅ PocketBase 就绪"
        break
    fi
    sleep 2
done

# 6. 启动 SearXNG
echo "🔍 启动 SearXNG..."
docker compose up searxng -d 2>&1
sleep 2

# 7. 构建并启动 Agent
echo "🤖 构建 Agent 镜像（首次需要几分钟）..."
docker compose build agent 2>&1
echo "🚀 启动 Agent..."
docker compose up agent -d 2>&1

# 8. 检查状态
echo ""
echo "========================"
echo "📊 容器状态："
docker compose ps
echo ""
echo "========================"

# 9. 验证服务
echo ""
echo "🔍 验证服务..."
echo -n "  PocketBase: "; curl -sf http://localhost:8090/api/health >/dev/null 2>&1 && echo "✅" || echo "❌"
echo -n "  SearXNG:    "; curl -sf http://localhost:8088/search?q=test\&format=json >/dev/null 2>&1 && echo "✅" || echo "❌"
echo -n "  Agent:      "; curl -sf http://localhost:8080/health >/dev/null 2>&1 && echo "✅" || echo "❌"

echo ""
echo "🌐 PocketBase Admin: http://localhost:8090/_/"
echo "   账号: admin@crabbit.local"
echo "   密码: Crabbit2024!"
echo ""
echo "💬 QQ 机器人 WebSocket: ws://localhost:8080/ws/qq"
echo "💬 PWA 内嵌聊天:        ws://localhost:8080/ws/chat"
echo ""
echo "📝 后续步骤:"
echo "   1. 编辑 .env 填入真实的 DEEPSEEK_API_KEY"
echo "   2. 启动 NapCat: docker compose up napcat -d"
echo "   3. 打开 http://localhost:6099 登录 QQ"
echo ""
echo "🦀 蟹老板祝你使用愉快！"
