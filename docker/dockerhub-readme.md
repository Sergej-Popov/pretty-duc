# Pretty Duc

Web UI for exploring disk usage. Point it at a [Duc](https://github.com/zevv/duc) database and browse with treemaps, sunbursts, flame graphs, filterable tables, and keyboard-driven navigation.

[📖 Source & full docs](https://github.com/Sergej-Popov/pretty-duc)

This project was built entirely with AI tools:
- OpenCode + GPT 5.4
- Gemini CLI + 3.1 Pro
- OpenCode + Ollama Cloud + Minimax M2.7
- OpenCode Go + DeepSeek V4 Pro

## Quick start

Standalone (pre-indexed database):

```
docker run -p 3000:3000 -v ./duc.db:/database/duc.db:ro sergejpopov/pretty-duc
```

With a scanner:

```yaml
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
    image: sergejpopov/pretty-duc:latest
    restart: unless-stopped
    ports:
      - "8081:3000"
    environment:
      DUC_DATABASE: /database/duc.db
      DUC_ROOT: /scan/root
    volumes:
      - duc_database:/database:ro

volumes:
  duc_database:
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DUC_DATABASE` | `/database/duc.db` | Path to Duc database |
| `DUC_ROOT` | `/scan/root` | Root path scanned by Duc |
| `PORT` | `3000` | HTTP server port |
