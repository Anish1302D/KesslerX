"""
Tests for KesslerX Raspberry Pi 3 Ground Station Gateway (KX-RPI3-GS-001).
Verifies validation, receive timestamp injection, KX-RPI3-GS-001 identity,
offline outage FIFO buffering and retry recovery, and phone simulator isolation.
"""

import json
import sys
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

GATEWAY_DIR = Path(__file__).resolve().parents[1]
if str(GATEWAY_DIR) not in sys.path:
    sys.path.insert(0, str(GATEWAY_DIR))

from gateway import (  # noqa: E402
    GROUND_STATION_ID,
    PHONE_SIMULATOR_HTML,
    TelemetryForwarder,
    create_gateway_server,
    validate_and_enrich_phone_packet,
)


def _sample_phone_packet(seq: int = 1, roll: float = 4.0, pitch: float = 2.0, yaw: float = 90.0):
    return {
        "device_id": "PHONE-SATELLITE-001",
        "satellite_name": "PHONE SATELLITE",
        "sequence": seq,
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
        "ground_station_id": "KX-RPI3-GS-001",
    }


def test_gateway_validates_and_adds_timestamp_and_station_id():
    raw = _sample_phone_packet(seq=3, roll=15.5, pitch=-3.2, yaw=210.0)
    enriched = validate_and_enrich_phone_packet(raw)

    assert enriched["ground_station_id"] == "KX-RPI3-GS-001"
    assert GROUND_STATION_ID == "KX-RPI3-GS-001"
    assert enriched["device_id"] == "PHONE-SATELLITE-001"
    assert enriched["received_at"].endswith("Z")
    assert enriched["orientation"]["roll_deg"] == 15.5


def test_gateway_rejects_invalid_phone_telemetry():
    with pytest.raises(ValueError):
        validate_and_enrich_phone_packet({**_sample_phone_packet(), "device_id": "LAPTOP"})

    with pytest.raises(ValueError):
        validate_and_enrich_phone_packet({**_sample_phone_packet(), "sequence": 0})

    with pytest.raises(ValueError):
        validate_and_enrich_phone_packet(
            {**_sample_phone_packet(), "orientation": {"roll_deg": 999.0, "pitch_deg": 0.0, "yaw_deg": 0.0}}
        )


def test_gateway_buffers_during_outage_and_retries_in_fifo_order(tmp_path):
    delivered = []
    backend_online = {"up": False}

    def mock_sender(url: str, pkt: dict, timeout_s: float):
        assert url.endswith("/api/ground-station/telemetry")
        if not backend_online["up"]:
            raise urllib.error.URLError("Backend network outage simulated")
        delivered.append(pkt)
        return 200, json.dumps({"status": "received", "packet_id": pkt["sequence"]})

    forwarder = TelemetryForwarder(
        backend_url="http://127.0.0.1:8000",
        buffer_file=tmp_path / "queue.jsonl",
        sender=mock_sender,
    )

    # While backend is offline, packets are buffered reliably
    res1 = forwarder.enqueue_and_try_forward(validate_and_enrich_phone_packet(_sample_phone_packet(seq=1)), immediate=True)
    res2 = forwarder.enqueue_and_try_forward(validate_and_enrich_phone_packet(_sample_phone_packet(seq=2)), immediate=True)

    assert res1["status"] == "buffered"
    assert res2["status"] == "buffered"
    assert forwarder.buffered_count == 2
    assert len(delivered) == 0

    # Connection returns -> flush sends all buffered packets in FIFO order
    backend_online["up"] = True
    flushed = forwarder.flush_pending()
    assert flushed == 2
    assert forwarder.buffered_count == 0
    assert [p["sequence"] for p in delivered] == [1, 2]
    assert all(p["ground_station_id"] == "KX-RPI3-GS-001" for p in delivered)


def test_gateway_http_server_and_phone_simulator_isolation(tmp_path):
    # Verify phone simulator targets ONLY the Raspberry Pi origin /telemetry, never direct backend/laptop
    html = PHONE_SIMULATOR_HTML.read_text(encoding="utf-8")
    assert "SIMULATED SATELLITE — NOT A REAL SPACECRAFT" in html
    assert "window.location.origin + '/telemetry'" in html
    assert "/api/ground-station/telemetry" not in html
    assert "kesslerx-backend" not in html

    received_by_backend = []

    def mock_sender(url: str, pkt: dict, timeout_s: float):
        received_by_backend.append(pkt)
        return 200, json.dumps({"status": "received", "packet_id": 1})

    forwarder = TelemetryForwarder(
        backend_url="http://127.0.0.1:8000",
        buffer_file=tmp_path / "server_queue.jsonl",
        sender=mock_sender,
    )
    server = create_gateway_server("127.0.0.1", 0, forwarder)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        # GET / returns mobile phone simulator page
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=5) as resp:
            assert resp.status == 200
            body = resp.read().decode("utf-8")
            assert "SIMULATED SATELLITE — NOT A REAL SPACECRAFT" in body

        # POST valid packet -> forwarded to KesslerX backend
        valid_req = urllib.request.Request(
            f"http://127.0.0.1:{port}/telemetry",
            data=json.dumps(_sample_phone_packet(seq=10, roll=25.0, pitch=5.0)).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(valid_req, timeout=5) as resp:
            assert resp.status == 200
            reply = json.loads(resp.read().decode("utf-8"))
            assert reply["status"] == "forwarded"
            assert reply["ground_station_id"] == "KX-RPI3-GS-001"

        assert len(received_by_backend) == 1
        assert received_by_backend[0]["ground_station_id"] == "KX-RPI3-GS-001"
        assert "received_at" in received_by_backend[0]

        # GET /health confirms KX-RPI3-GS-001 status
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=5) as resp:
            health = json.loads(resp.read().decode("utf-8"))
            assert health["ground_station_id"] == "KX-RPI3-GS-001"
            assert health["forwarded_count"] == 1
    finally:
        server.shutdown()
        server.server_close()
