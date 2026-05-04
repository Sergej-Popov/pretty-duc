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

## Auto

- **Tree/radial tree charts:** `toChartTree` returns children as a flat array. ECharts tree views need a wrapping root node (current directory). Wrap in `chartNodes` computation with `{ name, value, path, children: nodes }` for `tree` and `tree-radial` views.
- **Mantine CSS variables:** `--mantine-color-dimmed-bg` and `--mantine-color-dimmed-border` do NOT exist. Use `--mantine-color-default-hover` for hover bg, `--mantine-color-default-border` for borders, `--mantine-color-dark-light` for selection highlights.
- **Payload budget:** `assertReasonablePayload` uses `nodeCount * 200` heuristic. `nodeCount` counts all nodes including truncated ones — the actual response tree is bounded correctly but the estimate may fail. Default `maxChildrenResponseBytes` is 10 MB (`10485760`).
- **Docker Hub overview:** Pushed via `chko/docker-pushrm:v1` in GHA, reads from `docker/dockerhub-readme.md` (separate from repo README).
- **Duc scanner in Docker:** Use `mkoestler/duc-service` image with `SCHEDULE` env var, not a custom `duc index` entrypoint.
- **Keyboard events on Mantine TextInput:** Use native `addEventListener('keydown', ..., { capture: true })` binding to the input ref. React's synthetic `onKeyDown` on Mantine components may not fire reliably. Use `useRef` for all values accessed inside the listener to avoid stale closures and effect re-runs.
- **Mantine Switch onChange + React setState callback:** `event.currentTarget` is nullified by React after the handler returns. Capture `event.currentTarget.checked` synchronously before passing to a `setState` updater function.
- **Global keyboard shortcuts:** Use a single `window.addEventListener('keydown', handler)` in a `useEffect` (empty deps). Guard against input/textarea/select elements and open modals. Store all mutable values in a `navStateRef` (updated every render) to avoid stale closures. Use `const state = navStateRef.current` inside the handler.
- **Config persistence:** Editable runtime config is stored as `pretty-duc-config.json` (path from `CONFIG_FILE` env var). On startup, `buildConfig()` merges env vars with saved file. API routes: `GET /api/config`, `PUT /api/config`, `POST /api/config/reset`. Limits are mutable at runtime via `currentConfig.limits`.
- **Duc index backgrounding:** Use `Bun.spawn` directly (not the executor) for `duc index` — fire-and-forget with `onExit` logging. Do not await; index can take minutes.
- **Tooltip format (unified):** All chart tooltips show `name: formattedSize (percent%)`. Treemap/sunburst compute percent from `chartTotal` (sum of root node values). Flame graph gets percent from data. Circle packing gets total from per-item `total` field.
