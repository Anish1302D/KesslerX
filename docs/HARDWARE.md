# KesslerX Ground Station — Hardware Documentation

## Overview

The KesslerX Ground Station uses an **ESP32** microcontroller to collect environmental and positional telemetry data, which is transmitted to the KesslerX backend over **WebSocket** for real-time monitoring.

---

## Firmware Structure

```
firmware/
├── src/
│   ├── main.cpp           # Entry point, WiFi + WebSocket setup
│   ├── sensors.h           # Sensor reading abstraction
│   ├── telemetry.h         # JSON packet builder
│   ├── config.h            # WiFi credentials, server URL, intervals
│   └── heartbeat.h         # System health monitoring
├── platformio.ini          # PlatformIO build configuration
└── README.md
```

---

## JSON Telemetry Format

### Sensor Packet (sent every 1 second)

```json
{
  "packet_id": 1042,
  "packet_type": "sensor",
  "timestamp": "2026-08-06T10:42:00Z",
  "station_id": "KX-GS-01",
  "latitude": 19.076012,
  "longitude": 72.877654,
  "altitude_m": 14.2,
  "temperature_c": 27.3,
  "battery_pct": 85.4,
  "signal_dbm": -52,
  "velocity_m_s": 0.12,
  "heading_deg": 142.5,
  "pitch_deg": 1.2,
  "roll_deg": -0.8,
  "uptime_seconds": 3642,
  "free_heap_bytes": 198432,
  "wifi_rssi": -52
}
```

### Heartbeat Packet (sent every 30 seconds)

```json
{
  "packet_id": 1050,
  "packet_type": "heartbeat",
  "timestamp": "2026-08-06T10:42:30Z",
  "station_id": "KX-GS-01",
  "battery_pct": 85.3,
  "temperature_c": 27.4,
  "uptime_seconds": 3672,
  "free_heap_bytes": 198000,
  "wifi_rssi": -54
}
```

### Alert Packet (triggered by threshold breach)

```json
{
  "packet_id": 1055,
  "packet_type": "alert",
  "timestamp": "2026-08-06T10:43:00Z",
  "station_id": "KX-GS-01",
  "alert_code": "LOW_BATTERY",
  "battery_pct": 12.1,
  "temperature_c": 42.5,
  "message": "Battery below 15% threshold"
}
```

---

## Pin Diagram (ESP32 DevKit V1)

```
         +--[ USB ]--+
    3V3 -|1       38|- GND
    EN  -|2       37|- GPIO23  → SPI MOSI (SD Card)
GPIO36  -|3  ADC  36|- GPIO22  → I2C SCL (BME280)
GPIO39  -|4  ADC  35|- GPIO01  → TX
GPIO34  -|5  ADC  34|- GPIO03  → RX
GPIO35  -|6  ADC  33|- GPIO21  → I2C SDA (BME280)
GPIO32  -|7  ADC  32|- GND
GPIO33  -|8  ADC  31|- GPIO19  → SPI MISO (SD Card)
GPIO25  -|9  DAC  30|- GPIO18  → SPI SCK (SD Card)
GPIO26  -|10 DAC  29|- GPIO05  → SPI CS (SD Card)
GPIO27  -|11      28|- GPIO17  → GPS TX (NEO-6M)
GPIO14  -|12      27|- GPIO16  → GPS RX (NEO-6M)
GPIO12  -|13      26|- GPIO04  → LED Status
GND     -|14      25|- GPIO00  → Boot Button
GPIO13  -|15      24|- GPIO02  → Onboard LED
GPIO09  -|16      23|- GPIO15  → Battery ADC Voltage Divider
GPIO10  -|17      22|- GPIO08
GPIO11  -|18      21|- GPIO07
  VIN   -|19      20|- GPIO06
         +-----------+
```

### Pin Assignments

