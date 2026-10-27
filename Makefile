.PHONY: install test lint backend frontend build check

install:
	uv pip install -e "services/api[dev]"
	cd apps/web && npm install

test:
	.venv/bin/python -m pytest services/api/tests -q

lint:
	.venv/bin/python -m ruff check services/api/twinverse services/api/tests || uv tool run ruff check services/api/twinverse services/api/tests
	cd apps/web && npx tsc --noEmit && npx eslint .

backend:
	.venv/bin/uvicorn twinverse.main:app --port 8000 --app-dir services/api

frontend:
	cd apps/web && npm run dev

build:
	cd apps/web && npm run build

check: lint test build
