# KesslerX Raspberry Pi 3 Ground Station Gateway (`KX-RPI3-GS-001`)

Acts as the **sole physical ground station** between the smartphone attitude simulator (`PHONE-SATELLITE-001`) and the KesslerX backend.

```text
Phone motion sensors  -->  Raspberry Pi 3 (KX-RPI3-GS-001)  -->  KesslerX backend  -->  KesslerX dashboard
```

- The phone connects **only** to the Raspberry Pi 3 (`http(s)://<RPI_IP>:8765/`).
- The laptop displays the KesslerX dashboard only and never acts as a direct phone receiver.
- Zero external Python dependencies required (Python 3 standard library only).

## Run on Raspberry Pi 3

### Option A: Self-signed HTTPS (Recommended for iOS Safari & Android Chrome sensors)
```bash
python3 gateway.py --backend-url http://<LAPTOP_LAN_IP>:8000 --port 8765 --self-signed
```
Open `https://<RPI_IP>:8765/` on your smartphone, accept the local self-signed warning once, and tap **Start Telemetry** to grant motion/orientation permissions.

### Option B: HTTP (Local testing or Android with insecure-origin flag)
```bash
python3 gateway.py --backend-url http://<LAPTOP_LAN_IP>:8000 --port 8765
```

## Endpoints Provided by `KX-RPI3-GS-001`
- `GET /` — Phone satellite simulator web UI (`SIMULATED SATELLITE — NOT A REAL SPACECRAFT`)
- `GET /health` — Gateway health, queue buffer depth, and forwarding counters
- `POST /telemetry` — Validates phone telemetry, stamps `received_at` and `ground_station_id: "KX-RPI3-GS-001"`, buffers during backend outages, and forwards in FIFO order with exponential backoff.

## Run Tests
```bash
python -m pytest -q raspberry_pi_gateway
```
