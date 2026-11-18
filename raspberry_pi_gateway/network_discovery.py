"""
KesslerX Dynamic Network Interface, Hotspot & mDNS Discovery
==========================================================

Shared Python 3 standard-library utility running on both Windows 11 laptops
and Raspberry Pi OS (armv6l) without hardcoded IPs or SSIDs.

Capabilities:
- Discovers active IPv4 adapters, Wi-Fi SSIDs, and Windows Mobile Hotspot AP adapters.
- Excludes loopback, APIPA (169.254.0.0/16), disconnected NICs, VPNs, and virtual switches.
- Discovers the Raspberry Pi Zero W ground station via mDNS (anishraspberrypizero.local)
  or explicit configured/manual endpoints — never scans whole subnets indiscriminately.
- Reports Windows Firewall Private/Public network profile status cleanly without secrets.
"""

from __future__ import annotations

import ipaddress
import json
import logging
import os
import platform
import re
import socket
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple


logger = logging.getLogger("kx_network_discovery")

EXCLUDED_ADAPTER_TOKENS = (
    "loopback",
    "vpn",
    "mcafee",
    "wireguard",
    "tailscale",
    "zerotier",
    "nordlynx",
    "proton",
    "cisco",
    "anyconnect",
    "openconnect",
    "fortinet",
    "GlobalProtect",
    "vethernet",
    "hyper-v",
    "vmware",
    "virtualbox",
    "vbox",
    "wsl",
    "docker",
    "bluetooth",
    "npcap",
    "tap-windows",
    "wintun",
    "teredo",
    "isatap",
)


def is_excluded_adapter_name(alias: str, description: str = "") -> Optional[str]:
    """Return exclusion reason if adapter is VPN, virtual, Bluetooth, or loopback."""
    combined = f"{alias} {description}".lower()
    if "local area connection*" in alias.lower() or "wi-fi direct virtual" in combined:
        # Windows Mobile Hotspot uses Microsoft Wi-Fi Direct Virtual Adapter ("Local Area Connection* N").
        # Allow it when it holds a valid non-APIPA private IPv4 (e.g. 192.168.137.1); exclude only if APIPA.
        return None
    for token in EXCLUDED_ADAPTER_TOKENS:
        if token.lower() in combined:
            return f"Excluded virtual/VPN/non-LAN adapter ({token})"
    return None


def classify_ipv4(ip_str: str) -> Tuple[bool, Optional[str]]:
    """Validate whether an IPv4 address is a usable private LAN/hotspot address."""
    try:
        ip_obj = ipaddress.IPv4Address(ip_str.strip())
    except ValueError:
        return False, "Invalid IPv4 address"

    if ip_obj.is_loopback:
        return False, "Loopback address excluded"
    if ip_obj.is_link_local:
        return False, "Link-local APIPA (169.254.x.x) address excluded"
    if ip_obj.is_multicast or ip_obj.is_unspecified:
        return False, "Non-unicast address excluded"
    if ip_obj.is_private:
        return True, None
    return False, "Non-RFC1918 address excluded by default"


def compute_subnet_cidr(ip_str: str, prefix_length: int) -> Optional[str]:
    try:
        net = ipaddress.IPv4Network(f"{ip_str}/{int(prefix_length)}", strict=False)
        return str(net)
    except Exception:
        return None


def _score_candidate(item: Dict[str, Any]) -> int:
    """Deterministic interface priority ranking for Phone -> Gateway connectivity."""
    if not item.get("usable"):
        return -1000
    kind = item.get("kind", "other")
    score = 0
    if kind == "hotspot_ap":
        score += 120  # Active Windows Mobile Hotspot direct LAN interface (e.g. 192.168.137.1)
    elif kind == "wifi":
        score += 100  # Connected Wi-Fi adapter on hotspot or router
    elif kind == "ethernet":
        score += 60 if item.get("has_gateway") else 25
    else:
        score += 15

    if item.get("network_category") == "Private":
        score += 20
    elif item.get("network_category") == "Public":
        score += 5

    if item.get("prefix_origin") == "Dhcp":
        score += 10
    if item.get("has_gateway"):
        score += 10
    return score


