#!/usr/bin/env python3
"""
KesslerX Raspberry Pi Zero W Ground Station Gateway (KX-RPI-ZERO-GS-001)
=========================================================================

Lightweight pure-Python gateway optimized for Raspberry Pi Zero W (armv6l, 426 MiB RAM,
Raspberry Pi OS Trixie). Acts as the SOLE physical ground station bridging:
    Phone Motion Sensors --> Raspberry Pi Zero W (KX-RPI-ZERO-GS-001) --> KesslerX Backend

Key Properties:
- Zero external runtime dependencies (Python 3 standard library + built-in sqlite3 only).
- Bounded in-memory queue (MAX_MEMORY_QUEUE) and bounded WAL SQLite persistence (MAX_SQLITE_ROWS).
- Primary WS /ws/phone transport (RFC 6455) with seamless HTTP POST /telemetry fallback.
- Preserves GET /health, GET /satellite, POST /telemetry, GET /telemetry/history, WS /ws/phone.
- Maintains crash recovery, duplicate sequence protection, throttling, and exponential backoff.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import http.server
import ipaddress
import json
import logging
import math
import os
import platform
import shutil
import socket
import sqlite3
import ssl
import struct
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


DEFAULT_GROUND_STATION_ID = "KX-RPI-ZERO-GS-001"
LEGACY_GROUND_STATION_IDS = ("KX-RPI3-GS-001",)
DEFAULT_HARDWARE_MODEL = "Raspberry Pi Zero W"
EXPECTED_DEVICE_ID = "PHONE-SATELLITE-001"
EXPECTED_SATELLITE_NAME = "PHONE SATELLITE"
EXPECTED_SOURCE = "phone_sensor"
EXPECTED_MODE = "simulated"
QUEUE_EVICTION_WARNING = "Telemetry queue limit reached. Oldest buffered records were removed."
_WS_MAGIC_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

STATIC_DIR = Path(__file__).resolve().parent / "static"
PHONE_SIMULATOR_HTML = STATIC_DIR / "phone_simulator.html"

logger = logging.getLogger("kx_rpi_zero_gateway")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    return int(raw.strip())


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    return float(raw.strip())


def load_gateway_config() -> Dict[str, Any]:
    """Load explicit Raspberry Pi Zero W gateway configuration from environment variables."""
    default_dir = Path(__file__).resolve().parent
    default_db = default_dir / "data" / "telemetry_buffer.db"
    sqlite_path = os.getenv("SQLITE_DB_PATH") or os.getenv("RPI_SQLITE_DB") or str(default_db)

    return {
        "ground_station_id": os.getenv("GROUND_STATION_ID", DEFAULT_GROUND_STATION_ID).strip() or DEFAULT_GROUND_STATION_ID,
        "hardware_model": os.getenv("HARDWARE_MODEL", DEFAULT_HARDWARE_MODEL).strip() or DEFAULT_HARDWARE_MODEL,
        "max_memory_queue": max(1, _env_int("MAX_MEMORY_QUEUE", 100)),
        "max_sqlite_rows": max(1, _env_int("MAX_SQLITE_ROWS", 5000)),
        "telemetry_rate_hz": max(0.0, _env_float("TELEMETRY_RATE_HZ", 2.0)),
        "forward_batch_size": max(1, _env_int("FORWARD_BATCH_SIZE", 10)),
        "http_timeout_seconds": max(1.0, _env_float("HTTP_TIMEOUT_SECONDS", 10.0)),
        "max_retry_seconds": max(1.0, _env_float("MAX_RETRY_SECONDS", 60.0)),
        "health_cache_seconds": max(0.0, _env_float("HEALTH_CACHE_SECONDS", 10.0)),
        "sqlite_db_path": sqlite_path,
        "host": os.getenv("RPI_HOST", "0.0.0.0"),
        "port": _env_int("RPI_PORT", 8765),
        "https_port": _env_int("RPI_HTTPS_PORT", 0),
        "backend_url": os.getenv("KESSLERX_BACKEND_URL", "http://127.0.0.1:8000"),
    }


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


def validate_and_enrich_phone_packet(
    raw: Dict[str, Any],
    ground_station_id: Optional[str] = None,
    hardware_model: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Validate raw phone telemetry and stamp Raspberry Pi Zero W receive metadata.
    Accepts packets configured for KX-RPI-ZERO-GS-001 or legacy KX-RPI3-GS-001 during migration,
    and always attaches ground_station_id and hardware_model metadata.
    """
    if not isinstance(raw, dict):
        raise ValueError("Telemetry packet must be a JSON object.")

    gs_id = ground_station_id or os.getenv("GROUND_STATION_ID", DEFAULT_GROUND_STATION_ID)
    hw_model = hardware_model or os.getenv("HARDWARE_MODEL", DEFAULT_HARDWARE_MODEL)

    device_id = raw.get("device_id")
    if device_id != EXPECTED_DEVICE_ID:
        raise ValueError(f"Invalid device_id '{device_id}'; expected '{EXPECTED_DEVICE_ID}'.")

    incoming_gs = raw.get("ground_station_id")
    accepted_incoming = {gs_id, DEFAULT_GROUND_STATION_ID, *LEGACY_GROUND_STATION_IDS}
    if incoming_gs is not None and incoming_gs not in accepted_incoming:
        raise ValueError(
            f"Invalid ground_station_id '{incoming_gs}'; expected '{gs_id}'."
        )

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

    session_id = raw.get("session_id")
    clean_session = str(session_id).strip()[:64] if isinstance(session_id, str) and session_id.strip() else "default"

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
        "ground_station_id": gs_id,
        "hardware_model": hw_model,
        "_session_id": clean_session,
    }


