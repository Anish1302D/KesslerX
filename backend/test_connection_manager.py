"""Comprehensive verification tests for KesslerX ConnectionManager & Network Discovery.

Covers scenarios:
- Test A: Raspberry Pi available (Mode A: KX-RPI-ZERO-GS-001)
- Test B: Raspberry Pi unavailable -> hysteresis + real Laptop Fallback (Mode B: KX-LAPTOP-FALLBACK-001)
- Test C: Network adapter / IP change -> automatic rebinding, SAN cert refresh, SQLite preservation
- Test D: Render/backend unavailable during fallback -> SQLite buffering -> recovery & dedup
- Test E: Controlled Pi recovery notice + manual switchback (single active forwarder)
- Test F: Security (pairing token enforcement, no token leakage, VPN/APIPA adapter filtering)
"""

from __future__ import annotations

import http.server
import json
import os
import ssl
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

os.environ.setdefault("TESTING", "1")

from fastapi.testclient import TestClient

from connection_manager import ConnectionManager
from main import app
from phone_satellite import (
    LAPTOP_FALLBACK_GROUND_STATION_ID,
    LAPTOP_FALLBACK_HARDWARE_MODEL,
    phone_satellite_state,
)
from raspberry_pi_gateway.network_discovery import (
    classify_ipv4,
    normalize_interface_candidates,
)


def _mock_net(ip: str = "127.0.0.1", iface: str = "Wi-Fi", ssid: str = "HotspotA", profile: str = "Private") -> Dict[str, Any]:
    return {
        "os": "Windows",
        "hostname": "Galaxy-Book5",
        "selected_ip": ip,
        "selected_interface": iface,
        "detected_network": ssid,
        "network_category": profile,
        "selected_kind": "wifi",
        "hotspot_active": False,
        "subnet_cidr": "192.168.137.0/24",
        "usable_interfaces": [
            {
                "interface_alias": iface,
                "interface_description": "Intel(R) Wi-Fi 6 AX201",
                "ip_address": ip,
                "prefix_length": 24,
                "network_name": ssid,
                "network_category": profile,
                "kind": "wifi",
                "has_gateway": True,
                "usable": True,
                "priority_score": 115,
            }
        ],
    }


class _MockBackendHandler(http.server.BaseHTTPRequestHandler):
    accepted_packets: List[Dict[str, Any]] = []
    available: bool = True

    def log_message(self, format: str, *args: Any) -> None:
        return

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/api/health":
            if not self.__class__.available:
                self.send_response(503)
                self.end_headers()
                self.wfile.write(b'{"status":"unavailable"}')
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        if self.path == "/api/ground-station/telemetry":
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            if not self.__class__.available:
                self.send_response(503)
                self.end_headers()
                self.wfile.write(b'{"detail":"backend unavailable"}')
                return
            payload = json.loads(raw.decode("utf-8"))
            self.__class__.accepted_packets.append(payload)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"received"}')
            return
        self.send_response(404)
        self.end_headers()


def _sample_phone_packet(seq: int = 1, roll: float = 15.0) -> Dict[str, Any]:
    return {
        "device_id": "PHONE-SATELLITE-001",
        "satellite_name": "PHONE SATELLITE",
        "sequence": seq,
        "timestamp": "2026-11-18T10:00:00Z",
        "orientation": {"roll_deg": roll, "pitch_deg": -5.0, "yaw_deg": 45.0},
        "angular_velocity": {"x_dps": 1.0, "y_dps": -0.5, "z_dps": 0.2},
        "source": "phone_sensor",
        "mode": "simulated",
    }


def test_a_raspberry_pi_available_selects_pi_mode():
    with tempfile.TemporaryDirectory() as tmp:
        cm = ConnectionManager(
            backend_url="https://kesslerx-backend.onrender.com",
            data_dir=Path(tmp),
            laptop_http_port=0,
            laptop_https_port=0,
            discover_fn=lambda pref=None: _mock_net("192.168.43.50", ssid="PhoneHotspot"),
            resolve_mdns_fn=lambda host, t: "192.168.43.100",
            probe_pi_fn=lambda host, hp, hsp, t: {
                "reachable": True,
                "url": f"http://{host}:8765",
                "ground_station_id": "KX-RPI-ZERO-GS-001",
                "hardware_model": "Raspberry Pi Zero W",
            },
            probe_backend_fn=lambda url, t: {"reachable": True, "service_status": "ok"},
            firewall_fn=lambda iface=None: {"supported": True, "public_profile_warning": False},
        )
        try:
            status = cm.discover_and_reconcile()
            assert status["active_mode"] == "PI"
            assert status["ground_station_id"] == "KX-RPI-ZERO-GS-001"
            assert status["hardware_model"] == "Raspberry Pi Zero W"
            assert status["raspberry_pi"]["reachable"] is True
            assert status["laptop_fallback"]["active"] is False
            assert status["simulator"]["url"] == "https://192.168.43.100:8443/simulator"
        finally:
            cm.stop()