| Function             | GPIO | Notes                           |
|---------------------|------|---------------------------------|
| I2C SDA (BME280)    | 21   | Temperature, humidity, pressure |
| I2C SCL (BME280)    | 22   | I2C clock                       |
| GPS TX (NEO-6M)     | 17   | UART2 TX                        |
| GPS RX (NEO-6M)     | 16   | UART2 RX                        |
| Battery ADC         | 15   | Via voltage divider (2:1)       |
| Status LED          | 4    | Green = OK, Red = Alert         |
| Onboard LED         | 2    | Heartbeat blink                 |
| SPI CS (SD Card)    | 5    | Optional data logging           |
| SPI MOSI            | 23   | SD Card write                   |
| SPI MISO            | 19   | SD Card read                    |
| SPI SCK             | 18   | SD Card clock                   |

---

## PCB Recommendations

### Components

| Component          | Model            | Purpose                      | Cost (approx) |
|-------------------|------------------|------------------------------|---------------|
| MCU               | ESP32-WROOM-32E  | Main controller + WiFi       | $3.50         |
| GPS Module        | NEO-6M           | Position fix                 | $5.00         |
| Temp/Humidity     | BME280           | Environmental sensing        | $3.00         |
| IMU               | MPU6050          | Orientation (accel + gyro)   | $2.50         |
| Battery           | 18650 Li-Ion     | 3.7V, 2600mAh               | $3.00         |
| Charge Controller | TP4056           | USB-C charging               | $0.50         |
| Voltage Regulator | AMS1117-3.3      | 3.3V regulation              | $0.20         |
| SD Card Module    | SPI Micro SD     | Local telemetry logging      | $1.50         |
| Antenna           | 2.4GHz PCB ant.  | WiFi range extension         | $0.30         |

### PCB Layout Notes

- 2-layer PCB, 50mm × 35mm form factor
- Ground plane on bottom layer
- Keep GPS antenna away from WiFi antenna (min 15mm separation)
- Use 0.1µF decoupling capacitors on all IC power pins
- Route I2C traces short and direct
- Battery connector: JST-PH 2.0mm

---

## Communication Protocol

### WebSocket Connection

```
ws://<backend_host>:8000/ws/ground-station
```

### Protocol Flow

```
ESP32                          KesslerX Backend
  |                                    |
  |--- WebSocket CONNECT ------------>|
  |<-- WebSocket ACCEPT --------------|
  |                                    |
  |--- Sensor Packet (JSON) --------->| → Broadcast to dashboard
  |--- Sensor Packet (JSON) --------->| → Store in history buffer
  |                                    |
  |--- Heartbeat Packet (30s) ------->| → Update last_heartbeat
  |                                    |
  |--- Alert Packet (threshold) ----->| → Generate dashboard alert
  |                                    |
  |<-- "ping" (keep-alive) ----------| (from frontend clients)
  |                                    |
```

### Frame Format

All frames are UTF-8 encoded JSON strings. No binary framing.

### Reconnection Strategy

- On disconnect: wait 2 seconds, then retry
- Exponential backoff: 2s → 4s → 8s → 16s → 30s max
- After 10 consecutive failures: enter deep sleep for 60s
- On reconnect: send heartbeat immediately

---

## Alert Thresholds

| Parameter    | Warning     | Critical    |
|-------------|-------------|-------------|
| Battery     | < 20%       | < 10%       |
| Temperature | > 40°C      | > 50°C      |
| Signal      | < -75 dBm   | < -85 dBm   |
| GPS Fix     | > 30s stale | > 120s stale|
| Heap Memory | < 50KB      | < 20KB      |

---

## Power Budget

| Component  | Active (mA) | Sleep (µA) |
|-----------|-------------|------------|
| ESP32     | 120         | 10         |
| NEO-6M    | 45          | -          |
| BME280    | 0.3         | 0.1        |
| MPU6050   | 3.8         | 5          |
| SD Card   | 100         | -          |
| **Total** | **~270 mA** | **~15 µA** |

With 2600mAh 18650: ~9.6 hours active, ~7 years deep sleep.