def _strip_internal_fields(packet: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in packet.items() if not k.startswith("_")}


def default_http_sender(url: str, packet: Dict[str, Any], timeout_s: float = 10.0) -> Tuple[int, str]:
    """Forward clean JSON packet to KesslerX backend via Python stdlib urllib."""
    outgoing = _strip_internal_fields(packet)
    body = json.dumps(outgoing, separators=(",", ":")).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": "KesslerX-RPiZero-Gateway/2.0",
            "X-Ground-Station-Id": str(outgoing.get("ground_station_id", DEFAULT_GROUND_STATION_ID)),
            "X-Hardware-Model": str(outgoing.get("hardware_model", DEFAULT_HARDWARE_MODEL)),
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
    Thread-safe, resource-bounded SQLite store-and-forward gateway bridging
    KX-RPI-ZERO-GS-001 (Raspberry Pi Zero W) to the KesslerX backend.
    """

    def __init__(
        self,
        backend_url: str,
        max_buffer_size: Optional[int] = None,
        max_memory_queue: Optional[int] = None,
        max_sqlite_rows: Optional[int] = None,
        telemetry_rate_hz: Optional[float] = None,
        forward_batch_size: Optional[int] = None,
        http_timeout_seconds: Optional[float] = None,
        health_cache_seconds: Optional[float] = None,
        buffer_file: Optional[Path] = None,
        sqlite_path: Optional[Path] = None,
        ground_station_id: Optional[str] = None,
        hardware_model: Optional[str] = None,
        sender: Optional[Callable[[str, Dict[str, Any], float], Tuple[int, str]]] = None,
        base_backoff_s: float = 1.0,
        max_backoff_s: Optional[float] = None,
    ) -> None:
        cfg = load_gateway_config()
        clean_base = backend_url.rstrip("/")
        parsed = urllib.parse.urlparse(clean_base)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError(f"Invalid KesslerX backend URL: {backend_url}")

        self.backend_url = clean_base
        self.telemetry_endpoint = f"{clean_base}/api/ground-station/telemetry"
        self.ground_station_id = ground_station_id or cfg["ground_station_id"]
        self.hardware_model = hardware_model or cfg["hardware_model"]
        self.architecture = platform.machine() or "unknown"

        mem_cap = max_memory_queue if max_memory_queue is not None else (
            max_buffer_size if max_buffer_size is not None else cfg["max_memory_queue"]
        )
        self.max_memory_queue = max(1, int(mem_cap))
        self.max_sqlite_rows = max(1, int(max_sqlite_rows if max_sqlite_rows is not None else (
            max_buffer_size if max_buffer_size is not None else cfg["max_sqlite_rows"]
        )))
        self.max_buffer_size = self.max_sqlite_rows
        self.telemetry_rate_hz = float(cfg["telemetry_rate_hz"] if telemetry_rate_hz is None else telemetry_rate_hz)
        self.forward_batch_size = max(1, int(forward_batch_size if forward_batch_size is not None else cfg["forward_batch_size"]))
        self.http_timeout_seconds = max(1.0, float(http_timeout_seconds if http_timeout_seconds is not None else cfg["http_timeout_seconds"]))
        self.health_cache_seconds = max(0.0, float(health_cache_seconds if health_cache_seconds is not None else cfg["health_cache_seconds"]))
        self.base_backoff_s = max(0.05, float(base_backoff_s))
        self.max_backoff_s = max(self.base_backoff_s, float(cfg["max_retry_seconds"] if max_backoff_s is None else max_backoff_s))

        if sqlite_path is not None:
            self.sqlite_path = Path(sqlite_path)
        elif buffer_file is not None:
            # Map legacy buffer_file path to a colocated SQLite DB cleanly
            bf = Path(buffer_file)
            self.sqlite_path = bf if bf.suffix == ".db" else bf.with_suffix(".db")
        else:
            self.sqlite_path = Path(cfg["sqlite_db_path"])

        self._sender = sender or default_http_sender
        self._db_lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._flush_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._wake_event = threading.Event()
        self._flush_done_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None

        self._memory_queue: Deque[Dict[str, Any]] = deque(maxlen=self.max_memory_queue)
        self._latest_packet: Optional[Dict[str, Any]] = None
        self._warnings: Deque[str] = deque(maxlen=20)
        self._start_monotonic = time.monotonic()

        # Token bucket for bounded burst + sustained TELEMETRY_RATE_HZ throttling
        self._bucket_capacity = float(max(2, self.forward_batch_size))
        self._bucket_tokens = self._bucket_capacity
        self._bucket_last_ts = time.monotonic()

        self.received_count = 0
        self.forwarded_count = 0
        self.rejected_count = 0
        self.duplicate_count = 0
        self.throttled_count = 0
        self.evicted_count = 0
        self.retry_attempts = 0
        self.latest_received_sequence = 0
        self.latest_forwarded_sequence = 0
        self.buffered_count_cached = 0
        self.sqlite_rows_cached = 0
        self.backend_connected = False
        self.last_error: Optional[str] = None
        self.last_forwarded_at: Optional[str] = None
        self._cached_health: Optional[Dict[str, Any]] = None
        self._cached_health_ts: float = 0.0

        self._init_sqlite()

    def _init_sqlite(self) -> None:
        self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self.sqlite_path), check_same_thread=False, timeout=15.0)
        self._conn.execute("PRAGMA journal_mode=WAL;")
        self._conn.execute("PRAGMA synchronous=NORMAL;")
        self._conn.execute("PRAGMA temp_store=MEMORY;")
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS telemetry_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_key TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                received_at TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                forwarded INTEGER NOT NULL DEFAULT 0,
                forwarded_at TEXT,
                created_ts REAL NOT NULL,
                UNIQUE(session_key, sequence)
            )
            """
        )
        self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_queue_pending ON telemetry_queue(forwarded, id)"
        )
        self._conn.commit()
        self._reload_from_sqlite()

    def _reload_from_sqlite(self) -> None:
        with self._db_lock:
            pending_rows = self._conn.execute(
                "SELECT payload_json, sequence FROM telemetry_queue WHERE forwarded = 0 ORDER BY id ASC"
            ).fetchall()
            total_row = self._conn.execute("SELECT COUNT(*) FROM telemetry_queue").fetchone()
            latest_row = self._conn.execute(
                "SELECT payload_json, sequence FROM telemetry_queue ORDER BY id DESC LIMIT 1"
            ).fetchone()
            latest_fwd = self._conn.execute(
                "SELECT COALESCE(MAX(sequence), 0), MAX(forwarded_at) FROM telemetry_queue WHERE forwarded = 1"
            ).fetchone()

        self._memory_queue.clear()
        for payload_str, _seq in pending_rows[-self.max_memory_queue :]:
            try:
                self._memory_queue.append(json.loads(payload_str))
            except Exception:
                pass

        with self._state_lock:
            self.buffered_count_cached = len(pending_rows)
            self.sqlite_rows_cached = int(total_row[0]) if total_row else 0
            if latest_row:
                try:
                    self._latest_packet = json.loads(latest_row[0])
                    self.latest_received_sequence = int(latest_row[1])
                except Exception:
                    pass
            if latest_fwd and latest_fwd[0]:
                self.latest_forwarded_sequence = int(latest_fwd[0])
                self.last_forwarded_at = latest_fwd[1]

    def close(self) -> None:
        self.stop()
        with self._db_lock:
            try:
                self._conn.close()
            except Exception:
                pass

    def start(self) -> None:
        if self._worker_thread and self._worker_thread.is_alive():
            return
        self._stop_event.clear()
        self._worker_thread = threading.Thread(
            target=self._retry_loop,
            name="kx-rpi-zero-forwarder",
            daemon=True,
        )
        self._worker_thread.start()

    def stop(self, timeout_s: float = 3.0) -> None:
        self._stop_event.set()
        self._wake_event.set()
        if self._worker_thread and self._worker_thread.is_alive():
            self._worker_thread.join(timeout=timeout_s)

    def _add_warning(self, msg: str) -> None:
        with self._state_lock:
            if msg not in self._warnings:
                self._warnings.append(msg)

    def _consume_throttle_token(self) -> bool:
        if self.telemetry_rate_hz <= 0.0:
            return True
        now = time.monotonic()
        elapsed = max(0.0, now - self._bucket_last_ts)
        self._bucket_last_ts = now
        self._bucket_tokens = min(
            self._bucket_capacity,
            self._bucket_tokens + elapsed * self.telemetry_rate_hz,
        )
        if self._bucket_tokens >= 1.0:
            self._bucket_tokens -= 1.0
            return True
        return False

    def record_rejection(self) -> None:
        with self._state_lock:
            self.rejected_count += 1
            self._cached_health = None

    def configure_throttle(self, rate_hz: float, burst_capacity: Optional[int] = None) -> None:
        with self._state_lock:
            self.telemetry_rate_hz = max(0.0, float(rate_hz))
            if burst_capacity is not None:
                self._bucket_capacity = float(max(1, burst_capacity))
                self._bucket_tokens = self._bucket_capacity

    def enqueue_and_try_forward(self, packet: Dict[str, Any], immediate: bool = True) -> Dict[str, Any]:
        """Validate uniqueness, update latest state immediately, buffer in bounded SQLite, and trigger forwarding."""
        session_key = str(packet.get("_session_id", "default"))
        clean_packet = _strip_internal_fields(packet)
        seq = int(clean_packet["sequence"])

        with self._state_lock:
            self._latest_packet = clean_packet
            self._cached_health = None

        serialized = json.dumps(clean_packet, separators=(",", ":"))
        now_ts = time.time()

        with self._db_lock:
            existing = self._conn.execute(
                "SELECT id FROM telemetry_queue WHERE session_key = ? AND sequence = ?",
                (session_key, seq),
            ).fetchone()
            if existing:
                with self._state_lock:
                    self.duplicate_count += 1
                return {
                    "status": "duplicate",
                    "duplicate": True,
                    "ground_station_id": self.ground_station_id,
                    "hardware_model": self.hardware_model,
                    "received_at": clean_packet["received_at"],
                    "sequence": seq,
                    "buffered_count": self.buffered_count,
                    "backend_connected": self.backend_connected,
                    "last_error": self.last_error,
                }

            # Apply rate throttling only after ensuring latest_packet & duplicate check ran
            with self._state_lock:
                allowed = self._consume_throttle_token()
                if not allowed:
                    self.throttled_count += 1
                    self.received_count += 1
                    self.latest_received_sequence = seq
                    return {
                        "status": "throttled",
                        "ground_station_id": self.ground_station_id,
                        "hardware_model": self.hardware_model,
                        "received_at": clean_packet["received_at"],
                        "sequence": seq,
                        "buffered_count": self.buffered_count_cached,
                        "backend_connected": self.backend_connected,
                        "last_error": self.last_error,
                    }

            total_rows = int(self._conn.execute("SELECT COUNT(*) FROM telemetry_queue").fetchone()[0])
            if total_rows >= self.max_sqlite_rows:
                overflow = (total_rows - self.max_sqlite_rows) + 1
                # Prefer removing oldest already-forwarded archive rows first
                fwd_old = self._conn.execute(
                    "SELECT id FROM telemetry_queue WHERE forwarded = 1 ORDER BY id ASC LIMIT ?",
                    (overflow,),
                ).fetchall()
                if fwd_old:
                    self._conn.executemany("DELETE FROM telemetry_queue WHERE id = ?", fwd_old)
                remaining_to_evict = overflow - len(fwd_old)
                if remaining_to_evict > 0:
                    unfwd_old = self._conn.execute(
                        "SELECT id FROM telemetry_queue WHERE forwarded = 0 ORDER BY id ASC LIMIT ?",
                        (remaining_to_evict,),
                    ).fetchall()
                    if unfwd_old:
                        self._conn.executemany("DELETE FROM telemetry_queue WHERE id = ?", unfwd_old)
                        with self._state_lock:
                            self.evicted_count += len(unfwd_old)
                        logger.warning("%s (%d record(s))", QUEUE_EVICTION_WARNING, len(unfwd_old))
                        self._add_warning(QUEUE_EVICTION_WARNING)

            self._conn.execute(
                """
                INSERT INTO telemetry_queue (session_key, sequence, timestamp, received_at, payload_json, forwarded, forwarded_at, created_ts)
                VALUES (?, ?, ?, ?, ?, 0, NULL, ?)
                """,
                (session_key, seq, clean_packet["timestamp"], clean_packet["received_at"], serialized, now_ts),
            )
            self._conn.commit()
            pending_cnt = int(self._conn.execute("SELECT COUNT(*) FROM telemetry_queue WHERE forwarded = 0").fetchone()[0])
            row_cnt = int(self._conn.execute("SELECT COUNT(*) FROM telemetry_queue").fetchone()[0])

        with self._state_lock:
            self.received_count += 1
            self.latest_received_sequence = seq
            self._memory_queue.append(clean_packet)
            self.buffered_count_cached = pending_cnt
            self.sqlite_rows_cached = row_cnt
            self._cached_health = None

        delivered_now = False
        if immediate:
            flushed = self.flush_pending(max_batch=self.forward_batch_size)
            delivered_now = flushed > 0 and self.buffered_count == 0
        else:
            self._wake_event.set()

        with self._state_lock:
            return {
                "status": "forwarded" if delivered_now else "buffered",
                "ground_station_id": self.ground_station_id,
                "hardware_model": self.hardware_model,
                "received_at": clean_packet["received_at"],
                "sequence": seq,
                "buffered_count": self.buffered_count_cached,
                "backend_connected": self.backend_connected,
                "last_error": self.last_error,
            }

    @property
    def worker_running(self) -> bool:
        return bool(self._worker_thread and self._worker_thread.is_alive())

    @property
    def buffered_count(self) -> int:
        with self._state_lock:
            return self.buffered_count_cached

    def enqueue_and_wait_brief(self, packet: Dict[str, Any], wait_s: float = 1.2) -> Dict[str, Any]:
        """Enqueue packet to SQLite cleanly without blocking HTTP handlers during long backend timeouts."""
        if not self.worker_running:
            return self.enqueue_and_try_forward(packet, immediate=True)

        self._flush_done_event.clear()
        res = self.enqueue_and_try_forward(packet, immediate=False)
        if res["status"] in ("duplicate", "throttled"):
            return res

        # Only wait briefly for fast delivery ack when backend isn't known offline
        if self.backend_connected or self.received_count <= 2:
            self._flush_done_event.wait(timeout=wait_s)

        seq = int(res["sequence"])
        with self._state_lock:
            is_forwarded = self.latest_forwarded_sequence >= seq and self.buffered_count_cached == 0
            return {
                "status": "forwarded" if is_forwarded else "buffered",
                "ground_station_id": self.ground_station_id,
                "hardware_model": self.hardware_model,
                "received_at": res["received_at"],
                "sequence": seq,
                "buffered_count": self.buffered_count_cached,
                "backend_connected": self.backend_connected,
                "last_error": self.last_error,
            }

    def flush_pending(self, max_batch: Optional[int] = None) -> int:
        """Forward pending SQLite rows in bounded FIFO batches without holding state/DB locks during HTTP I/O."""
        batch_limit = max_batch if max_batch is not None else self.forward_batch_size
        sent = 0
        with self._flush_lock:
            with self._db_lock:
                rows = self._conn.execute(
                    "SELECT id, sequence, payload_json FROM telemetry_queue WHERE forwarded = 0 ORDER BY id ASC LIMIT ?",
                    (batch_limit,),
                ).fetchall()

            for row_id, seq, payload_str in rows:
                packet = json.loads(payload_str)
                try:
                    status_code, resp_text = self._sender(
                        self.telemetry_endpoint,
                        packet,
                        self.http_timeout_seconds,
                    )
                except Exception as exc:
                    with self._state_lock:
                        self.backend_connected = False
                        self.last_error = str(exc)
                        self.retry_attempts += 1
                        self._cached_health = None
                    self._wake_event.set()
                    break

                if 200 <= status_code < 300:
                    now_iso = _utc_now_iso()
                    with self._db_lock:
                        self._conn.execute(
                            "UPDATE telemetry_queue SET forwarded = 1, forwarded_at = ? WHERE id = ?",
                            (now_iso, row_id),
                        )
                        self._conn.commit()
                        pending_cnt = int(
                            self._conn.execute("SELECT COUNT(*) FROM telemetry_queue WHERE forwarded = 0").fetchone()[0]
                        )
                    with self._state_lock:
                        if self._memory_queue and self._memory_queue[0].get("sequence") == seq:
                            self._memory_queue.popleft()
                        self.forwarded_count += 1
                        self.latest_forwarded_sequence = int(seq)
                        self.buffered_count_cached = pending_cnt
                        self.backend_connected = True
                        self.last_error = None
                        self.last_forwarded_at = now_iso
                        self._cached_health = None
                    sent += 1
                elif status_code in (400, 422):
                    logger.error("Backend permanently rejected telemetry packet (%s): %s", status_code, resp_text)
                    with self._db_lock:
                        self._conn.execute("UPDATE telemetry_queue SET forwarded = -1 WHERE id = ?", (row_id,))
                        self._conn.commit()
                        pending_cnt = int(
                            self._conn.execute("SELECT COUNT(*) FROM telemetry_queue WHERE forwarded = 0").fetchone()[0]
                        )
                    with self._state_lock:
                        self.rejected_count += 1
                        self.buffered_count_cached = pending_cnt
                        self.last_error = f"HTTP {status_code}: {resp_text}"
                        self._cached_health = None
                else:
                    with self._state_lock:
                        self.backend_connected = False
                        self.last_error = f"HTTP {status_code}: {resp_text}"
                        self.retry_attempts += 1
                        self._cached_health = None
                    self._wake_event.set()
                    break
            self._flush_done_event.set()
        return sent

    def _retry_loop(self) -> None:
        backoff = self.base_backoff_s
        while not self._stop_event.is_set():
            if self.buffered_count > 0:
                flushed = self.flush_pending(max_batch=self.forward_batch_size)
                if self.buffered_count == 0:
                    backoff = self.base_backoff_s
                elif flushed > 0:
                    # Drain queued backlog quickly once backend recovers
                    continue
                else:
                    self._stop_event.wait(backoff)
                    backoff = min(self.max_backoff_s, backoff * 2.0)
                    continue

            self._wake_event.wait(timeout=self.base_backoff_s)
            self._wake_event.clear()

    def get_latest_satellite_state(self) -> Dict[str, Any]:
        """Return the newest phone attitude packet immediately, regardless of queue depth."""
        with self._state_lock:
            pkt = dict(self._latest_packet) if self._latest_packet else None
            buffered = self.buffered_count_cached
            connected = self.backend_connected
            gs_id = self.ground_station_id
            hw = self.hardware_model

        if pkt is None:
            return {
                "device_id": EXPECTED_DEVICE_ID,
                "satellite_name": EXPECTED_SATELLITE_NAME,
                "ground_station_id": gs_id,
                "hardware_model": hw,
                "source": EXPECTED_SOURCE,
                "mode": EXPECTED_MODE,
                "sequence": 0,
                "timestamp": None,
                "received_at": None,
                "orientation": {"roll_deg": 0.0, "pitch_deg": 0.0, "yaw_deg": 0.0},
                "angular_velocity": {"x_dps": 0.0, "y_dps": 0.0, "z_dps": 0.0},
                "buffered_count": buffered,
                "backend_connected": connected,
                "link_status": "AWAITING_PHONE_TELEMETRY",
            }

        return {
            **pkt,
            "buffered_count": buffered,
            "backend_connected": connected,
            "link_status": "LIVE_RPI_ZERO_GATEWAY" if connected else "BUFFERED_OFFLINE",
        }

    def get_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        capped = max(1, min(int(limit), 200))
        with self._db_lock:
            rows = self._conn.execute(
                "SELECT payload_json, forwarded, forwarded_at FROM telemetry_queue ORDER BY id DESC LIMIT ?",
                (capped,),
            ).fetchall()
        out: List[Dict[str, Any]] = []
        for payload_str, fwd, fwd_at in rows:
            item = json.loads(payload_str)
            item["forwarded"] = fwd == 1
            item["forwarded_at"] = fwd_at
            out.append(item)
        return out

    def get_status(self, force_refresh: bool = False) -> Dict[str, Any]:
        """Return lightweight gateway health metrics with lock-free/cache protection."""
        now_mono = time.monotonic()
        with self._state_lock:
            if (
                not force_refresh
                and self._cached_health is not None
                and self.health_cache_seconds > 0.0
                and (now_mono - self._cached_health_ts) < self.health_cache_seconds
            ):
                snapshot = dict(self._cached_health)
                snapshot["uptime_seconds"] = int(now_mono - self._start_monotonic)
                return snapshot

            snapshot = {
                "status": "nominal" if not self.last_error else "degraded",
                "ground_station_id": self.ground_station_id,
                "hardware_model": self.hardware_model,
                "architecture": self.architecture,
                "device_id": EXPECTED_DEVICE_ID,
                "backend_endpoint": self.telemetry_endpoint,
                "backend_connected": self.backend_connected,
                "uptime_seconds": int(now_mono - self._start_monotonic),
                "queue_length": self.buffered_count_cached,
                "buffered_count": self.buffered_count_cached,
                "sqlite_rows": self.sqlite_rows_cached,
                "latest_received_sequence": self.latest_received_sequence,
                "latest_forwarded_sequence": self.latest_forwarded_sequence,
                "received_count": self.received_count,
                "forwarded_count": self.forwarded_count,
                "rejected_count": self.rejected_count,
                "duplicate_count": self.duplicate_count,
                "throttled_count": self.throttled_count,
                "evicted_count": self.evicted_count,
                "retry_attempts": self.retry_attempts,
                "last_forwarded_at": self.last_forwarded_at,
                "last_error": self.last_error,
                "warnings": list(self._warnings),
            }
            self._cached_health = dict(snapshot)
            self._cached_health_ts = now_mono
            return snapshot


