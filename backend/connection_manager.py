"""Central Connection Manager for KesslerX Network-Independent Ground Station Routing.

Manages:
1. Dynamic local network interface & IP discovery (Wi-Fi / Windows Mobile Hotspot).
2. Targeted Raspberry Pi Zero W gateway discovery (mDNS + manual endpoint + health probe).
3. Hysteresis-protected automatic or manual failover to the Laptop Direct Fallback
   gateway (`KX-LAPTOP-FALLBACK-001`) reusing `raspberry_pi_gateway.gateway`.
4. Dynamic SAN TLS certificate refresh + short-lived pairing tokens (never logged).
5. Non-disruptive Pi recovery notification & controlled switchback (single active forwarder).
6. Read-only Windows Defender Firewall & network profile diagnostics.
"""

from __future__ import annotations

import hmac
import ipaddress
import json
import logging
import os
import platform
import secrets
import shutil
import ssl
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from raspberry_pi_gateway.gateway import (  # noqa: E402
    DEFAULT_GROUND_STATION_ID,
    LAPTOP_FALLBACK_GROUND_STATION_ID,
    LAPTOP_FALLBACK_HARDWARE_MODEL,
    TelemetryForwarder,
    create_gateway_server,
    ensure_self_signed_cert,
)
from raspberry_pi_gateway.network_discovery import (  # noqa: E402
    classify_ipv4,
    discover_local_network,
    probe_gateway_health,
    resolve_mdns_ipv4,
)

logger = logging.getLogger("kesslerx.connection_manager")

PI_DISCOVERY_TIMEOUT_SECONDS = float(os.getenv("PI_DISCOVERY_TIMEOUT_SECONDS", "3"))
PI_HEALTH_CHECK_INTERVAL_SECONDS = float(os.getenv("PI_HEALTH_CHECK_INTERVAL_SECONDS", "5"))
PI_FAILURE_THRESHOLD = int(os.getenv("PI_FAILURE_THRESHOLD", "3"))
FALLBACK_RETRY_INTERVAL_SECONDS = float(os.getenv("FALLBACK_RETRY_INTERVAL_SECONDS", "5"))
NETWORK_REDISCOVERY_INTERVAL_SECONDS = float(os.getenv("NETWORK_REDISCOVERY_INTERVAL_SECONDS", "15"))

DEFAULT_LAPTOP_GATEWAY_HTTP_PORT = int(os.getenv("LAPTOP_GATEWAY_PORT", "8766"))
DEFAULT_LAPTOP_GATEWAY_HTTPS_PORT = int(os.getenv("LAPTOP_GATEWAY_HTTPS_PORT", "8444"))
DEFAULT_PI_HTTP_PORT = int(os.getenv("PI_GATEWAY_PORT", "8765"))
DEFAULT_PI_HTTPS_PORT = int(os.getenv("PI_GATEWAY_HTTPS_PORT", "8443"))
DEFAULT_PI_MDNS_HOSTNAME = os.getenv("PI_MDNS_HOSTNAME", "anishraspberrypizero.local")
DEFAULT_BACKEND_URL = os.getenv("KESSLERX_BACKEND_URL", "https://kesslerx-backend.onrender.com").rstrip("/")
DEFAULT_LAPTOP_DATA_DIR = Path(os.getenv("KESSLERX_LAPTOP_FALLBACK_DIR", str(REPO_ROOT / "backend" / "data")))
PAIRING_TOKEN_TTL_SECONDS = int(os.getenv("PAIRING_TOKEN_TTL_SECONDS", "900"))


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def probe_backend_health(backend_url: str, timeout_s: float = 3.0) -> Dict[str, Any]:
    """Probe the remote/local KesslerX backend /api/health endpoint."""
    url = f"{backend_url.rstrip('/')}/api/health"
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            status = int(resp.getcode() or 200)
            body = resp.read().decode("utf-8", errors="replace")
            parsed = json.loads(body) if body else {}
            return {
                "reachable": 200 <= status < 300,
                "status_code": status,
                "url": url,
                "service_status": parsed.get("status", "ok"),
                "error": None,
            }
    except Exception as exc:
        return {
            "reachable": False,
            "status_code": None,
            "url": url,
            "service_status": "unreachable",
            "error": str(exc),
        }


