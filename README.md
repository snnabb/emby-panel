# EmbyHub

Lightweight Emby reverse proxy management panel with a single-file Go backend and an embedded SPA frontend.

<p align="center">
  <img src="docs/dashboard.png" width="800" alt="Dashboard">
</p>

## Features

- Per-site Emby reverse proxy management
- Optional split upstreams per site: one for web/API, one for playback traffic
- Three UA profiles: `Infuse`, `Web`, `Client`
- Traffic metering, speed limits, and traffic quota enforcement
- WebSocket proxy support
- Real-time dashboard updates over SSE
- Upstream diagnostics, including TLS and proxy status
- JWT authentication with bcrypt password hashing
- Single binary deployment with embedded frontend and SQLite storage

## Project Layout

- Backend: `main.go`
- Frontend: `web/static/`
- Embedded assets: `web/embed.go`
- Database: SQLite via `modernc.org/sqlite`

## Build

```bash
git clone https://github.com/snnabb/emby-panel.git
cd emby-panel
go build -o emby-panel .
```

## Run

```bash
./emby-panel
./emby-panel --port 8080
./emby-panel --db /path/to/emby-panel.db
```

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `9090` | Admin panel listen port |
| `DB_PATH` | `emby-panel.db` | SQLite database path |
| `JWT_SECRET` | Random per process if unset | JWT signing secret. Set this explicitly in production. |

## Operational Notes

- If `JWT_SECRET` is not set, EmbyHub generates a random in-memory signing secret at startup. This is safer than a repo-known default, but all active sessions become invalid after a restart.
- For production or any persistent deployment, set `JWT_SECRET` explicitly so login sessions survive restarts.
- Traffic accounting now stays consistent across periodic flush, stop, delete, and restart flows.
- Site create, toggle, and update operations now return real startup failures and roll back cleanly when a proxy cannot bind or restart.
- Sites can optionally set a separate playback upstream. When configured, streaming paths such as `/Videos/...`, `/Audio/...`, and direct media downloads can route to that playback origin while the panel and regular API calls keep using the main upstream.
- Diagnostics treat a reachable upstream as healthy even when a probe returns `401/403/404`, which avoids false alarms on origins that block `System/Info/Public` but still proxy playback and API traffic correctly.
- TLS diagnostics inspect the HTTPS certificate presented by the configured upstream `target_url`, not the admin panel's own listening port.
- Header diagnostics show the UA / `Client="..."` values that EmbyHub will send upstream. This confirms local proxy configuration, not a remote echo from the origin server.

## Screenshots

<details>
<summary>Site Management</summary>
<img src="docs/sites.png" width="800" alt="Sites">
</details>

<details>
<summary>Diagnostics</summary>
<img src="docs/diagnostics.png" width="800" alt="Diagnostics">
</details>

## Development Notes

- Keep backend changes in `main.go`
- Frontend uses hash routing
- API authentication uses JWT Bearer tokens
- Static assets are embedded into the Go binary

## Verification

```bash
go test ./...
go build -o emby-panel .
```

## License

MIT