def _recv_exact(sock: socket.socket, n: int) -> bytes:
    buf = bytearray()
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise EOFError("WebSocket client closed connection")
        buf.extend(chunk)
    return bytes(buf)


def _ws_read_frame(sock: socket.socket) -> Optional[Tuple[int, bytes]]:
    b1, b2 = _recv_exact(sock, 2)
    opcode = b1 & 0x0F
    masked = (b2 & 0x80) != 0
    length = b2 & 0x7F
    if length == 126:
        length = struct.unpack("!H", _recv_exact(sock, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", _recv_exact(sock, 8))[0]
    if length > 65536:
        raise ValueError("WebSocket frame exceeds 64 KiB cap.")
    mask_key = _recv_exact(sock, 4) if masked else b""
    payload = _recv_exact(sock, length) if length else b""
    if masked and length:
        payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))
    return opcode, payload


def _ws_send_frame(sock: socket.socket, opcode: int, data: bytes) -> None:
    header = bytearray([0x80 | (opcode & 0x0F)])
    n = len(data)
    if n < 126:
        header.append(n)
    elif n < 65536:
        header.append(126)
        header.extend(struct.pack("!H", n))
    else:
        header.append(127)
        header.extend(struct.pack("!Q", n))
    sock.sendall(bytes(header) + data)


