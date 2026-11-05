# Text2SQL — Claude Code Context

## Project
DataPilot AI: Text-to-SQL backend with Dual RAG (schema + few-shot retrieval), file upload & table ingestion (CSV, TSV, Excel, JSON, Parquet, SQLite), FastAPI, ChromaDB, and React + Vite + Tailwind v4 + shadcn frontend.

## Commands
- Run backend tests: `uv run pytest`
- Lint: `uv run ruff check . && uv run ruff format --check .`
- Format: `uv run ruff format .`
- Type check: `uv run mypy app`
- Start FastAPI backend: `uv run uvicorn app.main:app --reload`
- Start React frontend: `cd frontend && npm run dev`
- Build React frontend: `cd frontend && npm run build`
- Index Spider benchmark data: `uv run python scripts/index_spider.py`
- Run evaluation: `uv run python -m app.eval.runner --split dev --limit 50`

## Conventions
- Feature branches per module, PRs at module boundaries, small commits per logical unit
- Docstrings only for non-obvious logic
- All config via pydantic-settings (AppSettings), never hardcode secrets
- Tests mock LLM and ChromaDB; only executor and ingestion tests use real SQLite fixtures
- Type annotations required on all public functions
- `uv run` prefix for all Python commands

## Architecture
- `app/core/`: config (`AppSettings`), logging, LLM factory
- `app/db/`: schema models, introspection, SQLite file ingestion (`ingest.py`), storage manager (`storage.py`), validator, executor
- `app/retrieval/`: ChromaDB-backed schema and example retrievers with direct-table & semantic fallbacks
- `app/llm/`: prompt templates, SQL generator
- `app/pipeline/`: prompt assembler, baseline, deterministic (LangGraph), and agent pipelines
- `app/eval/`: Spider dataset loader, offline eval runner
- `app/api/`: FastAPI routes (`/health`, `/query`, `/upload`, `/databases`), models, guardrails
- `frontend/`: React 19 + Vite + TypeScript + Tailwind CSS v4 + shadcn UI + React Bits registry
