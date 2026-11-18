# KesslerX Raspberry Pi Zero W Ground Station Gateway (`KX-RPI-ZERO-GS-001`)

Acts as the **sole physical ground station** bridging the smartphone satellite simulator (`PHONE-SATELLITE-001`) to the KesslerX backend (`https://kesslerx-backend.onrender.com`):

```text
Phone motion sensors --> Raspberry Pi Zero W (KX-RPI-ZERO-GS-001) --> KesslerX backend --> Laptop dashboard
```

- **Hardware Target**: Raspberry Pi Zero W (`armv6l`, 426 MiB RAM, Raspberry Pi OS Trixie / Debian 13, Python 3.13 stdlib + SQLite `3.46+`).
- **The Raspberry Pi Zero W is the only ground station.**
- **The phone is the simulated satellite and telemetry source.**
- **The laptop is only the KesslerX mission-control display.**
- Zero compiled ARMv6 C extensions required — runs purely on Python 3 standard library (`http.server`, `sqlite3`, `socket`, `ssl`, `urllib`).

## Configuration Defaults
Configured via `/etc/kesslerx/ground-station.env`:
- `GROUND_STATION_ID=KX-RPI-ZERO-GS-001`
- `HARDWARE_MODEL=Raspberry Pi Zero W`
- `KESSLERX_BACKEND_URL=https://kesslerx-backend.onrender.com`
- `MAX_MEMORY_QUEUE=100`
- `MAX_SQLITE_ROWS=5000`
- `TELEMETRY_RATE_HZ=2`
- `FORWARD_BATCH_SIZE=10`
- `HTTP_TIMEOUT_SECONDS=10`
- `MAX_RETRY_SECONDS=60`
- `HEALTH_CACHE_SECONDS=10`

## Endpoints Provided by `KX-RPI-ZERO-GS-001`
- `GET /` — Mobile phone satellite simulator web UI (`SIMULATED SATELLITE — NOT A REAL SPACECRAFT`)
- `GET /health` — Non-blocking cached gateway health, `hardware_model`, `queue_length`, `sqlite_rows`, `latest_received_sequence`, `latest_forwarded_sequence`, `backend_connected`, `uptime_seconds`, and eviction `warnings`
- `GET /satellite` — Newest valid phone satellite telemetry immediately accessible even under queue load
- `POST /telemetry` — Validates telemetry, attaches UTC `received_at`, `ground_station_id`, and `hardware_model`, buffers cleanly to WAL SQLite, and forwards with exponential backoff
- `GET /telemetry/history` — Bounded recent SQLite packet history
- `WS /ws/phone` — Pure-Python RFC 6455 WebSocket listener (HTTP `POST /telemetry` fallback stays active simultaneously)

## Run Tests
```bash
python3 -m unittest discover -s raspberry_pi_gateway/tests -v
```