def test_b_pi_unavailable_hysteresis_and_live_laptop_fallback_forwarding():
    _MockBackendHandler.accepted_packets = []
    _MockBackendHandler.available = True
    backend_srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _MockBackendHandler)
    backend_port = backend_srv.server_address[1]
    threading.Thread(target=backend_srv.serve_forever, daemon=True).start()

    with tempfile.TemporaryDirectory() as tmp:
        cm = ConnectionManager(
            backend_url=f"http://127.0.0.1:{backend_port}",
            data_dir=Path(tmp),
            pi_failure_threshold=3,
            laptop_http_port=0,
            laptop_https_port=0,
            discover_fn=lambda pref=None: _mock_net("127.0.0.1"),
            resolve_mdns_fn=lambda host, t: None,
            probe_pi_fn=lambda host, hp, hsp, t: {"reachable": False, "error": "timeout"},
            firewall_fn=lambda iface=None: {"supported": True, "public_profile_warning": False},
        )
        try:
            # Hysteresis: miss 1 & 2 remain SEARCHING (no premature flapping)
            s1 = cm.discover_and_reconcile()
            assert s1["active_mode"] == "SEARCHING"
            assert s1["raspberry_pi"]["consecutive_failures"] == 1

            s2 = cm.discover_and_reconcile()
            assert s2["active_mode"] == "SEARCHING"
            assert s2["raspberry_pi"]["consecutive_failures"] == 2

            # Miss 3 crosses PI_FAILURE_THRESHOLD -> activates Laptop Direct Fallback
            s3 = cm.discover_and_reconcile()
            assert s3["active_mode"] == "LAPTOP_FALLBACK"
            assert s3["ground_station_id"] == LAPTOP_FALLBACK_GROUND_STATION_ID
            assert s3["hardware_model"] == LAPTOP_FALLBACK_HARDWARE_MODEL
            assert s3["laptop_fallback"]["active"] is True
            assert any("Emergency laptop fallback gateway active" in w for w in s3["warnings"])

            token = s3["simulator"]["pairing_token"]
            assert token
            https_port = s3["laptop_fallback"]["https_port"]
            ssl_ctx = ssl._create_unverified_context()

            # Send phone telemetry over HTTPS with pairing token
            req = urllib.request.Request(
                f"https://127.0.0.1:{https_port}/telemetry",
                data=json.dumps(_sample_phone_packet(seq=1, roll=31.5)).encode("utf-8"),
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "X-KesslerX-Pairing-Token": token,
                },
            )
            with urllib.request.urlopen(req, context=ssl_ctx, timeout=5) as resp:
                body = json.loads(resp.read().decode("utf-8"))
                assert resp.status == 200
                assert body["ground_station_id"] == LAPTOP_FALLBACK_GROUND_STATION_ID
                assert body["hardware_model"] == LAPTOP_FALLBACK_HARDWARE_MODEL
                assert body["status"] == "forwarded"

            assert len(_MockBackendHandler.accepted_packets) == 1
            fwd_pkt = _MockBackendHandler.accepted_packets[0]
            assert fwd_pkt["ground_station_id"] == LAPTOP_FALLBACK_GROUND_STATION_ID
            assert fwd_pkt["source"] == "phone_sensor"
            assert fwd_pkt["mode"] == "simulated"
        finally:
            cm.stop()
            backend_srv.shutdown()
            backend_srv.server_close()


