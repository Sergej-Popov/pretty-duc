# Pretty Duc — Implementation Brief

## Goal

Build **Pretty Duc**, a modern web UI and API for [Duc](https://github.com/zevv/duc).

Pretty Duc runs as a **separate Docker service** alongside an existing Duc scanner/container. It reads the shared Duc database volume and uses the `duc` CLI as the integration layer.

## Important Duc integration decision

Do **not** use `duc json` for normal browsing.

`duc json` dumps the full recursive subtree for the requested path, which becomes massive for roots such as `/scan/root`.

Use:

```bash
duc ls -d /database/duc.db -F /scan/root

for lazy directory browsing.

-F is useful because it classifies entries, for example appending / to directories.

Architecture
duc-service
  - scans mounted filesystem
  - writes Duc database to shared volume

pretty-duc
  - mounts Duc database volume read-only
  - includes duc binary
  - exposes web UI
  - exposes JSON API
  - calls `duc ls` for current-path children
  - transforms output into frontend-friendly JSON
  - renders visual directory explorer
  

# Core requirements
Web UI for browsing Duc disk usage data
HTTP API for programmatic access
Runs in Docker
Runs separately from the Duc scanning service
Reads Duc database from a mounted volume, preferably read-only
Uses duc ls for normal browsing
Avoids duc json for large roots
Does not parse the Duc database directly
Supports remote browser access
Visualises directory and file sizes in a modern WinDirStat-like way


# Suggested stack
Backend: Node.js + TypeScript + Fastify
Frontend: React + Vite + TypeScript
Visualisation: Apache ECharts treemap and/or sunburst
UI: Mantine
Container: Docker
Use bun, not npm

# Environment variables
Variable	Default	Purpose
DUC_DATABASE	/database/duc.db	Path to Duc DB
DUC_ROOT	/scan/root	Root path exposed by Pretty Duc
PORT	3000	HTTP server port
DUC_BIN	duc	Duc executable path
DEFAULT_MIN_SIZE	unset	Optional minimum size filter


# API requirements
GET /api/health

Returns service and DB status.

Example response:

{
  "ok": true,
  "ducAvailable": true,
  "databaseReadable": true,
  "database": "/database/duc.db",
  "root": "/scan/root"
}
GET /api/info

Runs:

duc info -d /database/duc.db

Returns parsed or raw Duc database metadata.

Example response:

{
  "database": "/database/duc.db",
  "raw": "..."
}
GET /api/children?path=/scan/root

Lists immediate children for a path.

Backend command:

duc ls -d /database/duc.db -F /scan/root

Rules:

Use execFile, never shell interpolation
Validate that path is under DUC_ROOT
Reject traversal attempts
Parse duc ls output into structured JSON
Use -F so directories can be detected from trailing /
Sort children by size descending unless caller requests otherwise
Return only immediate children, not recursive dumps

Example response:

{
  "path": "/scan/root",
  "children": [
    {
      "name": "var",
      "path": "/scan/root/var",
      "sizeBytes": 12884901888,
      "humanSize": "12.0 GB",
      "type": "directory"
    },
    {
      "name": "home",
      "path": "/scan/root/home",
      "sizeBytes": 8589934592,
      "humanSize": "8.0 GB",
      "type": "directory"
    }
  ]
}


GET /api/children?path=/scan/root&levels=3
Lists immediate children for a path 3 levels deep


{
  "path": "/scan/root",
  "children": [
    {
      "name": "var",
      "path": "/scan/root/var",
      "sizeBytes": 12884901888,
      "humanSize": "12.0 GB",
      "type": "directory",
      "children": [
        {
        "name": "var",
        "path": "/scan/root/var",
        "sizeBytes": 12884901888,
        "humanSize": "12.0 GB",
        "type": "directory",
        "children": [
            {
            "name": "var",
            "path": "/scan/root/var",
            "sizeBytes": 12884901888,
            "humanSize": "12.0 GB",
            "type": "directory"
            }
        ]
        }
    ]
    }
  ]
}

For this, will need to call duc ls multiple times recursively
Or alternatively with -R command, but parsing becomes more complex

GET /api/tree?path=/scan/root/var

May use duc json only for small, explicit subtrees.

Rules:

Disabled by default or guarded by size/depth limits

# Backend safety
Validate paths with path.resolve
Only allow paths equal to or below DUC_ROOT
Do not allow arbitrary Duc arguments from the client
Apply timeout to Duc commands
Limit response size
Return useful errors for:
    missing Duc binary
    missing DB
    unreadable DB
    path not indexed
    command timeout

# UI requirements
Show current path
Breadcrumb navigation
Directory/file table
Treemap visualisation
Click directory to drill down
Up/back navigation
Show size and percentage of current directory
Sort by size descending
Human-readable sizes: B, KB, MB, GB, TB
Loading state
Error state
Responsive layout

# Nice-to-have
Search/filter current directory
Sunburst toggle
Dark mode
Copy path button
Refresh button
“largest items” panel
Keyboard navigation
Reverse proxy/basic auth documentation
Docker Compose example with duc-service#


# Docker Compose target
services:
  duc:
    image: mkoestler/duc-service
    restart: unless-stopped
    environment:
      SCHEDULE: "0 3 * * *"
    volumes:
      - /:/scan/root:ro
      - duc_database:/database

  pretty-duc:
    build: .
    restart: unless-stopped
    ports:
      - "8081:3000"
    environment:
      DUC_DATABASE: /database/duc.db
      DUC_ROOT: /scan/root
      PORT: 3000
    volumes:
      - duc_database:/database:ro

volumes:
  duc_database:



# Acceptance criteria
docker compose up starts both services
Duc scan creates or updates /database/duc.db
Pretty Duc starts without direct host filesystem access
/api/health reports healthy state
/api/children?path=/scan/root returns parsed children
UI loads /scan/root
User can browse folders visually
Treemap updates when navigating
Backend uses duc ls, not duc json, for browsing
No direct DB parsing
No shell injection risk
README includes setup, API docs, screenshots, and security notes


# Testing
Must have integration tests that run in docker container.