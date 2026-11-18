# KesslerX Network-Independent Connectivity & Laptop Direct Fallback Guide

## 1. Overview

KesslerX dynamically adapts to whatever Wi-Fi or mobile hotspot is available at a competition venue without hardcoded SSIDs (`KesslerX_Event`), fixed Raspberry Pi IPs (`192.168.0.211`), or fixed laptop IPs (`192.168.0.171`).

It operates in two explicit modes coordinated by `backend/connection_manager.py`:

| Operating Mode | Ground Station ID | Hardware Model Label | Packet Flow |
| :--- | :--- | :--- | :--- |
| **Mode A — Normal (Preferred)** | `KX-RPI-ZERO-GS-001` | `Raspberry Pi Zero W` | `Phone -> Pi Zero W -> Render Backend -> Dashboard` |
| **Mode B — Emergency Fallback** | `KX-LAPTOP-FALLBACK-001` | `Windows Laptop` | `Phone -> Laptop Fallback Gateway -> Render Backend -> Dashboard` |

Both modes keep all KesslerX functionality intact: `PHONE SATELLITE` (`PHONE-SATELLITE-001`), deterministic mock orbit (`MOCK_LEO_PHONE_DEMO`), deterministic tilt-driven collision probability (`PHONE-DEMO-CONJUNCTION-001`), Orbital Commons AI, and SQLite offline buffering.

---

## 2. Supported Event Network Arrangements

### Arrangement A — Separate Hotspot + Pi + Phone + Laptop (Best with Raspberry Pi Zero W)
* **Setup**: A second phone or venue router hosts the Wi-Fi hotspot; Raspberry Pi Zero W (`anishraspberrypizero.local`), Samsung Galaxy A35 (phone simulator), and Galaxy Book 5 (Mission Control laptop) all join it.
* **Result**: KesslerX auto-discovers the Pi via mDNS (`anishraspberrypizero.local`) or manual IP entry and activates **Mode A (`KX-RPI-ZERO-GS-001`)**.

### Arrangement B — Windows Mobile Hotspot on Laptop (`Galaxy Book 5`)
* **Setup**: Enable **Windows Mobile Hotspot** on Galaxy Book 5 (`192.168.137.1/24` typically). Connect Samsung Galaxy A35 (and Raspberry Pi Zero W if configured) to the Windows hotspot.
* **Result**:
  * If Pi joins the Windows hotspot -> **Mode A (`KX-RPI-ZERO-GS-001`)**.
  * If Pi cannot join the hotspot -> after `PI_FAILURE_THRESHOLD=3` missed probes (or 1 click on **Laptop Fallback**), KesslerX hosts the Laptop Direct Fallback gateway on the laptop's active hotspot/Wi-Fi IP (`https://<LAPTOP_IP>:8444/simulator?token=...`).

### Arrangement C — Android Hotspot on Another Device + Fallback
* **Setup**: Another device hosts the hotspot; Galaxy Book 5 and Samsung Galaxy A35 join it.
* **Result**: KesslerX automatically selects the laptop's active `Wi-Fi` IPv4 address (filtering out VPN, APIPA `169.254.*`, Bluetooth, and disconnected adapters), generates a matching HTTPS SAN certificate, and displays a scannable QR code in the dashboard.