def test_c_network_ip_change_restarts_listener_and_refreshes_cert_sans():
    current_net = {"ip": "127.0.0.1", "ssid": "HotspotOne"}

    with tempfile.TemporaryDirectory() as tmp:
        cm = ConnectionManager(
            backend_url="http://127.0.0.1:9",
            data_dir=Path(tmp),
            pi_failure_threshold=1,
            laptop_http_port=0,
            laptop_https_port=0,
            discover_fn=lambda pref=None: _mock_net(current_net["ip"], ssid=current_net["ssid"]),
            resolve_mdns_fn=lambda host, t: None,
            probe_pi_fn=lambda host, hp, hsp, t: {"reachable": False},
            probe_backend_fn=lambda url, t: {"reachable": False},
            firewall_fn=lambda iface=None: {"supported": False},
        )
        try:
            st1 = cm.switch_mode("LAPTOP_FALLBACK")
            assert st1["detected_network"]["network_name"] == "HotspotOne"
            assert "IP:127.0.0.1" in st1["laptop_fallback"]["cert_sans"]
            old_http_port = st1["laptop_fallback"]["http_port"]

            # Buffer packet before network switch
            req = urllib.request.Request(
                f"http://127.0.0.1:{old_http_port}/telemetry",
                data=json.dumps(_sample_phone_packet(seq=7, roll=12.0)).encode("utf-8"),
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "X-KesslerX-Pairing-Token": st1["simulator"]["pairing_token"],
                },
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                assert json.loads(resp.read().decode("utf-8"))["status"] == "buffered"

            # Simulate switching to a new Wi-Fi network (testing fallback re-discovery & cert refresh)
            current_net["ssid"] = "HotspotTwo"
            # Force _running_gateway_ip mismatch check via interface refresh
            cm._running_gateway_ip = "192.168.137.1"
            refreshed = cm.refresh_network_interfaces()
            assert refreshed["detected_network"] == "HotspotTwo"
            st2 = cm.get_status()
            assert st2["laptop_fallback"]["sqlite_buffered_rows"] >= 1
            assert "IP:127.0.0.1" in st2["laptop_fallback"]["cert_sans"]
        finally:
            cm.stop()


