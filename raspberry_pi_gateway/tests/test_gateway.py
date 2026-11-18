"""
Tests for KesslerX Raspberry Pi Zero W Ground Station Gateway (KX-RPI-ZERO-GS-001).
Works with both pytest and Python stdlib unittest on Raspberry Pi Zero W (armv6l).
Verifies Raspberry Pi Zero W identity, default config, validation, duplicate sequence
handling, bounded memory/SQLite eviction warnings, throttling, latest-packet priority,
SQLite offline buffering & crash-restart recovery, WS /ws/phone, HTTP POST fallback,
and legacy KX-RPI3-GS-001 migration compatibility.
"""

import base64
import hashlib
import json
import os
import socket
import struct
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

GATEWAY_DIR = Path(__file__).resolve().parents[1]
if str(GATEWAY_DIR) not in sys.path:
    sys.path.insert(0, str(GATEWAY_DIR))

from gateway import (  # noqa: E402
    DEFAULT_GROUND_STATION_ID,
    DEFAULT_HARDWARE_MODEL,
    PHONE_SIMULATOR_HTML,
    QUEUE_EVICTION_WARNING,
    TelemetryForwarder,
    create_gateway_server,
    load_gateway_config,
    validate_and_enrich_phone_packet,
)


def _sample_phone_packet(
    seq: int = 1,
    roll: float = 4.0,
    pitch: float = 2.0,
    yaw: float = 90.0,
    ground_station_id: str = DEFAULT_GROUND_STATION_ID,
    session_id: str = "default",
):
    return {
        "device_id": "PHONE-SATELLITE-001",
        "satellite_name": "PHONE SATELLITE",
        "sequence": seq,
        "session_id": session_id,
        "timestamp": "2026-11-17T12:00:00Z",
        "orientation": {
            "roll_deg": roll,
            "pitch_deg": pitch,
            "yaw_deg": yaw,
        },
        "angular_velocity": {
            "x_dps": 0.5,
            "y_dps": -0.2,
            "z_dps": 0.1,
        },
        "source": "phone_sensor",
        "mode": "simulated",
        "ground_station_id": ground_station_id,
    }


