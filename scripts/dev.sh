#!/usr/bin/env bash

set -e

API_PORT=${API_PORT:-3000}
APP_PORT=${APP_PORT:-3001}

echo "🚀 Starting TAP development servers..."
echo "   API: http://localhost:${API_PORT}"
echo "   App: http://localhost:${APP_PORT}"
echo ""

trap 'kill 0' EXIT

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "${ROOT_DIR}/packages/api"
PORT=${API_PORT} bun run dev &
API_PID=$!

sleep 2

cd "${ROOT_DIR}/packages/app"
PORT=${APP_PORT} bun run dev --turbopack &
APP_PID=$!

wait