def normalize_interface_candidates(raw_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Classify, filter, and rank raw adapter descriptors cleanly."""
    normalized: List[Dict[str, Any]] = []
    for raw in raw_items:
        alias = str(raw.get("interface_alias", "")).strip() or "unknown"
        desc = str(raw.get("interface_description", "")).strip()
        ip_str = str(raw.get("ip_address", "")).strip()
        prefix = int(raw.get("prefix_length") or 24)
        status = str(raw.get("status", "Up")).strip()
        origin = str(raw.get("prefix_origin", "")).strip()
        has_gateway = bool(raw.get("has_gateway", False))
        net_cat = str(raw.get("network_category") or "Unknown")
        net_name = str(raw.get("network_name") or "").strip()

        ip_ok, ip_reason = classify_ipv4(ip_str)
        adapter_excl = is_excluded_adapter_name(alias, desc)

        combined_lower = f"{alias} {desc}".lower()
        if "local area connection*" in alias.lower() or "wi-fi direct virtual" in combined_lower:
            kind = "hotspot_ap"
        elif any(tok in combined_lower for tok in ("wi-fi", "wifi", "wlan", "wireless", "802.11")):
            kind = "wifi"
        elif "ethernet" in combined_lower or alias.lower().startswith("eth"):
            kind = "ethernet"
        else:
            kind = "other"

        usable = True
        reason: Optional[str] = None
        if status.lower() not in ("up", "connected", "unknown"):
            usable = False
            reason = f"Adapter state is {status}"
        elif adapter_excl:
            usable = False
            reason = adapter_excl
        elif not ip_ok:
            usable = False
            reason = ip_reason
        elif kind == "ethernet" and not has_gateway and origin.lower() == "manual":
            # Keep manual un-routed Ethernet lower priority/optional unless no Wi-Fi/Hotspot exists
            reason = "Static Ethernet without default gateway (deprioritized)"

        entry = {
            "interface_alias": alias,
            "interface_description": desc,
            "ip_address": ip_str,
            "prefix_length": prefix,
            "subnet_cidr": compute_subnet_cidr(ip_str, prefix),
            "status": status,
            "kind": kind,
            "prefix_origin": origin,
            "has_gateway": has_gateway,
            "network_category": net_cat,
            "network_name": net_name or alias,
            "usable": usable,
            "note": reason,
        }
        entry["priority_score"] = _score_candidate(entry)
        normalized.append(entry)

    normalized.sort(key=lambda x: x["priority_score"], reverse=True)
    return normalized


def _get_windows_wifi_ssid() -> Optional[str]:
    try:
        res = subprocess.run(
            ["netsh", "wlan", "show", "interfaces"],
            capture_output=True,
            text=True,
            timeout=4,
            check=False,
        )
        if res.returncode != 0:
            return None
        for line in res.stdout.splitlines():
            match = re.match(r"^\s*SSID\s*:\s*(.+?)\s*$", line)
            if match:
                val = match.group(1).strip()
                if val and val.lower() != "none":
                    return val
    except Exception:
        pass
    return None


def _discover_windows_raw_adapters() -> List[Dict[str, Any]]:
    """Query active Windows IPv4 adapters, profiles, and gateway metrics via structured PowerShell JSON."""
    ps_script = (
        "$ErrorActionPreference='SilentlyContinue';"
        "$adapters = Get-NetAdapter | Select-Object ifIndex, Name, InterfaceDescription, Status;"
        "$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne '127.0.0.1' } | Select-Object InterfaceIndex, InterfaceAlias, IPAddress, PrefixLength, PrefixOrigin;"
        "$routes = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' | Select-Object InterfaceIndex, NextHop;"
        "$profiles = Get-NetConnectionProfile | Select-Object InterfaceIndex, Name, NetworkCategory;"
        "[PSCustomObject]@{ adapters=$adapters; ips=$ips; routes=$routes; profiles=$profiles } | ConvertTo-Json -Depth 4 -Compress"
    )
    res = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps_script],
        capture_output=True,
        text=True,
        timeout=8,
        check=False,
    )
    if res.returncode != 0 or not res.stdout.strip():
        return []

    data = json.loads(res.stdout)
    def _as_list(v: Any) -> List[Dict[str, Any]]:
        if v is None:
            return []
        return v if isinstance(v, list) else [v]

    adapters_by_idx = {a.get("ifIndex"): a for a in _as_list(data.get("adapters")) if isinstance(a, dict)}
    profiles_by_idx = {p.get("InterfaceIndex"): p for p in _as_list(data.get("profiles")) if isinstance(p, dict)}
    route_indices = {r.get("InterfaceIndex") for r in _as_list(data.get("routes")) if isinstance(r, dict)}

    ssid = _get_windows_wifi_ssid()
    out: List[Dict[str, Any]] = []
    for ip_row in _as_list(data.get("ips")):
        if not isinstance(ip_row, dict):
            continue
        idx = ip_row.get("InterfaceIndex")
        adp = adapters_by_idx.get(idx, {})
        prof = profiles_by_idx.get(idx, {})
        alias = str(ip_row.get("InterfaceAlias") or adp.get("Name") or "")
        desc = str(adp.get("InterfaceDescription") or "")
        status = str(adp.get("Status") or "Up")
        cat_raw = prof.get("NetworkCategory")
        # Windows returns enum integer or string: 0=Public, 1=Private, 2=DomainAuthenticated
        cat_map = {0: "Public", 1: "Private", 2: "DomainAuthenticated", "0": "Public", "1": "Private", "2": "DomainAuthenticated"}
        net_cat = cat_map.get(cat_raw, str(cat_raw or "Unknown"))
        prof_name = str(prof.get("Name") or "")
        if ssid and ("wi-fi" in alias.lower() or "wlan" in alias.lower()):
            prof_name = ssid

        origin_raw = ip_row.get("PrefixOrigin")
        origin_map = {1: "Manual", 2: "WellKnown", 3: "Dhcp", 4: "RouterAdvertisement", "1": "Manual", "2": "WellKnown", "3": "Dhcp", "4": "RouterAdvertisement"}
        origin_str = origin_map.get(origin_raw, str(origin_raw or ""))

        out.append({
            "interface_alias": alias,
            "interface_description": desc,
            "ip_address": str(ip_row.get("IPAddress") or ""),
            "prefix_length": int(ip_row.get("PrefixLength") or 24),
            "prefix_origin": origin_str,
            "status": status,
            "has_gateway": idx in route_indices,
            "network_category": net_cat,
            "network_name": prof_name or alias,
        })
    return out


def _get_linux_wifi_ssid() -> Optional[str]:
    for cmd in (["iwgetid", "-r"], ["nmcli", "-t", "-f", "NAME,TYPE", "con", "show", "--active"]):
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=3, check=False)
            if res.returncode == 0 and res.stdout.strip():
                if cmd[0] == "iwgetid":
                    return res.stdout.strip().splitlines()[0]
                for line in res.stdout.splitlines():
                    parts = line.split(":")
                    if len(parts) >= 2 and "wireless" in parts[1]:
                        return parts[0].strip()
        except Exception:
            continue
    return None


def _discover_linux_raw_adapters() -> List[Dict[str, Any]]:
    """Inspect active Linux/Raspberry Pi interfaces cleanly without external dependencies."""
    ssid = _get_linux_wifi_ssid()
    out: List[Dict[str, Any]] = []
    try:
        res = subprocess.run(["ip", "-j", "-4", "addr", "show", "up"], capture_output=True, text=True, timeout=4, check=False)
        if res.returncode == 0 and res.stdout.strip():
            ifaces = json.loads(res.stdout)
            for iface in ifaces:
                name = str(iface.get("ifname", ""))
                for addr in iface.get("addr_info", []):
                    if addr.get("family") != "inet":
                        continue
                    out.append({
                        "interface_alias": name,
                        "interface_description": "Linux network interface",
                        "ip_address": str(addr.get("local", "")),
                        "prefix_length": int(addr.get("prefixlen", 24)),
                        "prefix_origin": "Dhcp" if addr.get("dynamic") else "Manual",
                        "status": "Up",
                        "has_gateway": True,
                        "network_category": "Private",
                        "network_name": ssid if name.startswith("wlan") and ssid else name,
                    })
    except Exception:
        pass
    return out


def _socket_fallback_ip() -> Optional[str]:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            ip_val = s.getsockname()[0]
            ok, _ = classify_ipv4(ip_val)
            return ip_val if ok else None
    except Exception:
        return None


def discover_local_network(preferred_ip: Optional[str] = None) -> Dict[str, Any]:
    """
    Dynamically discover usable LAN/Wi-Fi/Hotspot interfaces and select the best local IP.
    Works across Windows 11 laptops and Raspberry Pi OS Linux without hardcoded IPs or SSIDs.
    """
    raw: List[Dict[str, Any]] = []
    if os.name == "nt":
        try:
            raw = _discover_windows_raw_adapters()
        except Exception as exc:
            logger.debug("Windows adapter PowerShell discovery fallback: %s", exc)
    else:
        raw = _discover_linux_raw_adapters()

    candidates = normalize_interface_candidates(raw)
    usable = [c for c in candidates if c["usable"]]

    if not usable:
        fb_ip = _socket_fallback_ip()
        if fb_ip:
            fallback_item = normalize_interface_candidates([{
                "interface_alias": "Active Route",
                "interface_description": platform.system(),
                "ip_address": fb_ip,
                "prefix_length": 24,
                "status": "Up",
                "has_gateway": True,
                "network_category": "Unknown",
                "network_name": "Active LAN",
            }])[0]
            candidates.insert(0, fallback_item)
            usable = [fallback_item]

    selected = None
    if preferred_ip:
        selected = next((c for c in usable if c["ip_address"] == preferred_ip), None)
    if selected is None and usable:
        selected = usable[0]

    return {
        "hostname": socket.gethostname(),
        "platform": platform.system(),
        "selected_ip": selected["ip_address"] if selected else None,
        "selected_interface": selected["interface_alias"] if selected else None,
        "selected_kind": selected["kind"] if selected else None,
        "detected_network": selected["network_name"] if selected else "Disconnected",
        "network_category": selected["network_category"] if selected else "Unknown",
        "subnet_cidr": selected["subnet_cidr"] if selected else None,
        "hotspot_active": any(c["kind"] == "hotspot_ap" and c["usable"] for c in candidates),
        "usable_interfaces": usable,
        "all_interfaces": candidates,
    }


def resolve_mdns_ipv4(hostname: str, timeout_s: float = 2.5) -> Optional[str]:
    """Resolve an mDNS hostname (e.g. anishraspberrypizero.local) cleanly without scanning subnets."""
    clean = hostname.strip()
    if not clean:
        return None
    result_holder: Dict[str, Optional[str]] = {"ip": None}

    def _lookup() -> None:
        try:
            infos = socket.getaddrinfo(clean, None, socket.AF_INET, socket.SOCK_STREAM)
            for info in infos:
                candidate = info[4][0]
                ok, _ = classify_ipv4(candidate)
                if ok:
                    result_holder["ip"] = candidate
                    return
        except Exception:
            pass

    import threading
    t = threading.Thread(target=_lookup, daemon=True)
    t.start()
    t.join(timeout=timeout_s)
    return result_holder["ip"]


def probe_gateway_health(
    host_or_url: str,
    http_port: int = 8765,
    https_port: int = 8443,
    timeout_s: float = 3.0,
) -> Dict[str, Any]:
    """
    Check a specific Pi/Gateway candidate endpoint's /health with bounded timeout.
    Accepts full URL or hostname/IP and returns structured reachability info.
    """
    raw = host_or_url.strip()
    if not raw:
        return {"reachable": False, "error": "Empty gateway host."}

    candidates: List[Tuple[str, str]] = []
    if raw.startswith("http://") or raw.startswith("https://"):
        base = raw.rstrip("/")
        scheme = "https" if base.startswith("https://") else "http"
        candidates.append((scheme, base))
    else:
        candidates.append(("https", f"https://{raw}:{https_port}"))
        candidates.append(("http", f"http://{raw}:{http_port}"))

    last_err = "Unreachable"
    insecure_ctx = ssl.create_default_context()
    insecure_ctx.check_hostname = False
    insecure_ctx.verify_mode = ssl.CERT_NONE

    for scheme, base in candidates:
        url = f"{base}/health"
        req = urllib.request.Request(url, method="GET", headers={"Accept": "application/json"})
        try:
            opener_kwargs = {"context": insecure_ctx} if scheme == "https" else {}
            with urllib.request.urlopen(req, timeout=timeout_s, **opener_kwargs) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return {
                    "reachable": True,
                    "scheme": scheme,
                    "base_url": base,
                    "health": data,
                    "ground_station_id": data.get("ground_station_id"),
                    "hardware_model": data.get("hardware_model"),
                }
        except urllib.error.URLError as exc:
            last_err = str(exc.reason)
        except Exception as exc:
            last_err = str(exc)

    return {"reachable": False, "base_url": candidates[0][1], "error": last_err}