class TestPiZeroGateway(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp_dir = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_default_config_and_zero_w_identity(self):
        cfg = load_gateway_config()
        self.assertEqual(cfg["ground_station_id"], "KX-RPI-ZERO-GS-001")
        self.assertEqual(cfg["hardware_model"], "Raspberry Pi Zero W")
        self.assertEqual(cfg["max_memory_queue"], 100)
        self.assertEqual(cfg["max_sqlite_rows"], 5000)
        self.assertEqual(cfg["telemetry_rate_hz"], 2.0)
        self.assertEqual(cfg["forward_batch_size"], 10)
        self.assertEqual(cfg["http_timeout_seconds"], 10.0)
        self.assertEqual(cfg["max_retry_seconds"], 60.0)
        self.assertEqual(cfg["health_cache_seconds"], 10.0)

        enriched = validate_and_enrich_phone_packet(_sample_phone_packet(seq=1))
        self.assertEqual(enriched["ground_station_id"], "KX-RPI-ZERO-GS-001")
        self.assertEqual(enriched["hardware_model"], "Raspberry Pi Zero W")
        self.assertEqual(enriched["device_id"], "PHONE-SATELLITE-001")
        self.assertEqual(enriched["satellite_name"], "PHONE SATELLITE")
        self.assertTrue(enriched["received_at"].endswith("Z"))

        # Legacy KX-RPI3-GS-001 packet accepted seamlessly during migration
        legacy = validate_and_enrich_phone_packet(
            _sample_phone_packet(seq=2, ground_station_id="KX-RPI3-GS-001")
        )
        self.assertEqual(legacy["ground_station_id"], "KX-RPI-ZERO-GS-001")
        self.assertEqual(legacy["hardware_model"], "Raspberry Pi Zero W")

    def test_validation_rejects_bad_payloads(self):
        with self.assertRaises(ValueError):
            validate_and_enrich_phone_packet({**_sample_phone_packet(), "device_id": "LAPTOP"})
        with self.assertRaises(ValueError):
            validate_and_enrich_phone_packet({**_sample_phone_packet(), "sequence": 0})
        with self.assertRaises(ValueError):
            validate_and_enrich_phone_packet({**_sample_phone_packet(), "ground_station_id": "LAPTOP-DIRECT"})
        with self.assertRaises(ValueError):
            validate_and_enrich_phone_packet(
                {**_sample_phone_packet(), "orientation": {"roll_deg": 999.0, "pitch_deg": 0.0, "yaw_deg": 0.0}}
            )

    def test_duplicate_sequence_protection_and_batch_forwarding(self):
        delivered = []

        def mock_sender(url: str, pkt: dict, timeout_s: float):
            delivered.append(pkt)
            return 200, json.dumps({"status": "received", "packet_id": pkt["sequence"]})

        fwd = TelemetryForwarder(
            backend_url="http://127.0.0.1:8000",
            sqlite_path=self.tmp_dir / "dup.db",
            telemetry_rate_hz=0.0,
            forward_batch_size=2,
            sender=mock_sender,
        )
        try:
            p1 = validate_and_enrich_phone_packet(_sample_phone_packet(seq=5))
            r1 = fwd.enqueue_and_try_forward(p1, immediate=False)
            self.assertEqual(r1["status"], "buffered")

            # Duplicate sequence must NOT be enqueued or forwarded twice
            p1_dup = validate_and_enrich_phone_packet(_sample_phone_packet(seq=5))
            r_dup = fwd.enqueue_and_try_forward(p1_dup, immediate=False)
            self.assertEqual(r_dup["status"], "duplicate")
            self.assertEqual(fwd.duplicate_count, 1)
            self.assertEqual(fwd.buffered_count, 1)

            # Add two more unique sequences (total queued = 3, batch_size = 2)
            for s in (6, 7):
                fwd.enqueue_and_try_forward(validate_and_enrich_phone_packet(_sample_phone_packet(seq=s)), immediate=False)
            self.assertEqual(fwd.buffered_count, 3)

            sent_batch_1 = fwd.flush_pending()
            self.assertEqual(sent_batch_1, 2)
            self.assertEqual(fwd.buffered_count, 1)

            sent_batch_2 = fwd.flush_pending()
            self.assertEqual(sent_batch_2, 1)
            self.assertEqual(fwd.buffered_count, 0)
            self.assertEqual([p["sequence"] for p in delivered], [5, 6, 7])
        finally:
            fwd.close()

    def test_sqlite_offline_buffering_and_restart_recovery(self):
        delivered = []
        backend_up = {"ok": False}

        def mock_sender(url: str, pkt: dict, timeout_s: float):
            if not backend_up["ok"]:
                raise urllib.error.URLError("Backend down")
            delivered.append(pkt)
            return 200, json.dumps({"status": "received", "packet_id": pkt["sequence"]})

        db_file = self.tmp_dir / "restart_buffer.db"
        fwd1 = TelemetryForwarder(
            backend_url="http://127.0.0.1:8000",
            sqlite_path=db_file,
            telemetry_rate_hz=0.0,
            sender=mock_sender,
        )
        res1 = fwd1.enqueue_and_try_forward(validate_and_enrich_phone_packet(_sample_phone_packet(seq=1, roll=11.0)), immediate=True)
        res2 = fwd1.enqueue_and_try_forward(validate_and_enrich_phone_packet(_sample_phone_packet(seq=2, roll=22.0)), immediate=True)
        self.assertEqual(res1["status"], "buffered")
        self.assertEqual(res2["status"], "buffered")
        self.assertEqual(fwd1.buffered_count, 2)
        fwd1.close()

        # Simulate process restart reloading same SQLite DB
        backend_up["ok"] = True
        fwd2 = TelemetryForwarder(
            backend_url="http://127.0.0.1:8000",
            sqlite_path=db_file,
            telemetry_rate_hz=0.0,
            sender=mock_sender,
        )
        try:
            self.assertEqual(fwd2.buffered_count, 2)
            # Latest telemetry immediately accessible even while queued
            self.assertEqual(fwd2.get_latest_satellite_state()["orientation"]["roll_deg"], 22.0)

            flushed = fwd2.flush_pending()
            self.assertEqual(flushed, 2)
            self.assertEqual(fwd2.buffered_count, 0)
            self.assertEqual([p["sequence"] for p in delivered], [1, 2])
            self.assertEqual(fwd2.latest_forwarded_sequence, 2)
        finally:
            fwd2.close()

    def test_bounded_sqlite_queue_emits_warning_and_keeps_latest(self):
        def failing_sender(url: str, pkt: dict, timeout_s: float):
            raise urllib.error.URLError("Offline")

        fwd = TelemetryForwarder(
            backend_url="http://127.0.0.1:8000",
            sqlite_path=self.tmp_dir / "bounded.db",
            max_memory_queue=3,
            max_sqlite_rows=3,
            telemetry_rate_hz=0.0,
            sender=failing_sender,
        )
        try:
            for seq in (1, 2, 3, 4, 5):
                pkt = validate_and_enrich_phone_packet(_sample_phone_packet(seq=seq, roll=float(seq)))
                fwd.enqueue_and_try_forward(pkt, immediate=False)

            status = fwd.get_status(force_refresh=True)
            self.assertEqual(status["sqlite_rows"], 3)
            self.assertEqual(status["buffered_count"], 3)
            self.assertEqual(status["evicted_count"], 2)
            self.assertIn(QUEUE_EVICTION_WARNING, status["warnings"])
            self.assertEqual(fwd.get_latest_satellite_state()["sequence"], 5)
            hist_seqs = [p["sequence"] for p in fwd.get_history(limit=10)]
            self.assertEqual(hist_seqs, [5, 4, 3])
        finally:
            fwd.close()

    def test_throttling_retains_latest_packet_without_unbounded_growth(self):
        fwd = TelemetryForwarder(
            backend_url="http://127.0.0.1:8000",
            sqlite_path=self.tmp_dir / "throttle.db",
            telemetry_rate_hz=1.0,
            forward_batch_size=1,
            sender=lambda u, p, t: (200, '{"status":"received"}'),
        )
        fwd.configure_throttle(rate_hz=0.1, burst_capacity=1)
        try:
            r1 = fwd.enqueue_and_try_forward(validate_and_enrich_phone_packet(_sample_phone_packet(seq=1, roll=1.0)), immediate=False)
            r2 = fwd.enqueue_and_try_forward(validate_and_enrich_phone_packet(_sample_phone_packet(seq=2, roll=42.5)), immediate=False)
            self.assertEqual(r1["status"], "buffered")
            self.assertEqual(r2["status"], "throttled")
            self.assertEqual(fwd.throttled_count, 1)
            # Even when throttled, latest orientation must still reflect newest valid reading immediately
            self.assertEqual(fwd.get_latest_satellite_state()["orientation"]["roll_deg"], 42.5)
        finally:
            fwd.close()

    def test_http_endpoints_websocket_and_simulator_isolation(self):
        html = PHONE_SIMULATOR_HTML.read_text(encoding="utf-8")
        self.assertIn("SIMULATED SATELLITE — NOT A REAL SPACECRAFT", html)
        self.assertIn("KX-RPI-ZERO-GS-001", html)
        self.assertIn("window.location.origin + '/telemetry'", html)
        self.assertIn("/ws/phone", html)
        self.assertNotIn("/api/ground-station/telemetry", html)
        self.assertNotIn("kesslerx-backend", html)

        received_by_backend = []

        def mock_sender(url: str, pkt: dict, timeout_s: float):
            received_by_backend.append(pkt)
            return 200, json.dumps({"status": "received", "packet_id": pkt["sequence"]})

        fwd = TelemetryForwarder(
            backend_url="http://127.0.0.1:8000",
            sqlite_path=self.tmp_dir / "server.db",
            telemetry_rate_hz=0.0,
            sender=mock_sender,
        )
        server = create_gateway_server("127.0.0.1", 0, fwd)
        port = server.server_address[1]
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        try:
            # 1. GET /
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=5) as resp:
                self.assertEqual(resp.status, 200)
                self.assertIn("KX-RPI-ZERO-GS-001", resp.read().decode("utf-8"))

            # 2. POST /telemetry fallback
            req = urllib.request.Request(
                f"http://127.0.0.1:{port}/telemetry",
                data=json.dumps(_sample_phone_packet(seq=10, roll=25.0, pitch=5.0)).encode("utf-8"),
                method="POST",
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                self.assertEqual(resp.status, 200)
                reply = json.loads(resp.read().decode("utf-8"))
                self.assertEqual(reply["status"], "forwarded")
                self.assertEqual(reply["ground_station_id"], "KX-RPI-ZERO-GS-001")
                self.assertEqual(reply["hardware_model"], "Raspberry Pi Zero W")

            # 3. WS /ws/phone RFC 6455 handshake & masked frame upload
            key_b64 = base64.b64encode(os.urandom(16)).decode("ascii")
            with socket.create_connection(("127.0.0.1", port), timeout=5) as sock:
                handshake = (
                    f"GET /ws/phone HTTP/1.1\r\n"
                    f"Host: 127.0.0.1:{port}\r\n"
                    f"Upgrade: websocket\r\n"
                    f"Connection: Upgrade\r\n"
                    f"Sec-WebSocket-Key: {key_b64}\r\n"
                    f"Sec-WebSocket-Version: 13\r\n\r\n"
                ).encode("ascii")
                sock.sendall(handshake)
                resp_hdr = sock.recv(1024).decode("ascii", errors="ignore")
                self.assertIn("101 Switching Protocols", resp_hdr)

                ws_payload = json.dumps(_sample_phone_packet(seq=11, roll=-15.0)).encode("utf-8")
                mask = b"\x12\x34\x56\x78"
                masked = bytes(b ^ mask[i % 4] for i, b in enumerate(ws_payload))
                frame = bytearray([0x81, 0x80 | 126]) + struct.pack("!H", len(ws_payload)) + mask + masked
                sock.sendall(bytes(frame))

                # Read WS text response frame
                b1, b2 = sock.recv(2)
                self.assertEqual(b1 & 0x0F, 0x1)
                plen = b2 & 0x7F
                if plen == 126:
                    plen = struct.unpack("!H", sock.recv(2))[0]
                ack = json.loads(sock.recv(plen).decode("utf-8"))
                self.assertEqual(ack["sequence"], 11)
                self.assertEqual(ack["ground_station_id"], "KX-RPI-ZERO-GS-001")

            # Flush WS queued item deterministically
            fwd.flush_pending()

            # 4. GET /satellite & GET /telemetry/history & GET /health
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/satellite", timeout=5) as resp:
                sat = json.loads(resp.read().decode("utf-8"))
                self.assertEqual(sat["device_id"], "PHONE-SATELLITE-001")
                self.assertEqual(sat["sequence"], 11)
                self.assertEqual(sat["orientation"]["roll_deg"], -15.0)

            with urllib.request.urlopen(f"http://127.0.0.1:{port}/telemetry/history?limit=10", timeout=5) as resp:
                hist = json.loads(resp.read().decode("utf-8"))
                self.assertEqual(hist["count"], 2)

            with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=5) as resp:
                health = json.loads(resp.read().decode("utf-8"))
                self.assertEqual(health["ground_station_id"], "KX-RPI-ZERO-GS-001")
                self.assertEqual(health["hardware_model"], "Raspberry Pi Zero W")
                self.assertEqual(health["latest_received_sequence"], 11)
                self.assertEqual(health["latest_forwarded_sequence"], 11)
                self.assertEqual(health["queue_length"], 0)
        finally:
            fwd.close()
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
