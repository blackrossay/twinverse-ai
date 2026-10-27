#!/usr/bin/env bash
# One-command local demo for judges (no Docker required).
# Usage: ./scripts/demo.sh   →   http://localhost:3000
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Twinverse AI demo =="
command -v python3 >/dev/null || { echo "Python 3.11+ required"; exit 1; }
command -v node >/dev/null || { echo "Node 18+ required"; exit 1; }

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — add MODEL_API_KEY for live calls (optional)."
fi

if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q -e "services/api[dev]"

if [ ! -d apps/web/node_modules ]; then
  (cd apps/web && npm install)
fi

cleanup() { kill "${API_PID:-}" "${WEB_PID:-}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

uvicorn twinverse.main:app --port 8000 --app-dir services/api &
API_PID=$!
(cd apps/web && npm run dev) &
WEB_PID=$!

for i in $(seq 1 30); do
  curl -sf localhost:8000/api/health >/dev/null 2>&1 && break
  sleep 1
done
echo ""
echo "  → Open http://localhost:3000"
echo "  → Click 'Seed demo personas', then 'Ask the council'."
echo "  → Ctrl+C stops both servers."
wait
