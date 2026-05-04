# AGENTS.md

This file serves as the canonical context and rulebook for AI agents working on Pretty Duc. The MVP has been shipped, and original planning briefs have been consolidated here.


## Project Context
Pretty Duc is a modern web UI and API for `duc`. It runs as a separate Docker service alongside a Duc scanner. It reads the shared Duc database read-only and uses the `duc` CLI. 

## Stack
- **Backend:** Node.js + TypeScript + Fastify
- **Frontend:** React + Vite + TypeScript, Mantine UI, Apache ECharts
- **Tooling:** Bun
- **Container:** Docker

## Architecture & Safety Rules
- **No direct database parsing.** Use the `duc` CLI.
- **Normal Browsing:** Use `duc ls -b -d <db> -F -- <path>`. Do NOT use `duc json` for normal browsing to avoid massive recursive dumps.
- **Tree API:** The `/api/tree` endpoint uses `duc json` but is disabled by default via `ENABLE_TREE_API`.
- **Security:** 
  - Always canonicalize paths (must be under `DUC_ROOT`).
  - Always use `--` before dynamic paths to prevent argument injection.
  - Never use shell interpolation. Use `Bun.spawn` (`execFile` equivalent).
- **Concurrency & Limits:**
  - Global `duc` process concurrency limit: 4.
  - Recursive walk concurrency limit: 2.
  - Strict limits on node count, payload size, and time budgets are enforced (defined in `packages/config`).
  - Heuristic payload estimation (`nodeCount * 200` bytes) is used instead of `JSON.stringify` to prevent memory bloat.

## Workspaces
- `apps/api`: Fastify backend
- `apps/web`: React UI
- `packages/contracts`: Zod schemas and shared TypeScript types
- `packages/config`: Env parsing and default limits
- `packages/ui-model`: Shared UI helpers (byte formatting, tree parsing)
- `tests/integration`: Docker-based black-box API tests
- `tests/fixtures/fs`: Deterministic files for integration tests

## Deployment
Docker Compose is the primary deployment method. The Vite frontend is built statically, and the Fastify backend serves both the API and the static UI assets from a single container in production.