def create_gateway_handler(forwarder: TelemetryForwarder, html_path: Path = PHONE_SIMULATOR_HTML):
    """Build HTTP/WebSocket request handler bound to a TelemetryForwarder instance."""

    class GatewayHTTPHandler(http.server.BaseHTTPRequestHandler):
        server_version = "KesslerX-RPiZero-GroundStation/2.0"

        def log_message(self, format: str, *args: Any) -> None:
            logger.debug("%s - %s", self.address_string(), format % args)

        def _send_json(self, status_code: int, payload: Any) -> None:
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

        def _handle_websocket_phone(self) -> None:
            ws_key = self.headers.get("Sec-WebSocket-Key")
            if not ws_key:
                self._send_json(400, {"error": "Missing Sec-WebSocket-Key header."})
                return

            accept = base64.b64encode(
                hashlib.sha1((ws_key.strip() + _WS_MAGIC_GUID).encode("ascii")).digest()
            ).decode("ascii")

            self.send_response(101, "Switching Protocols")
            self.send_header("Upgrade", "websocket")
            self.send_header("Connection", "Upgrade")
            self.send_header("Sec-WebSocket-Accept", accept)
            self.end_headers()
            self.close_connection = True

            sock: socket.socket = self.connection
            sock.settimeout(60.0)
            while True:
                try:
                    opcode, payload = _ws_read_frame(sock)
                except (EOFError, TimeoutError, OSError, ValueError):
                    break

                if opcode == 0x8:  # Close
                    try:
                        _ws_send_frame(sock, 0x8, b"")
                    except OSError:
                        pass
                    break
                if opcode == 0x9:  # Ping
                    _ws_send_frame(sock, 0xA, payload)
                    continue
                if opcode != 0x1:  # Text expected
                    continue

                try:
                    raw_json = json.loads(payload.decode("utf-8"))
                    enriched = validate_and_enrich_phone_packet(
                        raw_json,
                        ground_station_id=forwarder.ground_station_id,
                        hardware_model=forwarder.hardware_model,
                    )
                    res = forwarder.enqueue_and_try_forward(enriched, immediate=False)
                    _ws_send_frame(sock, 0x1, json.dumps(res).encode("utf-8"))
                except Exception as exc:
                    forwarder.record_rejection()
                    err_reply = json.dumps({"status": "rejected", "error": str(exc)}).encode("utf-8")
                    _ws_send_frame(sock, 0x1, err_reply)

        def do_GET(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path == "/ws/phone" and "websocket" in self.headers.get("Upgrade", "").lower():
                self._handle_websocket_phone()
                return

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
            elif parsed.path == "/satellite":
                self._send_json(200, forwarder.get_latest_satellite_state())
            elif parsed.path == "/telemetry/history":
                qs = urllib.parse.parse_qs(parsed.query)
                try:
                    limit = int(qs.get("limit", ["50"])[0])
                except ValueError:
                    limit = 50
                packets = forwarder.get_history(limit=limit)
                self._send_json(200, {
                    "ground_station_id": forwarder.ground_station_id,
                    "hardware_model": forwarder.hardware_model,
                    "count": len(packets),
                    "packets": packets,
                })
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
                enriched = validate_and_enrich_phone_packet(
                    raw_json,
                    ground_station_id=forwarder.ground_station_id,
                    hardware_model=forwarder.hardware_model,
                )
            except ValueError as exc:
                forwarder.record_rejection()
                self._send_json(422, {
                    "error": str(exc),
                    "ground_station_id": forwarder.ground_station_id,
                    "hardware_model": forwarder.hardware_model,
                })
                return

            result = forwarder.enqueue_and_wait_brief(enriched, wait_s=1.2)
            status_code = 200 if result["status"] in ("forwarded", "duplicate", "throttled") else 202
            self._send_json(status_code, result)

    return GatewayHTTPHandler


def _detect_local_ip() -> Optional[str]:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            ipaddress.ip_address(ip)
            return ip
    except Exception:
        return None


def ensure_self_signed_cert(cert_dir: Path, gs_id: str = DEFAULT_GROUND_STATION_ID) -> Tuple[Path, Path]:
    """Generate a self-signed TLS certificate via OpenSSL for iOS/Android phone sensor contexts."""
    openssl_bin = shutil.which("openssl")
    if not openssl_bin:
        raise RuntimeError("openssl binary is required to auto-generate a self-signed HTTPS certificate.")

    cert_dir.mkdir(parents=True, exist_ok=True)
    cert_file = cert_dir / "rpi-zero-gateway-cert.pem"
    key_file = cert_dir / "rpi-zero-gateway-key.pem"

    lan_ip = _detect_local_ip()
    if cert_file.exists() and key_file.exists():
        if not lan_ip:
            return cert_file, key_file
        try:
            san_check = subprocess.run(
                [openssl_bin, "x509", "-in", str(cert_file), "-noout", "-ext", "subjectAltName"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if f"IP Address:{lan_ip}" in san_check.stdout:
                return cert_file, key_file
            logger.info("Detected new LAN IP (%s); refreshing TLS SAN certificate...", lan_ip)
        except Exception:
            return cert_file, key_file

    san_entries = ["DNS:localhost", f"DNS:{socket.gethostname()}", f"DNS:{socket.gethostname()}.local", "IP:127.0.0.1"]
    if lan_ip and lan_ip != "127.0.0.1":
        san_entries.append(f"IP:{lan_ip}")

    base_cmd = [
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
        f"/CN={gs_id}",
    ]
    try:
        subprocess.run(
            [*base_cmd, "-addext", f"subjectAltName={','.join(san_entries)}"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError:
        subprocess.run(
            base_cmd,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    os.chmod(key_file, 0o600)
    return cert_file, key_file


def create_gateway_server(
    host: str,
    port: int,
    forwarder: TelemetryForwarder,
    certfile: Optional[str] = None,
    keyfile: Optional[str] = None,
    html_path: Path = PHONE_SIMULATOR_HTML,
) -> http.server.ThreadingHTTPServer:
    handler_cls = create_gateway_handler(forwarder, html_path=html_path)
    httpd = http.server.ThreadingHTTPServer((host, port), handler_cls)
    httpd.daemon_threads = True
    if certfile and keyfile:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile=certfile, keyfile=keyfile)
        httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    return httpd


def main(argv: Optional[List[str]] = None) -> int:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    cfg = load_gateway_config()

    parser = argparse.ArgumentParser(
        description="KesslerX Raspberry Pi Zero W Ground Station Gateway (KX-RPI-ZERO-GS-001)"
    )
    parser.add_argument("--host", default=cfg["host"], help="Bind host (default 0.0.0.0)")
    parser.add_argument("--port", type=int, default=cfg["port"], help="HTTP/WS listen port (default 8765)")
    parser.add_argument(
        "--https-port",
        type=int,
        default=int(os.getenv("RPI_HTTPS_PORT", "0")),
        help="Optional companion HTTPS/WSS port sharing the same forwarder (e.g. 8443)",
    )
    parser.add_argument(
        "--backend-url",
        default=cfg["backend_url"],
        help="KesslerX backend base URL",
    )
    parser.add_argument(
        "--sqlite-db",
        default=cfg["sqlite_db_path"],
        help="Path to SQLite offline telemetry buffer database",
    )
    parser.add_argument("--certfile", default=os.getenv("TLS_CERT_FILE"), help="Path to TLS certificate PEM")
    parser.add_argument("--keyfile", default=os.getenv("TLS_KEY_FILE"), help="Path to TLS private key PEM")
    parser.add_argument(
        "--self-signed",
        action="store_true",
        help="Enable HTTPS on primary port or companion --https-port with auto-generated self-signed cert",
    )

    args = parser.parse_args(argv)

    certfile = args.certfile
    keyfile = args.keyfile
    if (args.self_signed or args.https_port > 0) and not (certfile and keyfile):
        cert_dir = Path(__file__).resolve().parent / ".certs"
        cert_path, key_path = ensure_self_signed_cert(cert_dir, gs_id=cfg["ground_station_id"])
        certfile, keyfile = str(cert_path), str(key_path)

    forwarder = TelemetryForwarder(
        backend_url=args.backend_url,
        sqlite_path=Path(args.sqlite_db),
    )
    forwarder.start()

    # Primary server (HTTP unless --self-signed without --https-port)
    primary_tls = bool(args.self_signed and args.https_port <= 0)
    httpd = create_gateway_server(
        host=args.host,
        port=args.port,
        forwarder=forwarder,
        certfile=certfile if primary_tls else None,
        keyfile=keyfile if primary_tls else None,
    )

    httpsd: Optional[http.server.ThreadingHTTPServer] = None
    https_thread: Optional[threading.Thread] = None
    if args.https_port > 0 and certfile and keyfile:
        httpsd = create_gateway_server(
            host=args.host,
            port=args.https_port,
            forwarder=forwarder,
            certfile=certfile,
            keyfile=keyfile,
        )
        https_thread = threading.Thread(target=httpsd.serve_forever, name="kx-https-listener", daemon=True)
        https_thread.start()
        logger.info("%s companion HTTPS/WSS listening on https://%s:%s", cfg["ground_station_id"], args.host, args.https_port)

    scheme = "https" if primary_tls else "http"
    logger.info(
        "%s (%s, arch=%s) listening on %s://%s:%s",
        cfg["ground_station_id"],
        cfg["hardware_model"],
        forwarder.architecture,
        scheme,
        args.host,
        args.port,
    )
    logger.info("Forwarding validated phone telemetry to %s", forwarder.telemetry_endpoint)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down %s gracefully...", cfg["ground_station_id"])
    finally:
        forwarder.close()
        httpd.server_close()
        if httpsd:
            httpsd.shutdown()
            httpsd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
