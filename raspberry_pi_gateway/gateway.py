#!/usr/bin/env python3
"""
KesslerX Raspberry Pi 3 Ground Station Gateway (KX-RPI3-GS-001)
===============================================================

Runs on the Raspberry Pi 3 to act as the SOLE ground station bridging:
    Phone Motion Sensors  -->  Raspberry Pi 3 (KX-RPI3-GS-001)  -->  KesslerX Backend

Responsibilities:
- Serves the mobile phone simulator UI over HTTP/HTTPS on the local network.
- Receives smartphone orientation & angular velocity packets via POST /telemetry.
- Strictly validates telemetry ranges, types, and identity before accepting.
- Stamps each accepted packet with Pi receive UTC timestamp (received_at) and
  ground_station_id = "KX-RPI3-GS-001".
- Buffers validated packets in FIFO order (with optional JSONL disk persistence)
  during network or KesslerX backend outages, and retries automatically with
  exponential backoff until delivery succeeds.
"""

from __future__ import annotations

import argparse
import http.server
import json
import logging
import math
import os
import shutil
import ssl
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Deque, Dict, List, Optional, Tuple


GROUND_STATION_ID = "KX-RPI3-GS-001"
EXPECTED_DEVICE_ID = "PHONE-SATELLITE-001"
EXPECTED_SATELLITE_NAME = "PHONE SATELLITE"
EXPECTED_SOURCE = "phone_sensor"
EXPECTED_MODE = "simulated"

STATIC_DIR = Path(__file__).resolve().parent / "static"
PHONE_SIMULATOR_HTML = STATIC_DIR / "phone_simulator.html"

