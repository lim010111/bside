#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
export PATH="$HOME/.local/node/bin:$PATH"

echo "================================================="
echo "   🚀 Bside 개발 서버 시작 (FastAPI + Vite)      "
echo "================================================="

# 1. 백엔드 구동 (포트 8000)
echo "▶ FastAPI 백엔드 실행 중 (http://localhost:8000)..."
cd "$DIR/backend"
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# 2. 프론트엔드 구동 (포트 5173)
echo "▶ Vite 프론트엔드 실행 중 (http://localhost:5173)..."
cd "$DIR/web"
npm run dev -- --host &
FRONTEND_PID=$!

cleanup() {
    echo ""
    echo "서버를 종료합니다..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

echo ""
echo "✅ 개발 환경 준비 완료!"
echo "   - 앱 접속: http://localhost:5173"
echo "   - API 문서: http://localhost:8000/docs"
echo "   - 종료하려면 Ctrl+C 를 누르세요."
echo ""

wait