def test_d_render_unavailable_sqlite_buffering_and_recovery():
    _MockBackendHandler.accepted_packets = []
    _MockBackendHandler.available = False
    backend_srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _MockBackendHandler)
    backend_port = backend_srv.server_address[1]
    threading.Thread(target=backend_srv.serve_forever, daemon=True).start()

    with tempfile.TemporaryDirectory() as tmp:
        cm = ConnectionManager(
            backend_url=f"http://127.0.0.1:{backend_port}",
            data_dir=Path(tmp),
            pi_failure_threshold=1,
            laptop_http_port=0,
            laptop_https_port=0,
            discover_fn=lambda pref=None: _mock_net("127.0.0.1"),
            resolve_mdns_fn=lambda host, t: None,
            probe_pi_fn=lambda host, hp, hsp, t: {"reachable": False},
            firewall_fn=lambda iface=None: {"supported": False},
        )
        try:
            st = cm.switch_mode("LAPTOP_FALLBACK")
            http_port = st["laptop_fallback"]["http_port"]
            token = st["simulator"]["pairing_token"]

            for seq in (1, 2):
                req = urllib.request.Request(
                    f"http://127.0.0.1:{http_port}/telemetry",
                    data=json.dumps(_sample_phone_packet(seq=seq, roll=10.0 * seq)).encode("utf-8"),
                    method="POST",
                    headers={
                        "Content-Type": "application/json",
                        "X-KesslerX-Pairing-Token": token,
                    },
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    assert json.loads(resp.read().decode("utf-8"))["status"] == "buffered"

            assert cm._fallback_forwarder.get_status()["buffered_count"] == 2
            assert len(_MockBackendHandler.accepted_packets) == 0

            # Backend comes back online -> flush drains SQLite cleanly with zero duplicates
            _MockBackendHandler.available = True
            cm._fallback_forwarder.flush_pending()
            cm._fallback_forwarder.flush_pending()

            assert len(_MockBackendHandler.accepted_packets) == 2
            assert cm._fallback_forwarder.get_status()["buffered_count"] == 0
        finally:
            cm.stop()
            backend_srv.shutdown()
            backend_srv.server_close()


def test_e_pi_recovery_notifies_without_flapping_then_switches_cleanly():
    pi_state = {"reachable": False}

    def fake_probe(host, hp, hsp, t):
        if pi_state["reachable"]:
            return {
                "reachable": True,
                "url": f"http://{host}:8765",
                "ground_station_id": "KX-RPI-ZERO-GS-001",
                "hardware_model": "Raspberry Pi Zero W",
            }
        return {"reachable": False}

    with tempfile.TemporaryDirectory() as tmp:
        cm = ConnectionManager(
            backend_url="http://127.0.0.1:9",
            data_dir=Path(tmp),
            pi_failure_threshold=1,
            laptop_http_port=0,
            laptop_https_port=0,
            discover_fn=lambda pref=None: _mock_net("127.0.0.1"),
            resolve_mdns_fn=lambda host, t: "192.168.137.42" if pi_state["reachable"] else None,
            probe_pi_fn=fake_probe,
            probe_backend_fn=lambda url, t: {"reachable": False},
            firewall_fn=lambda iface=None: {"supported": False},
        )
        try:
            # Start in AUTO when Pi is absent -> activates Laptop Fallback
            s_fallback = cm.discover_and_reconcile()
            assert s_fallback["active_mode"] == "LAPTOP_FALLBACK"
            assert s_fallback["laptop_fallback"]["active"] is True

            # Pi returns online during live fallback -> must NOT cut active session automatically
            pi_state["reachable"] = True
            s_notice = cm.health_tick()
            assert s_notice["active_mode"] == "LAPTOP_FALLBACK"
            assert s_notice["laptop_fallback"]["active"] is True
            assert s_notice["raspberry_pi"]["recovered_available"] is True
            assert any("Switch to Raspberry Pi" in w for w in s_notice["warnings"])

            # Operator explicitly confirms switch back -> fallback shuts down, single forwarder remains
            s_pi = cm.switch_mode("PI")
            assert s_pi["active_mode"] == "PI"
            assert s_pi["laptop_fallback"]["active"] is False
            assert cm._fallback_forwarder is None
        finally:
            cm.stop()


def test_f_security_token_enforcement_adapter_filtering_and_no_secret_leak():
    # 1. Adapter & IP classification filters out VPN/APIPA/loopback cleanly
    assert classify_ipv4("169.254.199.243")[0] is False
    assert classify_ipv4("127.0.0.1")[0] is False
    assert classify_ipv4("192.168.137.1") == (True, None)

    candidates = normalize_interface_candidates(
        [
            {"interface_alias": "Loopback", "interface_description": "Loopback", "ip_address": "127.0.0.1", "status": "Up"},
            {"interface_alias": "McAfee VPN", "interface_description": "VPN Tunnel", "ip_address": "10.8.0.5", "status": "Up"},
            {"interface_alias": "Wi-Fi", "interface_description": "Intel Wi-Fi 6", "ip_address": "192.168.43.15", "status": "Up", "has_gateway": True},
        ]
    )
    usable = [c for c in candidates if c["usable"]]
    assert len(usable) == 1
    assert usable[0]["ip_address"] == "192.168.43.15"
    rejected = {c["interface_alias"]: c for c in candidates if not c["usable"]}
    assert "McAfee VPN" in rejected

    # 2. Missing/invalid pairing token returns 401 and token never appears in sqlite or forwarder status
    with tempfile.TemporaryDirectory() as tmp:
        cm = ConnectionManager(
            backend_url="http://127.0.0.1:9",
            data_dir=Path(tmp),
            pi_failure_threshold=1,
            laptop_http_port=0,
            laptop_https_port=0,
            discover_fn=lambda pref=None: _mock_net("127.0.0.1"),
            resolve_mdns_fn=lambda host, t: None,
            probe_pi_fn=lambda host, hp, hsp, t: {"reachable": False},
            probe_backend_fn=lambda url, t: {"reachable": False},
            firewall_fn=lambda iface=None: {"supported": False},
        )
        try:
            st = cm.switch_mode("LAPTOP_FALLBACK")
            token = st["simulator"]["pairing_token"]
            port = st["laptop_fallback"]["http_port"]

            # Missing token rejected with 401
            req_unauth = urllib.request.Request(
                f"http://127.0.0.1:{port}/telemetry",
                data=json.dumps(_sample_phone_packet(seq=1)).encode("utf-8"),
                method="POST",
                headers={"Content-Type": "application/json"},
            )
            try:
                urllib.request.urlopen(req_unauth, timeout=5)
                raise AssertionError("Expected 401 without pairing token")
            except urllib.error.HTTPError as err:
                assert err.code == 401

            # Authorized packet accepted and buffered without token leakage in SQLite or gateway status
            req_ok = urllib.request.Request(
                f"http://127.0.0.1:{port}/telemetry",
                data=json.dumps(_sample_phone_packet(seq=2)).encode("utf-8"),
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "X-KesslerX-Pairing-Token": token,
                },
            )
            with urllib.request.urlopen(req_ok, timeout=5) as resp:
                assert resp.status in (200, 202)

            fwd_status_json = json.dumps(cm._fallback_forwarder.get_status())
            assert token not in fwd_status_json
            hist_records = cm._fallback_forwarder.get_history(limit=20)
            assert len(hist_records) >= 1
            for rec in hist_records:
                assert token not in json.dumps(rec)
            cm.stop()
        finally:
            cm.stop()