def inspect_windows_firewall_status(interface_alias: Optional[str] = None) -> Dict[str, Any]:
    """Read-only inspection of Windows Defender Firewall profiles and KesslerX scoped rules."""
    if platform.system() != "Windows":
        return {
            "platform": platform.system(),
            "supported": False,
            "profiles": [],
            "active_interface_profile": None,
            "kesslerx_rules": [],
            "ports_checked": [DEFAULT_LAPTOP_GATEWAY_HTTPS_PORT, DEFAULT_LAPTOP_GATEWAY_HTTP_PORT],
            "public_profile_warning": False,
            "recommended_command": None,
            "summary": "Non-Windows host; configure local host firewall if needed.",
        }

    ps_exe = shutil.which("powershell.exe") or shutil.which("powershell")
    if not ps_exe:
        return {
            "platform": "Windows",
            "supported": False,
            "profiles": [],
            "active_interface_profile": None,
            "kesslerx_rules": [],
            "ports_checked": [DEFAULT_LAPTOP_GATEWAY_HTTPS_PORT, DEFAULT_LAPTOP_GATEWAY_HTTP_PORT],
            "public_profile_warning": False,
            "recommended_command": "powershell -ExecutionPolicy Bypass -File scripts/setup_windows_firewall.ps1",
            "summary": "PowerShell unavailable for firewall inspection.",
        }

    alias_escaped = (interface_alias or "").replace("'", "''")
    ps_script = f"""
$profiles = Get-NetFirewallProfile | Select-Object Name, Enabled, DefaultInboundAction
$rules = Get-NetFirewallRule -DisplayName 'KesslerX*' -ErrorAction SilentlyContinue | ForEach-Object {{
    $pf = $_ | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
    [PSCustomObject]@{{
        DisplayName = $_.DisplayName
        Enabled = [string]$_.Enabled
        Direction = [string]$_.Direction
        Action = [string]$_.Action
        Profile = [string]$_.Profile
        LocalPort = if ($pf) {{ [string]$pf.LocalPort }} else {{ '' }}
    }}
}}
$cp = $null
if ('{alias_escaped}' -ne '') {{
    $cp = Get-NetConnectionProfile -InterfaceAlias '{alias_escaped}' -ErrorAction SilentlyContinue | Select-Object -First 1 InterfaceAlias, NetworkCategory, Name
}} else {{
    $cp = Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object {{ $_.NetworkCategory -ne 'DomainAuthenticated' }} | Select-Object -First 1 InterfaceAlias, NetworkCategory, Name
}}
[PSCustomObject]@{{
    profiles = @($profiles)
    rules = @($rules)
    connection_profile = $cp
}} | ConvertTo-Json -Depth 4 -Compress
""".strip()

    try:
        proc = subprocess.run(
            [ps_exe, "-NoProfile", "-Command", ps_script],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if proc.returncode != 0 or not proc.stdout.strip():
            raise RuntimeError(proc.stderr.strip() or f"exit={proc.returncode}")
        data = json.loads(proc.stdout.strip())
    except Exception as exc:
        return {
            "platform": "Windows",
            "supported": True,
            "profiles": [],
            "active_interface_profile": None,
            "kesslerx_rules": [],
            "ports_checked": [DEFAULT_LAPTOP_GATEWAY_HTTPS_PORT, DEFAULT_LAPTOP_GATEWAY_HTTP_PORT],
            "public_profile_warning": False,
            "recommended_command": "powershell -ExecutionPolicy Bypass -File scripts/setup_windows_firewall.ps1",
            "summary": f"Could not inspect Windows Firewall ({exc}).",
        }

    profiles_raw = data.get("profiles") or []
    if isinstance(profiles_raw, dict):
        profiles_raw = [profiles_raw]
    rules_raw = data.get("rules") or []
    if isinstance(rules_raw, dict):
        rules_raw = [rules_raw]
    cp = data.get("connection_profile") or {}
    net_category = str(cp.get("NetworkCategory") or "") if isinstance(cp, dict) else ""

    profiles = [
        {
            "name": str(p.get("Name", "")),
            "enabled": bool(p.get("Enabled")),
            "default_inbound": str(p.get("DefaultInboundAction", "")),
        }
        for p in profiles_raw
    ]
    rules = [
        {
            "display_name": str(r.get("DisplayName", "")),
            "enabled": str(r.get("Enabled", "")) == "True",
            "direction": str(r.get("Direction", "")),
            "action": str(r.get("Action", "")),
            "profile": str(r.get("Profile", "")),
            "local_port": str(r.get("LocalPort", "")),
        }
        for r in rules_raw
    ]

    public_warning = net_category.lower() == "public"
    private_rule_ok = any(
        r["enabled"] and "Private" in r["profile"] and ("8444" in r["local_port"] or "8766" in r["local_port"])
        for r in rules
    )

    if public_warning:
        summary = (
            "Active Wi-Fi/Hotspot network profile is 'Public'. Switch the Windows network profile "
            "to 'Private' in Windows Settings and run scripts/setup_windows_firewall.ps1."
        )
    elif private_rule_ok:
        summary = "Scoped KesslerX Private-network firewall rules detected for ports 8444 / 8766."
    else:
        summary = (
            "No KesslerX Private-network firewall rule detected for Laptop Fallback ports 8444/8766. "
            "Run scripts/setup_windows_firewall.ps1 (Private profile, LocalSubnet only)."
        )

    return {
        "platform": "Windows",
        "supported": True,
        "profiles": profiles,
        "active_interface_profile": net_category or None,
        "kesslerx_rules": rules,
        "ports_checked": [DEFAULT_LAPTOP_GATEWAY_HTTPS_PORT, DEFAULT_LAPTOP_GATEWAY_HTTP_PORT],
        "public_profile_warning": public_warning,
        "private_rule_configured": private_rule_ok,
        "recommended_command": "powershell -ExecutionPolicy Bypass -File scripts/setup_windows_firewall.ps1",
        "summary": summary,
    }


def _extract_host_from_endpoint(endpoint: str) -> str:
    raw = (endpoint or "").strip()
    if "://" in raw:
        from urllib.parse import urlparse

        parsed = urlparse(raw)
        return parsed.hostname or raw
    return raw.split(":")[0]


def _normalize_manual_pi_endpoint(endpoint: Optional[str]) -> Optional[str]:
    if not endpoint:
        return None
    raw = str(endpoint).strip()
    if not raw:
        return None
    if "://" in raw:
        return raw.rstrip("/")
    # Accept plain IP / hostname optionally with port
    if ":" in raw and raw.count(":") == 1:
        host, port_s = raw.split(":", 1)
        scheme = "https" if port_s in {"8443", "443"} else "http"
        return f"{scheme}://{host}:{port_s}"
    return raw


class ConnectionManager:
    """Central orchestrator for Pi-first routing and Laptop Direct Fallback."""

    def __init__(
        self,
        *,
        backend_url: str = DEFAULT_BACKEND_URL,
        pi_discovery_timeout_seconds: float = PI_DISCOVERY_TIMEOUT_SECONDS,
        pi_health_check_interval_seconds: float = PI_HEALTH_CHECK_INTERVAL_SECONDS,
        pi_failure_threshold: int = PI_FAILURE_THRESHOLD,
        fallback_retry_interval_seconds: float = FALLBACK_RETRY_INTERVAL_SECONDS,
        network_rediscovery_interval_seconds: float = NETWORK_REDISCOVERY_INTERVAL_SECONDS,
        laptop_http_port: int = DEFAULT_LAPTOP_GATEWAY_HTTP_PORT,
        laptop_https_port: int = DEFAULT_LAPTOP_GATEWAY_HTTPS_PORT,
        pi_http_port: int = DEFAULT_PI_HTTP_PORT,
        pi_https_port: int = DEFAULT_PI_HTTPS_PORT,
        pi_mdns_hostname: str = DEFAULT_PI_MDNS_HOSTNAME,
        data_dir: Path = DEFAULT_LAPTOP_DATA_DIR,
        require_pairing_token: bool = True,
        discover_fn: Optional[Callable[[Optional[str]], Dict[str, Any]]] = None,
        resolve_mdns_fn: Optional[Callable[[str, float], Optional[str]]] = None,
        probe_pi_fn: Optional[Callable[[str, int, int, float], Dict[str, Any]]] = None,
        probe_backend_fn: Optional[Callable[[str, float], Dict[str, Any]]] = None,
        firewall_fn: Optional[Callable[[Optional[str]], Dict[str, Any]]] = None,
    ) -> None:
        self.backend_url = backend_url.rstrip("/")
        self.pi_discovery_timeout_seconds = max(0.5, float(pi_discovery_timeout_seconds))
        self.pi_health_check_interval_seconds = max(0.5, float(pi_health_check_interval_seconds))
        self.pi_failure_threshold = max(1, int(pi_failure_threshold))
        self.fallback_retry_interval_seconds = max(0.5, float(fallback_retry_interval_seconds))
        self.network_rediscovery_interval_seconds = max(1.0, float(network_rediscovery_interval_seconds))

        self.laptop_http_port = int(laptop_http_port)
        self.laptop_https_port = int(laptop_https_port)
        self.pi_http_port = int(pi_http_port)
        self.pi_https_port = int(pi_https_port)
        self.pi_mdns_hostname = pi_mdns_hostname
        self.data_dir = Path(data_dir)
        self.cert_dir = self.data_dir / "certs"
        self.sqlite_path = self.data_dir / "laptop_fallback_buffer.sqlite3"
        self.require_pairing_token = bool(require_pairing_token)

        self._discover_fn = discover_fn or discover_local_network
        self._resolve_mdns_fn = resolve_mdns_fn or (
            lambda host, timeout_s=self.pi_discovery_timeout_seconds: resolve_mdns_ipv4(host, timeout_s=timeout_s)
        )
        self._probe_pi_fn = probe_pi_fn or (
            lambda host, hp, hsp, t: probe_gateway_health(host, http_port=hp, https_port=hsp, timeout_s=t)
        )
        self._probe_backend_fn = probe_backend_fn or probe_backend_health
        self._firewall_fn = firewall_fn or inspect_windows_firewall_status

        self._lock = threading.RLock()
        self._stop_event = threading.Event()
        self._monitor_thread: Optional[threading.Thread] = None

        # Routing & discovery state
        self.mode_preference: str = "AUTO"  # "AUTO" | "PI" | "LAPTOP_FALLBACK"
        self.active_mode: str = "SEARCHING"  # "PI" | "LAPTOP_FALLBACK" | "SEARCHING"
        self.selected_interface_ip: Optional[str] = None
        self.detected_network: Dict[str, Any] = {}
        self.manual_pi_endpoint: Optional[str] = None
        self.pi_endpoint: Optional[str] = None
        self.pi_simulator_url: Optional[str] = None
        self.pi_health: Dict[str, Any] = {"reachable": False}
        self.pi_reachable: bool = False
        self.pi_recovered_available: bool = False
        self.consecutive_pi_failures: int = 0
        self.last_pi_check_at: Optional[str] = None
        self.last_network_scan_at: Optional[str] = None
        self.last_backend_probe: Dict[str, Any] = {"reachable": False, "service_status": "unknown"}
        self.last_error: Optional[str] = None
        self.status_warnings: List[str] = []

        # Live fallback gateway resources (created ONLY when LAPTOP_FALLBACK active)
        self._fallback_forwarder: Optional[TelemetryForwarder] = None
        self._fallback_http_server: Optional[Any] = None
        self._fallback_https_server: Optional[Any] = None
        self._fallback_http_thread: Optional[threading.Thread] = None
        self._fallback_https_thread: Optional[threading.Thread] = None
        self._running_gateway_ip: Optional[str] = None
        self._running_http_port: Optional[int] = None
        self._running_https_port: Optional[int] = None
        self._cert_sans: List[str] = []

        # Short-lived pairing token (kept out of logs)
        self._pairing_token: Optional[str] = None
        self._pairing_token_expires_at: Optional[str] = None
        self._pairing_token_expiry_mono: float = 0.0

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self, run_background_loop: bool = True) -> Dict[str, Any]:
        """Run initial discovery and optionally start background health/network monitor."""
        self.discover_and_reconcile(allow_fallback_on_threshold=True)
        if run_background_loop and (self._monitor_thread is None or not self._monitor_thread.is_alive()):
            self._stop_event.clear()
            self._monitor_thread = threading.Thread(
                target=self._monitor_loop,
                name="kesslerx-connection-monitor",
                daemon=True,
            )
            self._monitor_thread.start()
        return self.get_status()

    def stop(self) -> None:
        """Stop background monitoring and tear down any active laptop fallback servers."""
        self._stop_event.set()
        if self._monitor_thread and self._monitor_thread.is_alive():
            self._monitor_thread.join(timeout=3.0)
        self._monitor_thread = None
        with self._lock:
            self._stop_fallback_gateway()

    def _monitor_loop(self) -> None:
        last_health_check = 0.0
        last_network_scan = 0.0
        while not self._stop_event.is_set():
            now = time.monotonic()
            health_interval = (
                self.fallback_retry_interval_seconds
                if self.active_mode == "LAPTOP_FALLBACK"
                else self.pi_health_check_interval_seconds
            )
            if (now - last_health_check) >= health_interval:
                try:
                    self.health_tick()
                except Exception as exc:
                    logger.warning("ConnectionManager health_tick error: %s", exc)
                last_health_check = now
            if (now - last_network_scan) >= self.network_rediscovery_interval_seconds:
                try:
                    self.refresh_network_interfaces()
                except Exception as exc:
                    logger.warning("ConnectionManager network refresh error: %s", exc)
                last_network_scan = now
            self._stop_event.wait(0.5)

    # ------------------------------------------------------------------
    # Discovery & Mode Control
    # ------------------------------------------------------------------

    def refresh_network_interfaces(self, preferred_ip: Optional[str] = None) -> Dict[str, Any]:
        """Re-discover local network adapters and rebind fallback gateway if LAN IP changed."""
        with self._lock:
            target_pref = preferred_ip or self.selected_interface_ip
            detected = self._discover_fn(target_pref)
            self.detected_network = detected
            self.last_network_scan_at = _utc_now_iso()

            new_ip = detected.get("selected_ip")
            ip_changed = bool(new_ip and new_ip != self.selected_interface_ip)
            self.selected_interface_ip = new_ip

            # If fallback is active and the active LAN IP changed cleanly, rebind & refresh SAN cert.
            if (
                self.active_mode == "LAPTOP_FALLBACK"
                and self._fallback_forwarder is not None
                and new_ip
                and (ip_changed or self._running_gateway_ip != new_ip)
            ):
                logger.info(
                    "Detected local LAN IP change (%s -> %s); restarting fallback listener & SAN cert.",
                    self._running_gateway_ip,
                    new_ip,
                )
                self._restart_fallback_gateway(bind_ip=new_ip)
            elif self._fallback_forwarder is not None:
                self._fallback_forwarder.detected_network = str(
                    detected.get("detected_network")
                    or detected.get("network_name")
                    or "Local LAN"
                )

            return detected

    def _probe_raspberry_pi(self, manual_override: Optional[str] = None) -> Dict[str, Any]:
        """Attempt targeted Pi discovery (manual endpoint first, then mDNS hostname)."""
        candidates: List[str] = []
        manual = _normalize_manual_pi_endpoint(manual_override or self.manual_pi_endpoint)
        if manual:
            candidates.append(manual)

        mdns_ip = self._resolve_mdns_fn(self.pi_mdns_hostname, self.pi_discovery_timeout_seconds)
        if mdns_ip:
            candidates.append(mdns_ip)
        elif self.pi_mdns_hostname:
            candidates.append(self.pi_mdns_hostname)

        seen = set()
        last_probe: Dict[str, Any] = {
            "reachable": False,
            "error": "No Raspberry Pi endpoint resolved.",
        }
        for candidate in candidates:
            if candidate in seen:
                continue
            seen.add(candidate)
            result = self._probe_pi_fn(
                candidate,
                self.pi_http_port,
                self.pi_https_port,
                self.pi_discovery_timeout_seconds,
            )
            if result.get("reachable"):
                # Verify it identifies as Raspberry Pi gateway if details exist
                gs_id = result.get("ground_station_id") or DEFAULT_GROUND_STATION_ID
                if gs_id == LAPTOP_FALLBACK_GROUND_STATION_ID:
                    continue
                return result
            last_probe = result
        return last_probe

    def discover_and_reconcile(
        self,
        *,
        preferred_ip: Optional[str] = None,
        manual_pi_endpoint: Optional[str] = None,
        allow_fallback_on_threshold: bool = True,
    ) -> Dict[str, Any]:
        """Perform network discovery + Pi probe and reconcile active operating mode."""
        with self._lock:
            if manual_pi_endpoint is not None:
                cleaned = manual_pi_endpoint.strip()
                self.manual_pi_endpoint = cleaned or None

            self.refresh_network_interfaces(preferred_ip=preferred_ip)
            self.last_backend_probe = self._probe_backend_fn(
                self.backend_url,
                self.pi_discovery_timeout_seconds,
            )

            probe = self._probe_raspberry_pi()
            self.last_pi_check_at = _utc_now_iso()
            self.pi_health = probe

            if probe.get("reachable"):
                self.pi_reachable = True
                self.consecutive_pi_failures = 0
                base_url = str(probe.get("url") or "").rstrip("/")
                host = _extract_host_from_endpoint(base_url)
                https_pi_url = f"https://{host}:{self.pi_https_port}" if host else base_url
                self.pi_endpoint = base_url or https_pi_url
                self.pi_simulator_url = f"{https_pi_url}/simulator" if host else None

                if self.mode_preference == "LAPTOP_FALLBACK":
                    self.pi_recovered_available = True
                    self._ensure_fallback_running()
                elif self.active_mode == "LAPTOP_FALLBACK":
                    # Do NOT kill active phone session automatically mid-demo! Notify operator instead.
                    self.pi_recovered_available = True
                else:
                    self._stop_fallback_gateway()
                    self.active_mode = "PI"
                    self.pi_recovered_available = False
            else:
                self.pi_reachable = False
                self.pi_recovered_available = False
                self.consecutive_pi_failures += 1

                if self.mode_preference == "LAPTOP_FALLBACK":
                    self._ensure_fallback_running()
                elif (
                    self.mode_preference == "AUTO"
                    and allow_fallback_on_threshold
                    and self.consecutive_pi_failures >= self.pi_failure_threshold
                ):
                    self._ensure_fallback_running()
                elif self.mode_preference == "PI":
                    self._stop_fallback_gateway()
                    self.active_mode = "SEARCHING"
                else:
                    # Hysteresis window: not yet at PI_FAILURE_THRESHOLD
                    if self.active_mode not in {"PI", "LAPTOP_FALLBACK"}:
                        self.active_mode = "SEARCHING"

            self._rebuild_warnings()
            return self.get_status()

    def health_tick(self) -> Dict[str, Any]:
        """Execute one health monitoring cycle obeying hysteresis & non-flapping recovery."""
        return self.discover_and_reconcile(allow_fallback_on_threshold=True)

    def switch_mode(self, mode: str, *, force_switch_to_pi: bool = True) -> Dict[str, Any]:
        """Switch requested mode cleanly between AUTO, PI, and LAPTOP_FALLBACK."""
        normalized = (mode or "").strip().upper()
        if normalized in {"RASPBERRY_PI", "RPI"}:
            normalized = "PI"
        elif normalized in {"FALLBACK", "LAPTOP"}:
            normalized = "LAPTOP_FALLBACK"

        if normalized not in {"AUTO", "PI", "LAPTOP_FALLBACK"}:
            raise ValueError("Invalid mode; expected 'AUTO', 'PI', or 'LAPTOP_FALLBACK'.")

        with self._lock:
            self.mode_preference = normalized
            self.refresh_network_interfaces()

            if normalized == "LAPTOP_FALLBACK":
                self.pi_recovered_available = self.pi_reachable
                self._ensure_fallback_running()
                self._rebuild_warnings()
                return self.get_status()

            probe = self._probe_raspberry_pi()
            self.last_pi_check_at = _utc_now_iso()
            self.pi_health = probe

            if normalized == "PI":
                self._stop_fallback_gateway()
                if probe.get("reachable"):
                    self.pi_reachable = True
                    self.consecutive_pi_failures = 0
                    base_url = str(probe.get("url") or "").rstrip("/")
                    host = _extract_host_from_endpoint(base_url)
                    https_pi_url = f"https://{host}:{self.pi_https_port}" if host else base_url
                    self.pi_endpoint = base_url or https_pi_url
                    self.pi_simulator_url = f"{https_pi_url}/simulator" if host else None
                    self.active_mode = "PI"
                    self.pi_recovered_available = False
                else:
                    self.pi_reachable = False
                    self.pi_recovered_available = False
                    self.active_mode = "SEARCHING"
            else:
                # AUTO
                if probe.get("reachable") and (force_switch_to_pi or self.active_mode != "LAPTOP_FALLBACK"):
                    self._stop_fallback_gateway()
                    self.pi_reachable = True
                    self.consecutive_pi_failures = 0
                    base_url = str(probe.get("url") or "").rstrip("/")
                    host = _extract_host_from_endpoint(base_url)
                    https_pi_url = f"https://{host}:{self.pi_https_port}" if host else base_url
                    self.pi_endpoint = base_url or https_pi_url
                    self.pi_simulator_url = f"{https_pi_url}/simulator" if host else None
                    self.active_mode = "PI"
                    self.pi_recovered_available = False
                elif probe.get("reachable"):
                    self.pi_reachable = True
                    self.pi_recovered_available = True
                else:
                    self.pi_reachable = False
                    self.consecutive_pi_failures += 1
                    if self.consecutive_pi_failures >= self.pi_failure_threshold:
                        self._ensure_fallback_running()
                    else:
                        self.active_mode = "SEARCHING"

            self._rebuild_warnings()
            return self.get_status()

    def auto_connect(self) -> Dict[str, Any]:
        """Actively search Pi up to PI_FAILURE_THRESHOLD probes, failing over cleanly if absent."""
        with self._lock:
            self.mode_preference = "AUTO"
            self.consecutive_pi_failures = 0
            self.refresh_network_interfaces()
            probe = self._probe_raspberry_pi()
            self.last_pi_check_at = _utc_now_iso()
            self.pi_health = probe
            self.last_backend_probe = self._probe_backend_fn(
                self.backend_url,
                self.pi_discovery_timeout_seconds,
            )
            if probe.get("reachable"):
                self._stop_fallback_gateway()
                self.pi_reachable = True
                self.pi_recovered_available = False
                base_url = str(probe.get("url") or "").rstrip("/")
                host = _extract_host_from_endpoint(base_url)
                https_pi_url = f"https://{host}:{self.pi_https_port}" if host else base_url
                self.pi_endpoint = base_url or https_pi_url
                self.pi_simulator_url = f"{https_pi_url}/simulator" if host else None
                self.active_mode = "PI"
            else:
                self.pi_reachable = False
                self.pi_recovered_available = False
                # Honor configured failure threshold consistently without stalling indefinitely
                self.consecutive_pi_failures = self.pi_failure_threshold
                self._ensure_fallback_running()
            self._rebuild_warnings()
            return self.get_status()

    def generate_pairing_token(self, ttl_seconds: int = PAIRING_TOKEN_TTL_SECONDS) -> Dict[str, Any]:
        """Generate a short-lived pairing token for phone -> fallback gateway access (never logged)."""
        with self._lock:
            token = secrets.token_urlsafe(24)
            ttl = max(60, int(ttl_seconds))
            expires_dt = datetime.now(timezone.utc) + timedelta(seconds=ttl)
            self._pairing_token = token
            self._pairing_token_expires_at = expires_dt.isoformat().replace("+00:00", "Z")
            self._pairing_token_expiry_mono = time.monotonic() + ttl
            if self._fallback_forwarder is not None:
                self._fallback_forwarder.set_pairing_token(
                    token,
                    ttl_seconds=float(ttl),
                    required=self.require_pairing_token,
                )
            return {
                "pairing_token": token,
                "expires_at": self._pairing_token_expires_at,
                "ttl_seconds": ttl,
                "simulator_url": self._build_simulator_url(include_token=True),
            }

    def validate_pairing_token(self, token: Optional[str]) -> bool:
        """Constant-time check for an active pairing token."""
        with self._lock:
            if not self.require_pairing_token:
                return True
            if not self._pairing_token or time.monotonic() > self._pairing_token_expiry_mono:
                return False
            if not token:
                return False
            return hmac.compare_digest(self._pairing_token, str(token).strip())

    def test_connection(self) -> Dict[str, Any]:
        """Run end-to-end connectivity checks across local adapter, Pi, fallback gateway, and backend."""
        with self._lock:
            net = self.refresh_network_interfaces()
            selected_ip = net.get("selected_ip")
            pi_probe = self._probe_raspberry_pi()
            backend_probe = self._probe_backend_fn(self.backend_url, self.pi_discovery_timeout_seconds)
            self.last_backend_probe = backend_probe

            fallback_probe: Dict[str, Any] = {
                "running": self._fallback_https_server is not None or self._fallback_http_server is not None,
                "reachable": False,
                "url": None,
            }
            if fallback_probe["running"] and self._running_gateway_ip:
                bind_ip = self._running_gateway_ip
                fallback_probe = self._probe_gateway_local(
                    bind_ip,
                    self._running_http_port or self.laptop_http_port,
                    self._running_https_port or self.laptop_https_port,
                )
                fallback_probe["running"] = True

            fw = self._firewall_fn(net.get("selected_interface"))

            diagnostics: List[str] = []
            if not selected_ip:
                diagnostics.append(
                    "No usable private Wi-Fi or Windows Mobile Hotspot IPv4 interface detected."
                )
            if not pi_probe.get("reachable"):
                diagnostics.append(
                    "Raspberry Pi Zero W is currently unreachable on this network; Laptop Direct Fallback is available."
                )
            if fw.get("public_profile_warning"):
                diagnostics.append(
                    "Windows network profile is 'Public'; switch the hotspot/Wi-Fi connection profile to 'Private'."
                )
            elif fw.get("supported") and not fw.get("private_rule_configured"):
                diagnostics.append(
                    "Windows Private firewall rule for ports 8444/8766 is not installed; run scripts/setup_windows_firewall.ps1."
                )
            if not backend_probe.get("reachable"):
                diagnostics.append(
                    f"KesslerX backend ({self.backend_url}) is unreachable; SQLite offline buffering will queue telemetry until recovery."
                )

            return {
                "timestamp": _utc_now_iso(),
                "local_network": {
                    "ok": bool(selected_ip),
                    "selected_ip": selected_ip,
                    "selected_interface": net.get("selected_interface"),
                    "network_name": net.get("detected_network") or net.get("network_name"),
                    "profile_type": net.get("network_category") or net.get("profile_type"),
                },
                "raspberry_pi": pi_probe,
                "laptop_fallback": fallback_probe,
                "backend": backend_probe,
                "firewall": fw,
                "diagnostics": diagnostics,
            }

    def get_firewall_status(self) -> Dict[str, Any]:
        """Return read-only Windows Defender Firewall status for the active interface."""
        with self._lock:
            iface = self.detected_network.get("selected_interface")
        return self._firewall_fn(iface)

    # ------------------------------------------------------------------
    # Internal Fallback Gateway Management
    # ------------------------------------------------------------------

    def _ensure_pairing_token_unlocked(self) -> str:
        if (
            self._pairing_token
            and time.monotonic() < (self._pairing_token_expiry_mono - 30)
        ):
            return self._pairing_token
        token = secrets.token_urlsafe(24)
        expires_dt = datetime.now(timezone.utc) + timedelta(seconds=PAIRING_TOKEN_TTL_SECONDS)
        self._pairing_token = token
        self._pairing_token_expires_at = expires_dt.isoformat().replace("+00:00", "Z")
        self._pairing_token_expiry_mono = time.monotonic() + PAIRING_TOKEN_TTL_SECONDS
        return token

    def _probe_gateway_local(self, host: str, http_port: int, https_port: int) -> Dict[str, Any]:
        url = f"https://{host}:{https_port}/health"
        ctx = ssl._create_unverified_context()
        req = urllib.request.Request(url, method="GET")
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=2.0) as resp:
                body = json.loads(resp.read().decode("utf-8"))
                return {"reachable": True, "url": url, "transport": "https", **body}
        except Exception:
            http_url = f"http://{host}:{http_port}/health"
            try:
                with urllib.request.urlopen(urllib.request.Request(http_url), timeout=2.0) as resp:
                    body = json.loads(resp.read().decode("utf-8"))
                    return {"reachable": True, "url": http_url, "transport": "http", **body}
            except Exception as exc:
                return {"reachable": False, "url": url, "error": str(exc)}

    def _ensure_fallback_running(self) -> None:
        selected_ip = self.selected_interface_ip
        if not selected_ip:
            # Inspect classification — do not fall back to unsafe unvalidated adapters; use 127.0.0.1 only for local loopback continuity
            bind_ip = "127.0.0.1"
        else:
            ok, reason = classify_ipv4(selected_ip)
            bind_ip = selected_ip if ok else "127.0.0.1"
            if not ok:
                logger.warning("Rejected selected IP %s for binding (%s); using 127.0.0.1.", selected_ip, reason)

        if self._fallback_forwarder is not None and self._running_gateway_ip == bind_ip:
            self.active_mode = "LAPTOP_FALLBACK"
            return

        self._restart_fallback_gateway(bind_ip=bind_ip)

    def _restart_fallback_gateway(self, *, bind_ip: str) -> None:
        self._stop_fallback_gateway()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.cert_dir.mkdir(parents=True, exist_ok=True)

        token = self._ensure_pairing_token_unlocked()
        net_label = str(
            self.detected_network.get("detected_network")
            or self.detected_network.get("network_name")
            or "Local LAN"
        )
        forwarder = TelemetryForwarder(
            backend_url=self.backend_url,
            sqlite_path=self.sqlite_path,
            ground_station_id=LAPTOP_FALLBACK_GROUND_STATION_ID,
            hardware_model=LAPTOP_FALLBACK_HARDWARE_MODEL,
            gateway_mode="laptop_fallback",
            listen_host=bind_ip,
            detected_network=net_label,
            require_pairing_token=self.require_pairing_token,
        )
        remaining_ttl = max(60.0, self._pairing_token_expiry_mono - time.monotonic())
        forwarder.set_pairing_token(token, ttl_seconds=remaining_ttl, required=self.require_pairing_token)
        forwarder.start()

        cert_ips = [bind_ip]
        if bind_ip != "127.0.0.1":
            cert_ips.append("127.0.0.1")

        certfile: Optional[Path] = None
        keyfile: Optional[Path] = None
        try:
            certfile, keyfile = ensure_self_signed_cert(
                self.cert_dir,
                gs_id=LAPTOP_FALLBACK_GROUND_STATION_ID,
                extra_ips=cert_ips,
            )
            self._cert_sans = [f"IP:{ip}" for ip in cert_ips]
        except Exception as exc:
            logger.warning("Could not generate dynamic HTTPS SAN cert (%s); HTTP fallback only.", exc)
            self._cert_sans = []

        try:
            http_srv = create_gateway_server(bind_ip, self.laptop_http_port, forwarder)
            http_port = int(http_srv.server_address[1])
            http_thread = threading.Thread(
                target=http_srv.serve_forever,
                name="kesslerx-fallback-http",
                daemon=True,
            )
            http_thread.start()
        except Exception as exc:
            forwarder.close()
            self.last_error = f"Failed to start fallback HTTP listener on {bind_ip}:{self.laptop_http_port}: {exc}"
            logger.error(self.last_error)
            raise

        https_srv = None
        https_port: Optional[int] = None
        https_thread: Optional[threading.Thread] = None
        if certfile and keyfile:
            try:
                https_srv = create_gateway_server(
                    bind_ip,
                    self.laptop_https_port,
                    forwarder,
                    certfile=certfile,
                    keyfile=keyfile,
                )
                https_port = int(https_srv.server_address[1])
                https_thread = threading.Thread(
                    target=https_srv.serve_forever,
                    name="kesslerx-fallback-https",
                    daemon=True,
                )
                https_thread.start()
            except Exception as exc:
                self.last_error = f"Fallback HTTPS listener warning ({bind_ip}:{self.laptop_https_port}): {exc}"
                logger.warning(self.last_error)

        self._fallback_forwarder = forwarder
        self._fallback_http_server = http_srv
        self._fallback_https_server = https_srv
        self._fallback_http_thread = http_thread
        self._fallback_https_thread = https_thread
        self._running_gateway_ip = bind_ip
        self._running_http_port = http_port
        self._running_https_port = https_port
        self.active_mode = "LAPTOP_FALLBACK"
        self.last_error = None
        logger.info(
            "Laptop Direct Fallback active (%s) on %s (HTTPS=%s, HTTP=%s).",
            LAPTOP_FALLBACK_GROUND_STATION_ID,
            bind_ip,
            https_port,
            http_port,
        )

    def _stop_fallback_gateway(self) -> None:
        if self._fallback_https_server is not None:
            try:
                self._fallback_https_server.shutdown()
                self._fallback_https_server.server_close()
            except Exception:
                pass
        if self._fallback_http_server is not None:
            try:
                self._fallback_http_server.shutdown()
                self._fallback_http_server.server_close()
            except Exception:
                pass
        if self._fallback_forwarder is not None:
            try:
                self._fallback_forwarder.close()
            except Exception:
                pass
        self._fallback_https_server = None
        self._fallback_http_server = None
        self._fallback_https_thread = None
        self._fallback_http_thread = None
        self._fallback_forwarder = None
        self._running_gateway_ip = None
        self._running_http_port = None
        self._running_https_port = None
        self._cert_sans = []

    def _build_simulator_url(self, *, include_token: bool = True) -> Optional[str]:
        if self.active_mode == "PI" and self.pi_simulator_url:
            return self.pi_simulator_url
        if self.active_mode == "LAPTOP_FALLBACK":
            ip = self._running_gateway_ip or self.selected_interface_ip
            if not ip:
                return None
            if self._running_https_port:
                base = f"https://{ip}:{self._running_https_port}/simulator"
            elif self._running_http_port:
                base = f"http://{ip}:{self._running_http_port}/simulator"
            else:
                base = f"https://{ip}:{self.laptop_https_port}/simulator"
            if include_token and self.require_pairing_token and self._pairing_token:
                return f"{base}?token={self._pairing_token}"
            return base
        return None

    def _rebuild_warnings(self) -> None:
        warnings: List[str] = []
        if self.active_mode == "LAPTOP_FALLBACK":
            warnings.append(
                "Emergency laptop fallback gateway active (physical Raspberry Pi Zero W unavailable)."
            )
            if self.pi_recovered_available:
                warnings.append(
                    "Raspberry Pi Zero W is back online on the network. Click 'Switch to Raspberry Pi' when ready."
                )
        elif self.active_mode == "SEARCHING":
            warnings.append("Searching for Raspberry Pi Zero W gateway...")

        if self.detected_network.get("network_category", self.detected_network.get("profile_type")) == "Public":
            warnings.append(
                "Windows network profile is 'Public'. Switch hotspot/Wi-Fi to 'Private' so the phone can connect."
            )
        if not self.detected_network.get("selected_ip"):
            warnings.append("No usable local Wi-Fi or hotspot IPv4 adapter detected.")
        self.status_warnings = warnings

    def get_status(self) -> Dict[str, Any]:
        """Return full serializable ConnectionManager status snapshot."""
        with self._lock:
            net = dict(self.detected_network)
            if self.active_mode == "PI":
                active_gs_id = DEFAULT_GROUND_STATION_ID
                hw_model = str(self.pi_health.get("hardware_model") or "Raspberry Pi Zero W")
                gateway_status_block = dict(self.pi_health)
            elif self.active_mode == "LAPTOP_FALLBACK":
                active_gs_id = LAPTOP_FALLBACK_GROUND_STATION_ID
                hw_model = LAPTOP_FALLBACK_HARDWARE_MODEL
                gateway_status_block = (
                    self._fallback_forwarder.get_status()
                    if self._fallback_forwarder is not None
                    else {}
                )
            else:
                active_gs_id = DEFAULT_GROUND_STATION_ID
                hw_model = "Raspberry Pi Zero W"
                gateway_status_block = {}

            fallback_active = self.active_mode == "LAPTOP_FALLBACK" and self._fallback_forwarder is not None
            token_active = bool(
                fallback_active
                and self._pairing_token
                and time.monotonic() < self._pairing_token_expiry_mono
            )

            return {
                "mode_preference": self.mode_preference,
                "active_mode": self.active_mode,
                "ground_station_id": active_gs_id,
                "hardware_model": hw_model,
                "detected_network": {
                    "selected_ip": self.selected_interface_ip,
                    "selected_interface": net.get("selected_interface"),
                    "network_name": net.get("detected_network") or net.get("network_name"),
                    "profile_type": net.get("network_category") or net.get("profile_type"),
                    "connection_kind": net.get("selected_kind") or net.get("connection_kind"),
                    "hotspot_active": bool(net.get("hotspot_active", False)),
                    "subnet_cidr": net.get("subnet_cidr"),
                    "hostname": net.get("hostname"),
                    "interfaces": net.get("usable_interfaces") or net.get("interfaces", []),
                },
                "raspberry_pi": {
                    "reachable": self.pi_reachable,
                    "endpoint": self.pi_endpoint,
                    "manual_endpoint": self.manual_pi_endpoint,
                    "mdns_hostname": self.pi_mdns_hostname,
                    "simulator_url": self.pi_simulator_url,
                    "consecutive_failures": self.consecutive_pi_failures,
                    "failure_threshold": self.pi_failure_threshold,
                    "recovered_available": self.pi_recovered_available,
                    "last_checked_at": self.last_pi_check_at,
                },
                "laptop_fallback": {
                    "active": fallback_active,
                    "ground_station_id": LAPTOP_FALLBACK_GROUND_STATION_ID,
                    "hardware_model": LAPTOP_FALLBACK_HARDWARE_MODEL,
                    "bind_ip": self._running_gateway_ip,
                    "http_port": self._running_http_port or self.laptop_http_port,
                    "https_port": self._running_https_port or self.laptop_https_port,
                    "cert_sans": list(self._cert_sans),
                    "sqlite_buffered_rows": gateway_status_block.get("sqlite_rows", 0),
                    "packets_accepted": gateway_status_block.get("accepted_packets", 0),
                    "packets_forwarded": gateway_status_block.get("forwarded_packets", 0),
                    "ws_clients": gateway_status_block.get("ws_clients", 0),
                },
                "simulator": {
                    "url": self._build_simulator_url(include_token=False),
                    "url_with_token": self._build_simulator_url(include_token=True),
                    "pairing_token": self._pairing_token if token_active else None,
                    "pairing_token_expires_at": self._pairing_token_expires_at if token_active else None,
                    "pairing_required": self.require_pairing_token if fallback_active else False,
                },
                "backend": {
                    "url": self.backend_url,
                    **self.last_backend_probe,
                },
                "warnings": list(self.status_warnings),
                "last_error": self.last_error,
                "config": {
                    "pi_discovery_timeout_seconds": self.pi_discovery_timeout_seconds,
                    "pi_health_check_interval_seconds": self.pi_health_check_interval_seconds,
                    "pi_failure_threshold": self.pi_failure_threshold,
                    "fallback_retry_interval_seconds": self.fallback_retry_interval_seconds,
                    "network_rediscovery_interval_seconds": self.network_rediscovery_interval_seconds,
                },
            }


connection_manager = ConnectionManager()
