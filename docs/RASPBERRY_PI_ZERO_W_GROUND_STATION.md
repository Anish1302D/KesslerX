# KesslerX Raspberry Pi Zero W Ground Station (`KX-RPI-ZERO-GS-001`)

> **Architecture Roles (Non-Negotiable):**
> - **The Raspberry Pi Zero W is the only ground station.**
> - **The phone is the simulated satellite and telemetry source.**
> - **The laptop is only the KesslerX mission-control display.**

```text
Phone motion sensors
        |
        v  (WS /ws/phone or HTTP POST /telemetry, same-origin on Pi LAN)
Raspberry Pi Zero W Ground Station (KX-RPI-ZERO-GS-001)
  - Validation, UTC receive_at, hardware_model metadata
  - Bounded WAL SQLite buffer & duplicate protection
        |
        v  (HTTPS POST /api/ground-station/telemetry with backoff retry)
KesslerX Backend (https://kesslerx-backend.onrender.com)
        |
        v  (REST + WebSocket /ws/ground-station)
Laptop Browser Running KesslerX Dashboard
```

---

## 1. Verified Hardware & OS Compatibility

Measured directly on the deployment device (`192.168.0.211`):

| Property | Verified Value |
| --- | --- |
| Device | Raspberry Pi Zero W Rev 1.1 |
| Hostname | `anishraspberrypizero` |
| CPU Architecture | `armv6l` (`32`-bit kernel, dpkg `armhf`) |
| Operating System | `Raspbian GNU/Linux 13 (trixie)` / Debian `13.6` |
| Kernel | `6.18.60+rpt-rpi-v6` |
| Memory / Swap | `426 MiB` RAM / `425 MiB` Swap |
| Python | `Python 3.13.5` with built-in SQLite `3.46.1` |

Because `armv6l` is unsupported by many modern prebuilt binary PyPI wheels and Debian Trixie enforces `EXTERNALLY-MANAGED` (`PEP 668`), `gateway.py` runs **100% on the Python 3 standard library** (`http.server`, `socket`, `sqlite3`, `ssl`, `urllib`, `hashlib`, `threading`) without requiring `--break-system-packages` or C extensions.

---

## 2. SSH Connection & Headless Administration

Use headless SSH CLI instead of graphical XRDP sessions (keeps ~165–190 MiB free RAM protected):

```bash
ssh anish@192.168.0.211
```

If an OS re-flash changes the host key, verify the local Pi fingerprint before clearing old keys:

```bash
# On the Pi:
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
# On the laptop after verifying:
ssh-keygen -R 192.168.0.211
```

Never hardcode passwords or commit keys/credentials.

---

## 3. Gateway Deployment & Environment Configuration

Deployment directory on the Pi: `/home/anish/kesslerx-ground-station/`

```text
/home/anish/kesslerx-ground-station/
├── gateway.py
├── static/phone_simulator.html
├── tests/test_gateway.py
├── systemd/kesslerx-ground-station.service
├── data/telemetry_buffer.db
└── .certs/
```

Protected environment file outside the Git repository (`chmod 600`):
- Active user-service config: `~/.config/kesslerx/ground-station.env`
- System-service template target: `/etc/kesslerx/ground-station.env`

Key variables (no secrets committed):

```env
GROUND_STATION_ID=KX-RPI-ZERO-GS-001
HARDWARE_MODEL=Raspberry Pi Zero W
KESSLERX_BACKEND_URL=https://kesslerx-backend.onrender.com
RPI_HOST=0.0.0.0
RPI_PORT=8765
RPI_HTTPS_PORT=8443
MAX_MEMORY_QUEUE=100
MAX_SQLITE_ROWS=5000
SQLITE_DB_PATH=/home/anish/kesslerx-ground-station/data/telemetry_buffer.db
TELEMETRY_RATE_HZ=2
FORWARD_BATCH_SIZE=10
HTTP_TIMEOUT_SECONDS=10
MAX_RETRY_SECONDS=60
HEALTH_CACHE_SECONDS=10
```

---

## 4. Systemd Service & Operations

User lingering (`loginctl show-user anish` -> `Linger=yes`) runs the gateway cleanly as non-root user `anish` starting at boot (`~/.config/systemd/user/kesslerx-ground-station.service`), with memory limits (`MemoryHigh=64M`, `MemoryMax=96M`) and graceful `SIGINT` shutdown (`TimeoutStopSec=15`):