logger = logging.getLogger("kx_rpi3_gateway")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _check_finite_number(value: Any, name: str, min_val: float, max_val: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be numeric.")
    num = float(value)
    if not math.isfinite(num):
        raise ValueError(f"{name} must be finite.")
    if num < min_val or num > max_val:
        raise ValueError(f"{name} ({num}) outside valid range [{min_val}, {max_val}].")
    return num


def _parse_iso_timestamp(ts: Any) -> str:
    if not isinstance(ts, str) or not ts.strip():
        raise ValueError("timestamp must be a non-empty ISO-8601 string.")
    normalized = ts.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def validate_and_enrich_phone_packet(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate raw phone telemetry and stamp Raspberry Pi 3 receive metadata.
    Always identifies the ground station as KX-RPI3-GS-001.
    """
    if not isinstance(raw, dict):
        raise ValueError("Telemetry packet must be a JSON object.")

    device_id = raw.get("device_id")
    if device_id != EXPECTED_DEVICE_ID:
        raise ValueError(f"Invalid device_id '{device_id}'; expected '{EXPECTED_DEVICE_ID}'.")

    source = raw.get("source")
    if source != EXPECTED_SOURCE:
        raise ValueError(f"Invalid source '{source}'; expected '{EXPECTED_SOURCE}'.")

    mode = raw.get("mode")
    if mode != EXPECTED_MODE:
        raise ValueError(f"Invalid mode '{mode}'; expected '{EXPECTED_MODE}'.")

    seq = raw.get("sequence")
    if isinstance(seq, bool) or not isinstance(seq, int) or seq < 1:
        raise ValueError("sequence must be an integer >= 1.")

    clean_ts = _parse_iso_timestamp(raw.get("timestamp"))

    orientation = raw.get("orientation")
    if not isinstance(orientation, dict):
        raise ValueError("orientation must be an object containing roll_deg, pitch_deg, and yaw_deg.")
    for axis in ("roll_deg", "pitch_deg", "yaw_deg"):
        if axis not in orientation:
            raise ValueError(f"Missing orientation.{axis}.")

    roll_deg = _check_finite_number(orientation["roll_deg"], "orientation.roll_deg", -180.0, 180.0)
    pitch_deg = _check_finite_number(orientation["pitch_deg"], "orientation.pitch_deg", -180.0, 180.0)
    yaw_deg = _check_finite_number(orientation["yaw_deg"], "orientation.yaw_deg", -360.0, 360.0)

    ang_vel = raw.get("angular_velocity")
    if ang_vel is None:
        clean_ang_vel = {"x_dps": 0.0, "y_dps": 0.0, "z_dps": 0.0}
    else:
        if not isinstance(ang_vel, dict):
            raise ValueError("angular_velocity must be a JSON object.")
        clean_ang_vel = {
            "x_dps": round(_check_finite_number(ang_vel.get("x_dps", 0.0), "angular_velocity.x_dps", -2000.0, 2000.0), 3),
            "y_dps": round(_check_finite_number(ang_vel.get("y_dps", 0.0), "angular_velocity.y_dps", -2000.0, 2000.0), 3),
            "z_dps": round(_check_finite_number(ang_vel.get("z_dps", 0.0), "angular_velocity.z_dps", -2000.0, 2000.0), 3),
        }

    return {
        "device_id": EXPECTED_DEVICE_ID,
        "satellite_name": EXPECTED_SATELLITE_NAME,
        "sequence": seq,
        "timestamp": clean_ts,
        "received_at": _utc_now_iso(),
        "orientation": {
            "roll_deg": round(roll_deg, 2),
            "pitch_deg": round(pitch_deg, 2),
            "yaw_deg": round(yaw_deg, 2),
        },
        "angular_velocity": clean_ang_vel,
        "source": EXPECTED_SOURCE,
        "mode": EXPECTED_MODE,
        "ground_station_id": GROUND_STATION_ID,
    }


def default_http_sender(url: str, packet: Dict[str, Any], timeout_s: float = 5.0) -> Tuple[int, str]:
    """Forward JSON packet to KesslerX backend via Python stdlib urllib."""
    body = json.dumps(packet).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Ground-Station-Id": GROUND_STATION_ID,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")
        return exc.code, err_body


class TelemetryForwarder:
    """
    Thread-safe store-and-forward queue bridging KX-RPI3-GS-001 to KesslerX backend.
    Buffers validated packets during network outage and retries with exponential backoff.
    """

    def __init__(
        self,
        backend_url: str,
        max_buffer_size: int = 1000,
        buffer_file: Optional[Path] = None,
        sender: Optional[Callable[[str, Dict[str, Any], float], Tuple[int, str]]] = None,
        base_backoff_s: float = 1.0,
        max_backoff_s: float = 15.0,
    ) -> None:
        clean_base = backend_url.rstrip("/")
        parsed = urllib.parse.urlparse(clean_base)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError(f"Invalid KesslerX backend URL: {backend_url}")

        self.backend_url = clean_base
        self.telemetry_endpoint = f"{clean_base}/api/ground-station/telemetry"
        self.max_buffer_size = max_buffer_size
        self.buffer_file = buffer_file
        self._sender = sender or default_http_sender
        self.base_backoff_s = base_backoff_s
        self.max_backoff_s = max_backoff_s

        self._queue: Deque[Dict[str, Any]] = deque(maxlen=max_buffer_size)
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._wake_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None

        self.received_count = 0
        self.rejected_count = 0
        self.forwarded_count = 0
        self.retry_attempts = 0
        self.backend_connected = False
        self.last_error: Optional[str] = None
        self.last_forwarded_at: Optional[str] = None

        self._load_disk_buffer()

    def _load_disk_buffer(self) -> None:
        if not self.buffer_file or not self.buffer_file.exists():
            return
        try:
            lines = self.buffer_file.read_text(encoding="utf-8").splitlines()
            for line in lines[-self.max_buffer_size :]:
                line = line.strip()
                if line:
                    self._queue.append(json.loads(line))
        except Exception as exc:
            logger.warning("Failed to reload disk buffer %s: %s", self.buffer_file, exc)

    def _persist_disk_buffer_locked(self) -> None:
        if not self.buffer_file:
            return
        try:
            self.buffer_file.parent.mkdir(parents=True, exist_ok=True)
            serialized = "\n".join(json.dumps(item) for item in self._queue)
            if serialized:
                serialized += "\n"
            self.buffer_file.write_text(serialized, encoding="utf-8")
        except Exception as exc:
            logger.warning("Failed to persist disk buffer %s: %s", self.buffer_file, exc)

    def start(self) -> None:
        if self._worker_thread and self._worker_thread.is_alive():
            return
        self._stop_event.clear()
        self._worker_thread = threading.Thread(
            target=self._retry_loop,
            name="kx-rpi3-forwarder",
            daemon=True,
        )
        self._worker_thread.start()

    def stop(self, timeout_s: float = 2.0) -> None:
        self._stop_event.set()
        self._wake_event.set()
        if self._worker_thread and self._worker_thread.is_alive():
            self._worker_thread.join(timeout=timeout_s)

    def record_rejection(self) -> None:
        with self._lock:
            self.rejected_count += 1

    def enqueue_and_try_forward(self, packet: Dict[str, Any], immediate: bool = True) -> Dict[str, Any]:
        """Queue validated packet and optionally attempt immediate FIFO flush."""
        with self._lock:
            self.received_count += 1
            self._queue.append(packet)
            self._persist_disk_buffer_locked()

        delivered_now = False
        if immediate:
            flushed = self.flush_pending()
            delivered_now = flushed > 0 and self.buffered_count == 0
        else:
            self._wake_event.set()

        return {
            "status": "forwarded" if delivered_now else "buffered",
            "ground_station_id": GROUND_STATION_ID,
            "received_at": packet["received_at"],
            "sequence": packet["sequence"],
            "buffered_count": self.buffered_count,
            "backend_connected": self.backend_connected,
            "last_error": self.last_error,
        }

    @property
    def buffered_count(self) -> int:
        with self._lock:
            return len(self._queue)

    def flush_pending(self, max_batch: Optional[int] = None) -> int:
        """
        Attempt to forward buffered packets in FIFO order.
        Stops immediately on transient backend/network failure and leaves remaining packets queued.
        Drops unrecoverable 4xx packets after logging so poison payloads do not wedge the queue.
        """
        sent = 0
        while True:
            if max_batch is not None and sent >= max_batch:
                break
            with self._lock:
                if not self._queue:
                    break
                next_packet = self._queue[0]

            try:
                status_code, resp_text = self._sender(self.telemetry_endpoint, next_packet, 5.0)
            except Exception as exc:
                with self._lock:
                    self.backend_connected = False
                    self.last_error = str(exc)
                    self.retry_attempts += 1
                self._wake_event.set()
                break

            if 200 <= status_code < 300:
                with self._lock:
                    if self._queue and self._queue[0] is next_packet:
                        self._queue.popleft()
                    elif self._queue:
                        self._queue.popleft()
                    self._persist_disk_buffer_locked()
                    self.forwarded_count += 1
                    self.backend_connected = True
                    self.last_error = None
                    self.last_forwarded_at = _utc_now_iso()
                sent += 1
            elif status_code in (400, 422):
                logger.error("Backend permanently rejected telemetry packet (%s): %s", status_code, resp_text)
                with self._lock:
                    if self._queue:
                        self._queue.popleft()
                    self._persist_disk_buffer_locked()
                    self.rejected_count += 1
                    self.last_error = f"HTTP {status_code}: {resp_text}"
            else:
                with self._lock:
                    self.backend_connected = False
                    self.last_error = f"HTTP {status_code}: {resp_text}"
                    self.retry_attempts += 1
                self._wake_event.set()
                break

        return sent

    def _retry_loop(self) -> None:
        backoff = self.base_backoff_s
        while not self._stop_event.is_set():
            if self.buffered_count > 0:
                self.flush_pending()
                if self.buffered_count == 0:
                    backoff = self.base_backoff_s
                else:
                    self._stop_event.wait(backoff)
                    backoff = min(self.max_backoff_s, backoff * 2.0)
                    continue

            self._wake_event.wait(timeout=self.base_backoff_s)
            self._wake_event.clear()

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "ground_station_id": GROUND_STATION_ID,
                "device_id": EXPECTED_DEVICE_ID,
                "backend_endpoint": self.telemetry_endpoint,
                "backend_connected": self.backend_connected,
                "buffered_count": len(self._queue),
                "received_count": self.received_count,
                "forwarded_count": self.forwarded_count,
                "rejected_count": self.rejected_count,
                "retry_attempts": self.retry_attempts,
                "last_forwarded_at": self.last_forwarded_at,
                "last_error": self.last_error,
            }


def create_gateway_handler(forwarder: TelemetryForwarder, html_path: Path = PHONE_SIMULATOR_HTML):
    """Build HTTP request handler class bound to a TelemetryForwarder instance."""

    class GatewayHTTPHandler(http.server.BaseHTTPRequestHandler):
        server_version = "KesslerX-RPi3-GroundStation/1.0"

        def log_message(self, format: str, *args: Any) -> None:
            logger.info("%s - %s", self.address_string(), format % args)

        def _send_json(self, status_code: int, payload: Dict[str, Any]) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_GET(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path in ("/", "/index.html", "/phone-simulator"):
                if not html_path.exists():
                    self._send_json(404, {"error": f"Phone simulator HTML missing at {html_path}"})
                    return
                content = html_path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(content)
            elif parsed.path == "/health":
                self._send_json(200, forwarder.get_status())
            else:
                self._send_json(404, {"error": "Not found"})

        def do_POST(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path != "/telemetry":
                self._send_json(404, {"error": "Unknown endpoint. Send telemetry only to POST /telemetry."})
                return

            try:
                content_len = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                forwarder.record_rejection()
                self._send_json(400, {"error": "Invalid Content-Length header."})
                return

            if content_len <= 0 or content_len > 65536:
                forwarder.record_rejection()
                self._send_json(400, {"error": "Invalid payload size."})
                return

            raw_bytes = self.rfile.read(content_len)
            try:
                raw_json = json.loads(raw_bytes.decode("utf-8"))
            except Exception as exc:
                forwarder.record_rejection()
                self._send_json(400, {"error": f"Invalid JSON payload: {exc}"})
                return

            try:
                enriched = validate_and_enrich_phone_packet(raw_json)
            except ValueError as exc:
                forwarder.record_rejection()
                self._send_json(422, {"error": str(exc), "ground_station_id": GROUND_STATION_ID})
                return

            result = forwarder.enqueue_and_try_forward(enriched, immediate=True)
            status_code = 200 if result["status"] == "forwarded" else 202
            self._send_json(status_code, result)

    return GatewayHTTPHandler


def ensure_self_signed_cert(cert_dir: Path) -> Tuple[Path, Path]:
    """Generate a self-signed TLS certificate via OpenSSL for iOS/Android sensor permissions."""
    openssl_bin = shutil.which("openssl")
    if not openssl_bin:
        raise RuntimeError("openssl binary is required to auto-generate a self-signed HTTPS certificate.")

    cert_dir.mkdir(parents=True, exist_ok=True)
    cert_file = cert_dir / "rpi3-gateway-cert.pem"
    key_file = cert_dir / "rpi3-gateway-key.pem"

    if cert_file.exists() and key_file.exists():
        return cert_file, key_file

    subprocess.run(
        [
            openssl_bin,
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-keyout",
            str(key_file),
            "-out",
            str(cert_file),
            "-days",
            "365",
            "-nodes",
            "-subj",
            "/CN=KX-RPI3-GS-001",
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return cert_file, key_file


def create_gateway_server(
    host: str,
    port: int,
    forwarder: TelemetryForwarder,
    certfile: Optional[str] = None,
    keyfile: Optional[str] = None,
) -> http.server.ThreadingHTTPServer:
    handler_cls = create_gateway_handler(forwarder)
    httpd = http.server.ThreadingHTTPServer((host, port), handler_cls)
    if certfile and keyfile:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile=certfile, keyfile=keyfile)
        httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    return httpd


def main(argv: Optional[List[str]] = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="KesslerX Raspberry Pi 3 Ground Station Gateway (KX-RPI3-GS-001)")
    parser.add_argument("--host", default=os.getenv("RPI_HOST", "0.0.0.0"), help="Bind host (default 0.0.0.0)")
    parser.add_argument("--port", type=int, default=int(os.getenv("RPI_PORT", "8765")), help="Listen port (default 8765)")
    parser.add_argument(
        "--backend-url",
        default=os.getenv("KESSLERX_BACKEND_URL", "http://127.0.0.1:8000"),
        help="KesslerX backend base URL (e.g. http://<LAPTOP_LAN_IP>:8000)",
    )
    parser.add_argument(
        "--buffer-file",
        default=os.getenv("RPI_BUFFER_FILE", str(Path(__file__).resolve().parent / ".buffer_queue.jsonl")),
        help="Optional JSONL spill file for outage buffering",
    )
    parser.add_argument("--certfile", default=os.getenv("TLS_CERT_FILE"), help="Path to TLS certificate PEM")
    parser.add_argument("--keyfile", default=os.getenv("TLS_KEY_FILE"), help="Path to TLS private key PEM")
    parser.add_argument(
        "--self-signed",
        action="store_true",
        help="Generate and use a self-signed HTTPS cert (recommended for iOS/Android phone motion sensors)",
    )

    args = parser.parse_args(argv)

    certfile = args.certfile
    keyfile = args.keyfile
    if args.self_signed and not (certfile and keyfile):
        cert_path, key_path = ensure_self_signed_cert(Path(__file__).resolve().parent / ".certs")
        certfile, keyfile = str(cert_path), str(key_path)

    buffer_path = Path(args.buffer_file) if args.buffer_file else None
    forwarder = TelemetryForwarder(backend_url=args.backend_url, buffer_file=buffer_path)
    forwarder.start()

    httpd = create_gateway_server(
        host=args.host,
        port=args.port,
        forwarder=forwarder,
        certfile=certfile,
        keyfile=keyfile,
    )

    scheme = "https" if (certfile and keyfile) else "http"
    logger.info("KX-RPI3-GS-001 listening on %s://%s:%s", scheme, args.host, args.port)
    logger.info("Forwarding validated phone telemetry to %s", forwarder.telemetry_endpoint)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down KX-RPI3-GS-001...")
    finally:
        forwarder.stop()
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