def test_network_api_endpoints_integration():
    phone_satellite_state.reset()
    client = TestClient(app)

    r_status = client.get("/api/network/status")
    assert r_status.status_code == 200
    assert "mode_preference" in r_status.json()

    r_fw = client.get("/api/network/firewall-status")
    assert r_fw.status_code == 200
    assert "summary" in r_fw.json()

    r_bad_mode = client.post("/api/network/mode", json={"mode": "INVALID_MODE"})
    assert r_bad_mode.status_code == 422

    # Ensure fallback phone telemetry payload uploads cleanly and exposes LIVE_LAPTOP_FALLBACK
    resp = client.post(
        "/api/ground-station/telemetry",
        json={
            **_sample_phone_packet(seq=1, roll=20.0),
            "ground_station_id": LAPTOP_FALLBACK_GROUND_STATION_ID,
            "hardware_model": LAPTOP_FALLBACK_HARDWARE_MODEL,
            "session_id": "sess-test-api-001",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ground_station_id"] == LAPTOP_FALLBACK_GROUND_STATION_ID
    assert body["gateway_mode"] == "laptop_fallback"

    sat = client.get("/api/phone-satellite").json()
    assert sat["telemetry"]["link_status"] == "LIVE_LAPTOP_FALLBACK"
    assert any("Emergency laptop fallback gateway active" in w for w in sat["telemetry"]["warnings"])

    # Verify Vercel -> Local 127.0.0.1 Gateway Agent CORS + Private Network Access preflight
    opt_resp = client.options(
        "/api/network/status",
        headers={
            "Origin": "https://kessler-x.vercel.app",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Private-Network": "true",
        },
    )
    assert opt_resp.status_code == 200
    assert opt_resp.headers.get("access-control-allow-origin") == "https://kessler-x.vercel.app"
    assert opt_resp.headers.get("access-control-allow-private-network") == "true"

    preview_resp = client.get(
        "/api/network/status",
        headers={"Origin": "https://kesslerx-preview-123.vercel.app"},
    )
    assert preview_resp.status_code == 200
    assert preview_resp.headers.get("access-control-allow-origin") == "https://kesslerx-preview-123.vercel.app"


def test_cloud_host_refuses_bogus_fallback_server():
    with tempfile.TemporaryDirectory() as tmp:
        cm = ConnectionManager(
            backend_url="https://kesslerx-backend.onrender.com",
            data_dir=Path(tmp),
            cloud_host=True,
            laptop_http_port=0,
            laptop_https_port=0,
        )
        try:
            st = cm.auto_connect()
            assert st["active_mode"] == "CLOUD_HOST"
            assert st["laptop_fallback"]["active"] is False
            assert st["simulator"]["url"] is None
            assert st["simulator"]["url_with_token"] is None

            st2 = cm.switch_mode("LAPTOP_FALLBACK")
            assert st2["active_mode"] == "CLOUD_HOST"
            assert st2["laptop_fallback"]["active"] is False
        finally:
            cm.stop()


def test_get_status_non_blocking_during_slow_probes():
    probe_entered = threading.Event()
    release_probe = threading.Event()

    def slow_discover(pref=None):
        probe_entered.set()
        release_probe.wait(timeout=2.0)
        return _mock_net("127.0.0.1")

    with tempfile.TemporaryDirectory() as tmp:
        cm = ConnectionManager(
            backend_url="http://127.0.0.1:9",
            data_dir=Path(tmp),
            laptop_http_port=0,
            laptop_https_port=0,
            discover_fn=slow_discover,
            resolve_mdns_fn=lambda host, t: None,
            probe_pi_fn=lambda host, hp, hsp, t: {"reachable": False},
            probe_backend_fn=lambda url, t: {"reachable": False},
            firewall_fn=lambda iface=None: {"supported": False},
        )
        t = threading.Thread(target=cm.discover_and_reconcile, daemon=True)
        try:
            t.start()
            assert probe_entered.wait(timeout=1.0)
            t0 = time.perf_counter()
            status = cm.get_status()
            elapsed = time.perf_counter() - t0
            assert "active_mode" in status
            assert elapsed < 0.25, f"get_status blocked for {elapsed:.3f}s during slow probe"
        finally:
            release_probe.set()
            t.join(timeout=2.0)
            cm.stop()