```bash
# Status
XDG_RUNTIME_DIR=/run/user/1000 systemctl --user status kesslerx-ground-station --no-pager

# Start / Stop / Restart
XDG_RUNTIME_DIR=/run/user/1000 systemctl --user start kesslerx-ground-station
XDG_RUNTIME_DIR=/run/user/1000 systemctl --user stop kesslerx-ground-station
XDG_RUNTIME_DIR=/run/user/1000 systemctl --user restart kesslerx-ground-station

# Logs
XDG_RUNTIME_DIR=/run/user/1000 journalctl --user -u kesslerx-ground-station -n 100 --no-pager
```

(System-level template `raspberry_pi_gateway/systemd/kesslerx-ground-station.service` is also provided for `/etc/systemd/system/kesslerx-ground-station.service` + `/etc/kesslerx/ground-station.env`.)

---

## 5. Gateway Address, Ports & Health Testing

- **HTTP + WebSocket listener**: `http://192.168.0.211:8765` (`ws://192.168.0.211:8765/ws/phone`)
- **HTTPS + Secure WebSocket listener**: `https://192.168.0.211:8443` (`wss://192.168.0.211:8443/ws/phone`, self-signed certificate with LAN SAN)

Verify locally on Pi and over Wi-Fi from laptop:

```bash
# On Pi:
curl -i http://127.0.0.1:8765/health
curl -s http://127.0.0.1:8765/satellite

# From laptop LAN:
curl -i http://192.168.0.211:8765/health
curl -ki https://192.168.0.211:8443/health
```

---

## 6. Phone Simulator Setup & Telemetry Verification

1. Connect phone, Raspberry Pi Zero W (`192.168.0.211`), and laptop to the same Wi-Fi network.
2. On the smartphone browser, open `https://192.168.0.211:8443/` (recommended for iOS Safari & Android Chrome `DeviceOrientationEvent` / `DeviceMotionEvent` secure context permissions; accept the self-signed LAN warning once) or `http://192.168.0.211:8765/`.
3. Tap **Start Telemetry** and grant motion/orientation permissions.
4. Phone connects **only** to the Pi (`WS /ws/phone` with automatic `POST /telemetry` fallback).
5. Pi stamps `received_at`, `ground_station_id: "KX-RPI-ZERO-GS-001"`, and `hardware_model: "Raspberry Pi Zero W"`, stores to WAL SQLite, and forwards batches to `KESSLERX_BACKEND_URL`.
6. Check laptop KesslerX dashboard (`Ground Station`, `Orbital Map`, `Collision Monitor`) for `PHONE SATELLITE`, roll/pitch/yaw, queue counters, and tilt-driven `DEMO SIMULATION` collision probability.

---

## 7. SQLite Buffering, Offline Recovery & Eviction Policy

- Telemetry is stored in WAL-mode SQLite (`telemetry_queue` table, unique `(session_key, sequence)` index) before upload.
- If the backend is unreachable or returns `5xx`, packets stay buffered (`HTTP 202`) and retry with exponential backoff up to `MAX_RETRY_SECONDS=60`.
- When `MAX_SQLITE_ROWS` (`5000`) is reached, oldest already-forwarded rows are pruned first; if unforwarded backlog hits the limit, oldest pending rows are evicted and `GET /health` surfaces the warning:
  `Telemetry queue limit reached. Oldest buffered records were removed.`
- Duplicate sequence uploads within the same session return `"status": "duplicate"` without re-queuing.
- Because the daemon stops gracefully on `SIGINT`, pending SQLite rows survive service restarts (`systemctl --user restart kesslerx-ground-station`) and flush automatically when backend connectivity returns.

---

## 8. Troubleshooting

* **Render Cold-Start Delays**: Render free-tier web services sleep after inactivity and can take 25–50 seconds on the first `/api/health` or telemetry upload after idle. Wake it cleanly before live judging (`curl https://kesslerx-backend.onrender.com/api/health`), and note `HTTP_TIMEOUT_SECONDS=10` retries smoothly in SQLite without losing packets.
* **Wi-Fi / LAN Reachability**: Confirm laptop and Pi share the `192.168.0.x` subnet (`hostname -I` on Pi, `ipconfig` on Windows) and verify `ping 192.168.0.211` responds before opening port `8765`/`8443`. Do **not** disable firewalls globally or expose the Pi to the public internet.
* **Phone Sensor Values Stuck at 0**: Over plain HTTP on LAN (`http://192.168.0.211:8765/`), mobile browsers block gyroscope/accelerometer APIs because it is not a `Secure Context`. Open `https://192.168.0.211:8443/` instead and accept the LAN certificate.
