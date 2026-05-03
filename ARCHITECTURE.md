# Pretty Duc Architecture

## Current-state observations

- The repository is greenfield apart from `brief.md` and `MANAGER_BRIEF.md`.
- The product scope is fixed: Dockerized Fastify API, React UI, Mantine, ECharts, bun tooling, Docker-run integration tests, and required documentation.
- Normal browsing must use `duc ls`; direct Duc DB parsing is forbidden; `duc json` is allowed only for a tightly guarded subtree endpoint.

## Problem statement and goals

Build a separate `pretty-duc` service that reads a shared Duc database volume read-only, exposes a safe JSON API, and provides a responsive WinDirStat-like browser UI for remote users. The design must let backend, frontend, Docker, docs, and test delegates work in parallel without inventing their own contracts or safety limits.

## Recommended architecture or change

### Repository shape

Use a bun workspace monorepo. In this greenfield case it reduces friction because backend, frontend, shared contracts, Docker assets, and test harnesses all need to move together.

```text
pretty-duc/
  apps/
    api/                  # Fastify service
    web/                  # React + Vite UI
  packages/
    contracts/            # shared request/response schemas and types
    config/               # env parsing, defaults, constants
    ui-model/             # shared formatting/helpers safe for browser + node
  tests/
    integration/          # Docker-run API and UI integration tests
    fixtures/             # deterministic scanned filesystem fixtures
  docker/
    compose.example.yml
    compose.integration.yml
    duc/                  # optional helper image/scripts for fixture scanning
  docs/
    screenshots/
  Dockerfile
  README.md
  ARCHITECTURE.md
  bun.lockb
  bunfig.toml
  tsconfig.base.json
```

### Module boundaries

- `apps/api`: HTTP routes, input validation, error mapping, Duc process orchestration.
- `apps/api/src/domain`: path guard, Duc output parser, tree-expansion rules, response shaping.
- `apps/api/src/infrastructure`: child-process runner, timeout handling, semaphore, logging.
- `packages/contracts`: Zod schemas and exported TypeScript types for all API payloads and query params.
- `packages/config`: environment schema, frozen defaults, feature flags.
- `apps/web`: route shell, explorer page, treemap/sunburst, table, breadcrumbs, keyboard navigation.
- `packages/ui-model`: byte formatting, percentage helpers, sorting helpers, chart node adapters.
- `tests/integration`: black-box verification against Docker Compose, not internal module tests.

### Backend structure

Use Fastify with four route groups only:

- `GET /api/health`
- `GET /api/info`
- `GET /api/children`
- `GET /api/tree`

Core internal services:

- `EnvConfigService`: resolves `DUC_DATABASE`, `DUC_ROOT`, `PORT`, `DUC_BIN`, `DEFAULT_MIN_SIZE`.
- `PathPolicy`: canonicalizes with `path.resolve`, enforces `requestedPath === DUC_ROOT || requestedPath.startsWith(DUC_ROOT + sep)`.
- `DucRunner`: wraps `execFile`, never shell, applies timeout, captures stdout/stderr, maps exit conditions.
- `ChildrenService`: calls `duc ls -d <db> -F <path>`, parses immediate children, sorts by size desc, applies optional `minSize` filter.
- `RecursiveChildrenService`: expands breadth-first by repeated `ChildrenService` calls within request budgets.
- `TreeService`: optional `duc json` adapter behind explicit feature flag and stricter limits.

### Frontend structure

Single-page app with one primary explorer route. Keep navigation state URL-driven so remote sharing and refresh are stable.

- URL state: `?path=...&view=treemap|sunburst&q=...`
- Server state: TanStack Query for `health`, `info`, `children`, `tree`
- Local persisted UI state: Mantine color scheme, table density, largest-items panel visibility
- Derived view state: breadcrumbs, filtered rows, selected node, keyboard focus index

Primary UI regions:

- top bar: current path, copy path, refresh, dark mode toggle
- breadcrumbs + up/back controls
- left/main pane: treemap or sunburst
- right/below pane: sortable directory table + search filter
- side panel: largest items in current directory
- global status: loading, empty, indexed-path-not-found, timeout, database unavailable

### Runtime and process model

- One Node.js process per `pretty-duc` container serves API and static UI assets.
- Vite is build-time only; production serves compiled assets from Fastify.
- Duc integration occurs through short-lived child processes only.
- Global Duc child-process concurrency cap: `4`.
- Recursive expansion uses internal concurrency cap: `2` to avoid bursty DB reads.
- Logs are structured JSON to stdout.

## API contracts

### Shared response envelope

Successful responses return explicit JSON objects. Errors use:

```json
{
  "error": {
    "code": "INVALID_PATH",
    "message": "Path must be under configured root",
    "details": {}
  }
}
```

### `GET /api/health`

```json
{
  "ok": true,
  "ducAvailable": true,
  "databaseReadable": true,
  "database": "/database/duc.db",
  "root": "/scan/root"
}
```

### `GET /api/info`

```json
{
  "database": "/database/duc.db",
  "raw": "...",
  "parsed": {
    "entries": null,
    "sizeBytes": null,
    "lastScanAt": null
  }
}
```

`parsed` fields are nullable because `duc info` output may vary by Duc version.

### `GET /api/children`

Query:

- `path` required
- `levels` optional, default `1`
- `sort` optional, only `sizeDesc` and `nameAsc`; default `sizeDesc`
- `minSize` optional, falls back to `DEFAULT_MIN_SIZE`

Child schema:

```json
{
  "name": "var",
  "path": "/scan/root/var",
  "sizeBytes": 12884901888,
  "humanSize": "12.0 GB",
  "type": "directory",
  "percentOfParent": 42.7,
  "hasChildren": true,
  "children": []
}
```

Response shape:

```json
{
  "path": "/scan/root",
  "levels": 1,
  "sort": "sizeDesc",
  "appliedMinSize": null,
  "truncated": false,
  "children": []
}
```

Rules:

- `children` is omitted unless `levels > 1`.
- `hasChildren` is `true` only for directories; it means expandable, not preloaded.
- `percentOfParent` is calculated from the requested directory total.

### `GET /api/tree`

Disabled by default. If enabled, response shape mirrors `children` but includes subtree metadata:

```json
{
  "path": "/scan/root/var",
  "source": "duc-json",
  "levels": 2,
  "nodeCount": 37,
  "truncated": false,
  "children": []
}
```

## Chosen safety defaults

Freeze these defaults in `packages/config` and document them in README:

- Duc command timeout: `5000ms` per process
- Recursive request wall-clock budget: `15000ms`
- `/api/children` default `levels=1`
- `/api/children` max `levels=4`
- `/api/tree` feature flag: disabled by default
- `/api/tree` max `levels=2` when enabled
- Max children returned per directory listing: `500`
- Max recursive node count for `/api/children`: `2000`
- Max node count for `/api/tree`: `200`
- Max serialized response size target: `1 MiB` for `/api/children`, `512 KiB` for `/api/tree`
- Global Duc process concurrency: `4`
- Recursive internal concurrency: `2`
- Path safety: only canonical paths at or below `DUC_ROOT`; reject encoded traversal, null bytes, and empty path
- Sorting default: size descending
- `DEFAULT_MIN_SIZE`: optional env override; otherwise no size filter

When limits are exceeded, return `413` for payload limits, `422` for invalid query values, `403` for out-of-root paths, and `504` for Duc timeout.

## Key tradeoffs and alternatives

- Monorepo vs separate repos: choose monorepo because contracts, fixtures, Docker assets, and integration tests are tightly coupled; a split repo adds ceremony without delivery benefit.
- Fastify-serving-static vs separate web container: choose one container for production simplicity and fewer moving parts; a separate web container is unnecessary here.
- `duc ls` recursion by repeated calls vs `duc json` for nested browse: choose repeated `duc ls` for normal browsing because it aligns with the brief and keeps payloads bounded.
- TanStack Query vs custom fetch state: choose TanStack Query because caching, retries, cancellation, and stale/loading state are useful immediately and reduce custom state bugs.
- Optional `/api/tree`: keep endpoint present in contract but off by default so delegates can implement it without making the main UX depend on it.

## Risks, dependencies, and open questions

- Duc output format may vary slightly by version; parser tests must pin against the containerized Duc version used in Docker images.
- Very large directories can still create expensive recursive expansions; the frozen limits are required, not optional.
- `duc info` parseability is version-sensitive; preserve `raw` output even if structured parsing is partial.
- The product depends on a working `duc` binary inside the image; Docker build must verify binary presence.
- Keyboard navigation and chart interaction need deliberate accessibility work; do not leave them as polish-only items.

## Test approach

### Unit and contract tests

- `packages/config`: env parsing and default freezing
- `apps/api`: path policy, Duc output parsing, error mapping, limit enforcement
- `packages/contracts`: schema validation snapshots
- `apps/web`: component behavior for breadcrumbs, filtering, view toggle, and keyboard navigation

### Docker integration tests

Run integration tests only against containers.

- `docker/compose.integration.yml` starts:
  - a fixture scanner container with real `duc`
  - the `pretty-duc` container under test
  - a test runner container
- The fixture scanner indexes `tests/fixtures/fs` into shared `duc_database` volume before app assertions run.
- API integration assertions cover health, missing DB behavior, children listing, recursive limits, invalid path rejection, timeout handling, and proof that normal browse path invokes `duc ls` semantics.
- UI integration uses Playwright in the test runner container to verify root load, breadcrumb navigation, treemap update, table filtering, theme toggle, copy-path control, largest-items panel, and sunburst toggle.

### Definition of passing

- `bun test` covers unit/contract suites.
- `docker compose -f docker/compose.integration.yml up --build --abort-on-container-exit --exit-code-from test` is the authoritative integration gate.

## Phased implementation plan

1. Bootstrap workspace, shared config/contracts, and Docker base image with `duc` installed.
2. Implement API skeleton, env validation, health/info endpoints, and common error model.
3. Implement `duc ls` parsing, `/api/children`, recursive expansion, and safety limits.
4. Implement explorer UI shell against frozen contracts: breadcrumbs, table, treemap, theme, search, largest-items panel.
5. Add sunburst toggle, keyboard navigation, refresh/copy-path controls, and responsive layout hardening.
6. Implement guarded `/api/tree` behind feature flag.
7. Add README, Compose example, screenshots, and Docker integration tests.

## Clear recommendation

Proceed with a bun workspace monorepo containing one Fastify app, one React app, and shared contracts/config packages. Make `/api/children` backed exclusively by `duc ls` the primary browsing contract, keep `/api/tree` optional and disabled by default, and enforce the frozen limits above in code, tests, and documentation from day one.

## Recommended next steps

- Create the workspace and package boundaries exactly as defined here before any feature code.
- Implement and publish `packages/contracts` first so backend and frontend can develop in parallel.
- Build the Docker integration harness early, because Duc version behavior and parser assumptions are the main architectural risk.