### Arrangement D — Samsung Galaxy A35 Hosting Its Own Hotspot (Client-Isolation Caveat)
* Some Android/iOS hotspots prevent the phone hosting the hotspot from reaching LAN clients connected to its own hotspot AP, or isolate client-to-client traffic depending on carrier/One UI firmware.
* **Recommendation**: If Samsung Galaxy A35 cannot reach `https://<LAPTOP_IP>:8444/simulator` while hosting its own hotspot, switch to **Arrangement B** (enable **Mobile Hotspot** on the Windows 11 Galaxy Book 5 and connect the Samsung Galaxy A35 to the laptop's hotspot).

---

## 3. Dynamic Interface Discovery & Failure Hysteresis

`raspberry_pi_gateway/network_discovery.py` and `backend/connection_manager.py` enforce:

* **Clean Adapter Filtering**: Automatically excludes `127.0.0.1` loopback, `169.254.*` APIPA addresses, disconnected adapters, Bluetooth PAN, virtual switch adapters, and VPN interfaces (e.g., `McAfee VPN`).
* **Smart Prioritization**: Prefers active Windows Mobile Hotspot AP adapters (`Local Area Connection*`, typically `192.168.137.1`) and active `Wi-Fi` adapters with an active gateway.
* **No Blind Subnet Scanning**: Pi discovery uses targeted resolution via mDNS (`anishraspberrypizero.local`), manual IP entry in the UI, and `/health` probing (`3s` timeout).
* **Hysteresis & Non-Disruptive Recovery**:
  * In `AUTO` mode, KesslerX waits for `PI_FAILURE_THRESHOLD` (`3`) consecutive misses before entering **Mode B (`KX-LAPTOP-FALLBACK-001`)** so brief Wi-Fi jitter does not cause rapid mode flapping.
  * When the Raspberry Pi comes back online during an active fallback demonstration, the UI displays a **Raspberry Pi Zero W is back online — Switch to Raspberry Pi** banner without abruptly cutting the live phone session. Switching stops the fallback listener cleanly so only one forwarder runs at a time.

---

## 4. Security & Windows Firewall Setup

1. **Pairing Token & Dynamic SAN TLS Certificate**:
   * Laptop Direct Fallback runs TLS (`https://<LAPTOP_IP>:8444`) with an auto-generated Subject Alternative Name (SAN) matching the currently selected LAN IP (`cryptography.x509` or `openssl`), plus a 900-second pairing token (`?token=...` or `X-KesslerX-Pairing-Token`) verified in constant time.
   * Tokens are never written to application logs or forwarded telemetry packets.
   * On the Samsung Galaxy A35 Chrome browser, accept the self-signed LAN certificate once so Android allows HTTPS **DeviceOrientation** sensor access.
2. **Scoped Windows Defender Firewall (Private Networks Only)**:
   * Never disable Windows Defender Firewall globally or open `Public` inbound ports.
   * Ensure the active Wi-Fi/Hotspot profile is set to **Private** in Windows Settings.
   * Run the scoped setup script in an elevated PowerShell prompt:
     ```powershell
     powershell -ExecutionPolicy Bypass -File scripts/setup_windows_firewall.ps1
     ```
   * This permits TCP ports `8444` (HTTPS/WSS simulator) and `8766` (HTTP health/fallback) **strictly** for `-Profile Private -RemoteAddress LocalSubnet`.
   * To remove the rules after the event:
     ```powershell
     powershell -ExecutionPolicy Bypass -File scripts/setup_windows_firewall.ps1 -Remove
     ```

---

## 5. Event-Day Quick Checklist

1. Connect the laptop and phone to your hotspot (or enable Windows Mobile Hotspot on Galaxy Book 5 and join it with Samsung Galaxy A35).
2. Open KesslerX Mission Control -> **Ground Station** (`/ground-station`) or **Network Setup** (`/network-setup`).
3. Verify **Detected Network**, **Laptop Local IP**, and **Raspberry Pi Zero W** status.
4. If Raspberry Pi is **Active** (`KX-RPI-ZERO-GS-001`), scan/open its HTTPS URL on Samsung Galaxy A35.
5. If Raspberry Pi is **Unreachable**, click **Auto Connect** or **Laptop Fallback** (`KX-LAPTOP-FALLBACK-001`), verify Private firewall status, scan the QR code on Samsung Galaxy A35, accept the self-signed HTTPS warning once, tap **Connect & Start Streaming**, and verify telemetry updates in `PHONE SATELLITE`.
