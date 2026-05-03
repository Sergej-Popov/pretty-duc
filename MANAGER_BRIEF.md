# Pretty Duc - Canonical Execution Brief

## Objective

Deliver Pretty Duc as a complete, production-runnable Dockerized service that provides a modern browser UI and JSON API for browsing Duc disk usage data from a shared Duc database, without direct database parsing and without normal-path use of `duc json`.

This document freezes scope and acceptance expectations for downstream architecture, implementation, test, and documentation work.

## Source Of Truth And Scope Intent

- Source brief: `brief.md`
- The original nice-to-haves are required in this delivery.
- The requested deliverable is the full service package: app, containerization, tests, and README.
- Build application code only after aligning to this brief; do not expand scope beyond it unless required to satisfy explicit acceptance criteria.

## Frozen Product Scope

### In Scope

- Backend HTTP API for Duc-backed browsing and service health.
- Frontend web UI for remote browsing of disk usage data.
- Dockerized deployment that runs separately from the Duc scanning service.
- Docker Compose example showing Pretty Duc alongside a Duc scanner service.
- Test coverage including integration tests that run in Docker.
- README with setup, API docs, screenshots, and security notes.

### Non-Goals

- No direct parsing of the Duc database format.
- No arbitrary command execution or arbitrary Duc argument passthrough.
- No requirement to implement write, mutation, or filesystem management actions.
- No requirement for auth inside the app itself beyond documentation for reverse proxy/basic auth.

## Frozen Stack

Preserve the source brief stack suggestions unless blocked by a compelling implementation reason.

- Backend: Node.js + TypeScript + Fastify
- Frontend: React + Vite + TypeScript
- UI library: Mantine
- Visualization: Apache ECharts treemap and sunburst
- Package/runtime tooling: bun, not npm
- Containerization: Docker
- Duc integration: bundled or otherwise available `duc` binary invoked by the service

Any deviation requires explicit justification in implementation documentation.

## Deployment Model

- `pretty-duc` runs as a separate container from the Duc scanning service.
- `pretty-duc` mounts the Duc database volume read-only where possible.
- `pretty-duc` does not require direct host filesystem access.
- `pretty-duc` reads the database from `DUC_DATABASE` and exposes paths under `DUC_ROOT`.
- `pretty-duc` uses the `duc` CLI as the only integration layer to the indexed data.

## Required Configuration

Support these environment variables:

- `DUC_DATABASE` default `/database/duc.db`
- `DUC_ROOT` default `/scan/root`
- `PORT` default `3000`
- `DUC_BIN` default `duc`
- `DEFAULT_MIN_SIZE` optional, unset by default

Application behavior must be documented for missing or invalid configuration.

## Duc Integration Rules

- Use `duc ls -d <db> -F <path>` for normal browsing.
- Do not use `duc json` for normal browsing or large roots.
- `duc json` is allowed only for small, explicit subtree use via the tree endpoint and only when guarded by limits.
- Use `execFile` or equivalent argument-safe process execution; never shell interpolation.
- Parse `duc ls` output into frontend-friendly JSON.
- Use `-F` classification output to detect directories from trailing `/`.

## Required API Surface

### `GET /api/health`

Purpose: return service and database status.

Minimum response fields:

- `ok`
- `ducAvailable`
- `databaseReadable`
- `database`
- `root`

### `GET /api/info`

Purpose: return parsed or raw metadata from:

```bash
duc info -d /database/duc.db
```

Minimum response fields:

- `database`
- `raw` and/or documented parsed metadata fields

### `GET /api/children?path=/scan/root`

Purpose: list immediate children for the requested path.

Required behavior:

- Validate the requested path is equal to or below `DUC_ROOT`.
- Reject traversal attempts and out-of-scope paths.
- Return only immediate children, not recursive dumps.
- Sort by size descending by default unless an explicit documented override is implemented.
- Return structured child objects containing at least:
  - `name`
  - `path`
  - `sizeBytes`
  - `humanSize`
  - `type` (`directory` or `file`)

### `GET /api/children?path=/scan/root&levels=3`

Purpose: return nested children to the requested depth.

Required behavior:

- Support recursive child expansion by repeatedly calling `duc ls` or an equivalently safe approach.
- Preserve the same child schema at every level.
- Enforce sensible limits to prevent runaway execution or oversized responses.

### `GET /api/tree?path=/scan/root/var`

Purpose: optional small-subtree expansion endpoint.

Required behavior:

- Disabled by default or guarded by explicit size/depth limits.
- If implemented with `duc json`, use it only for small explicit subtrees.
- Return clear errors when limits prevent expansion.

## Backend Safety And Error Handling

Required constraints:

- Validate paths with `path.resolve` or equivalent canonicalization.
- Only allow paths equal to or below `DUC_ROOT`.
- Do not allow arbitrary Duc flags from clients.
- Apply timeouts to Duc commands.
- Limit response size and recursive depth.
- Return useful errors for:
  - missing Duc binary
  - missing database
  - unreadable database
  - path not indexed
  - invalid path
  - command timeout

## Required UI

The UI must support remote browser access and present a modern WinDirStat-like browsing experience.

Required features:

- Current path display
- Breadcrumb navigation
- Directory/file table
- Treemap visualization
- Click-to-drill-into-directory behavior
- Up/back navigation
- Size and percentage display relative to current directory
- Default sort by size descending
- Human-readable sizes using `B`, `KB`, `MB`, `GB`, `TB`
- Loading states
- Error states
- Responsive layout for desktop and mobile

## Nice-To-Haves Now Required

Treat all of the following as required scope for this delivery:

- Search/filter within the current directory view
- Sunburst visualization toggle
- Dark mode
- Copy path button
- Refresh button
- Largest-items panel
- Keyboard navigation
- Reverse proxy/basic auth documentation
- Docker Compose example including `duc-service`

## Docker And Runtime Deliverables

Required deliverables:

- Dockerfile for Pretty Duc
- Working container image that includes access to the `duc` binary
- Compose example matching the source brief intent:
  - separate `duc` service
  - shared `duc_database` volume
  - `pretty-duc` mounted read-only to the database volume
  - exposed app port
- `docker compose up` must start the full stack successfully

## Documentation Deliverables

README must include:

- What Pretty Duc is and how it integrates with Duc
- Local/build/run instructions using bun and Docker
- Required environment variables
- Docker Compose usage
- API documentation for all implemented endpoints
- Security notes, including path validation and reverse proxy/basic auth guidance
- Screenshots of the UI
- Testing instructions

## Testing Expectations

Minimum test obligations:

- Integration tests that run in Docker containers
- Coverage of health behavior, database availability behavior, and children listing behavior
- Validation that browsing uses `duc ls` rather than direct DB parsing
- Validation of path safety and command execution safety
- UI-level verification sufficient to prove core navigation and visualization behavior, either via automated tests or a documented test strategy backed by implementation tests

## Definition Of Done

The work is done only when all of the following are true:

- Docker Compose starts both the Duc scanner service and Pretty Duc.
- Duc scanning creates or updates `/database/duc.db`.
- Pretty Duc starts without direct host filesystem access.
- `/api/health` reports healthy state when Duc and the database are available.
- `/api/children?path=/scan/root` returns parsed immediate children.
- The UI loads the configured root path and supports folder browsing.
- The treemap updates correctly when navigating.
- Normal browsing uses `duc ls`, not `duc json`.
- The service never parses the Duc database directly.
- Shell injection risk is prevented by process invocation design.
- All now-required nice-to-have features are implemented.
- README includes setup, API docs, screenshots, and security notes.
- Integration tests run in Docker and pass.

## Implementation Guidance For Delegates

- Prefer simple, observable behavior over speculative optimization.
- Keep API responses stable and explicit; do not return unstructured CLI output except where intentionally documented.
- Choose conservative defaults for recursion, timeout, and response limits.
- If a brief detail is ambiguous, implement the smallest behavior that satisfies both the source brief and this document, then document the choice.

## Open Questions

None blocking. The source brief leaves recursion and tree endpoint limits unspecified; implementation delegates must define explicit defaults that preserve responsiveness and safety, and document them in README and code-level configuration.
