import { useState, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import ProvenanceBadge from '../components/ui/ProvenanceBadge';
import { getWsUrl as resolveWsUrl, API_ENDPOINTS } from '../config/api';

interface TelemetryPacket {
  packet_id: number;
  packet_type: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  altitude_m: number;
  temperature_c: number;
  battery_pct: number;
  signal_dbm: number;
  velocity_m_s: number;
  heading_deg: number;
  pitch_deg: number;
  roll_deg: number;
  uptime_seconds: number;
  free_heap_bytes: number;
  wifi_rssi: number;
  station_id: string;
}

function getWsUrl(): string {
  return resolveWsUrl(API_ENDPOINTS.WS_GROUND_STATION);
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

export default function GroundStation() {
  const [connected, setConnected] = useState(false);
  const [isClientFallback, setIsClientFallback] = useState(false);
  const [latestPacket, setLatestPacket] = useState<TelemetryPacket | null>(null);
  const [packets, setPackets] = useState<TelemetryPacket[]>([]);
  const [tempHistory, setTempHistory] = useState<{t: number; v: number}[]>([]);
  const [signalHistory, setSignalHistory] = useState<{t: number; v: number}[]>([]);
  const [batteryHistory, setBatteryHistory] = useState<{t: number; v: number}[]>([]);
  const [log, setLog] = useState<string[]>([]);

  // Pass tracking state
  const [trackingPass] = useState({
    satellite: 'ISS (ZARYA) [NORAD 25544]',
    downlink_freq: '437.500 MHz',
    azimuth_deg: 142.4,
    elevation_deg: 38.6,
    doppler_shift_khz: 3.42,
    range_rate_km_s: -6.82,
    next_aos: 'T + 00:18:40',
    los: 'T + 00:27:12',
    max_elevation: '68.2°',
  });

  const wsRef = useRef<WebSocket | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isCancelled = false;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    const wsUrl = getWsUrl();

    const startClientFallback = () => {
      if (fallbackInterval) return;
      setIsClientFallback(true);
      let packetId = 100;
      let uptime = 120;

      fallbackInterval = setInterval(() => {
        if (isCancelled) return;
        packetId += 1;
        uptime += 3;
        const now = new Date().toISOString();
        const pkt: TelemetryPacket = {
          packet_id: packetId,
          packet_type: packetId % 5 === 0 ? 'alert' : 'heartbeat',
          timestamp: now,
          latitude: 19.076 + Math.sin(packetId / 10) * 0.005,
          longitude: 72.8777 + Math.cos(packetId / 10) * 0.005,
          altitude_m: 14.2 + (packetId % 3),
          temperature_c: 24.5 + Math.sin(packetId / 5) * 2.5,
          battery_pct: Math.max(10, 95 - (packetId % 30) * 1.5),
          signal_dbm: -58 + Math.floor(Math.sin(packetId) * 8),
          velocity_m_s: 0.12,
          heading_deg: (packetId * 15) % 360,
          pitch_deg: Math.sin(packetId / 4) * 5,
          roll_deg: Math.cos(packetId / 4) * 4,
          uptime_seconds: uptime,
          free_heap_bytes: 198400 - (packetId * 10),
          wifi_rssi: -55,
          station_id: 'KX-GS-01',
        };

        setLatestPacket(pkt);
        setPackets(prev => [...prev.slice(-99), pkt]);
        setTempHistory(prev => [...prev.slice(-59), { t: pkt.packet_id, v: Number(pkt.temperature_c.toFixed(1)) }]);
        setSignalHistory(prev => [...prev.slice(-59), { t: pkt.packet_id, v: pkt.signal_dbm }]);
        setBatteryHistory(prev => [...prev.slice(-59), { t: pkt.packet_id, v: Number(pkt.battery_pct.toFixed(1)) }]);

        if (pkt.packet_type === 'heartbeat') {
          setLog(prev => [...prev.slice(-49), `[${pkt.timestamp.slice(11, 19)}] ♥ HEARTBEAT #${pkt.packet_id} | Bat: ${pkt.battery_pct.toFixed(0)}% | Temp: ${pkt.temperature_c.toFixed(1)}°C | RSSI: ${pkt.signal_dbm} dBm`]);
        } else {
          setLog(prev => [...prev.slice(-49), `[${pkt.timestamp.slice(11, 19)}] ⚠ ADVISORY #${pkt.packet_id} | Signal degradation warning: -66 dBm`]);
        }
      }, 3000);
    };

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isCancelled) return;
        setConnected(true);
        setIsClientFallback(false);
        if (fallbackInterval) {
          clearInterval(fallbackInterval);
          fallbackInterval = null;
        }
        setLog(prev => [...prev.slice(-49), `[${new Date().toISOString()}] WebSocket connected to ground station`]);
      };

      ws.onmessage = (event) => {
        if (isCancelled) return;
        try {
          const pkt: TelemetryPacket = JSON.parse(event.data);
          setLatestPacket(pkt);
          setPackets(prev => [...prev.slice(-99), pkt]);

          const idx = pkt.packet_id;
          setTempHistory(prev => [...prev.slice(-59), { t: idx, v: pkt.temperature_c }]);
          setSignalHistory(prev => [...prev.slice(-59), { t: idx, v: pkt.signal_dbm }]);
          setBatteryHistory(prev => [...prev.slice(-59), { t: idx, v: pkt.battery_pct }]);

          if (pkt.packet_type === 'heartbeat') {
            setLog(prev => [...prev.slice(-49), `[${pkt.timestamp}] ♥ HEARTBEAT #${pkt.packet_id} | Battery: ${pkt.battery_pct}% | Temp: ${pkt.temperature_c}°C`]);
          } else if (pkt.packet_type === 'alert') {
            setLog(prev => [...prev.slice(-49), `[${pkt.timestamp}] ⚠ ALERT #${pkt.packet_id} | ${pkt.battery_pct < 15 ? 'LOW BATTERY' : 'HIGH TEMP'} | Battery: ${pkt.battery_pct}% Temp: ${pkt.temperature_c}°C`]);
          }
        } catch (e) {
          console.error('Failed to parse ground station packet', e);
        }
      };

      ws.onclose = () => {
        if (isCancelled) return;
        setConnected(false);
        setLog(prev => [...prev.slice(-49), `[${new Date().toISOString()}] Ground station socket closed. Starting autonomous simulator.`]);
        startClientFallback();
      };

      ws.onerror = () => {
        if (isCancelled) return;
        setConnected(false);
        startClientFallback();
      };

      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, 5000);
    } catch {
      startClientFallback();
    }

    return () => {
      isCancelled = true;
      if (pingInterval) clearInterval(pingInterval);
      if (fallbackInterval) clearInterval(fallbackInterval);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Auto-scroll log container when logs change
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [log]);

  const pkt = latestPacket;

  return (
    <div className="space-y-4 h-full overflow-y-auto custom-scrollbar pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 text-tertiary mb-2">
            <span className="material-symbols-outlined">cell_tower</span>
            <h2 className="font-headline-md text-headline-md tracking-tight uppercase">Ground Station Receiver</h2>
          </div>
          <p className="text-on-surface-variant font-body-lg max-w-2xl text-sm">
            ESP32 LoRa / WiFi telemetry receiver — live downlinked sensor packets, pass tracking, and azimuth/elevation targeting.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <ProvenanceBadge
              source="local"
              mode={isClientFallback ? 'simulated' : 'derived'}
              warnings={['Hardware-in-the-Loop simulated telemetry stream. Decision support only.']}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3 py-1 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-full font-mono text-xs font-bold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">developer_board</span>
            HARDWARE IN THE LOOP SIMULATOR
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${connected ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-cyan-500/10 border-cyan-500/30'}`}>
            <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-cyan-400 animate-pulse'}`}></div>
            <span className={`text-xs font-bold uppercase tracking-wider ${connected ? 'text-emerald-400' : 'text-cyan-300'}`}>
              {connected ? 'LIVE WS LINK' : isClientFallback ? 'SIMULATOR ACTIVE' : 'CONNECTING...'}
            </span>
          </div>
        </div>
      </div>

      {/* Satellite Pass Tracking Card */}
      <div className="glass rounded-xl p-inner-padding border-l-4 border-l-primary bg-gradient-to-r from-primary/10 via-surface-container-low to-transparent">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">satellite_alt</span>
            <h3 className="font-headline-sm text-sm font-bold text-on-surface uppercase tracking-wider">
              Active Overhead Pass Tracking
            </h3>
            <span className="text-xs font-mono text-primary font-bold">[{trackingPass.satellite}]</span>
          </div>
          <div className="text-xs font-mono text-on-surface-variant">
            Downlink: <span className="text-white font-bold">{trackingPass.downlink_freq}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono">
          <div className="p-2.5 bg-surface-container-highest/30 rounded border border-outline-variant/10">
            <div className="text-on-surface-variant/70 text-[10px]">AZIMUTH</div>
            <div className="text-white text-sm font-bold">{trackingPass.azimuth_deg}° (SE)</div>
          </div>
          <div className="p-2.5 bg-surface-container-highest/30 rounded border border-outline-variant/10">
            <div className="text-on-surface-variant/70 text-[10px]">ELEVATION</div>
            <div className="text-primary text-sm font-bold">{trackingPass.elevation_deg}°</div>
          </div>
          <div className="p-2.5 bg-surface-container-highest/30 rounded border border-outline-variant/10">
            <div className="text-on-surface-variant/70 text-[10px]">DOPPLER SHIFT</div>
            <div className="text-emerald-400 text-sm font-bold">+{trackingPass.doppler_shift_khz} kHz</div>
          </div>
          <div className="p-2.5 bg-surface-container-highest/30 rounded border border-outline-variant/10">
            <div className="text-on-surface-variant/70 text-[10px]">RANGE RATE</div>
            <div className="text-white text-sm font-bold">{trackingPass.range_rate_km_s} km/s</div>
          </div>
          <div className="p-2.5 bg-surface-container-highest/30 rounded border border-outline-variant/10">
            <div className="text-on-surface-variant/70 text-[10px]">NEXT AOS</div>
            <div className="text-amber-400 text-sm font-bold">{trackingPass.next_aos}</div>
          </div>
          <div className="p-2.5 bg-surface-container-highest/30 rounded border border-outline-variant/10">
            <div className="text-on-surface-variant/70 text-[10px]">MAX ELEVATION</div>
            <div className="text-white text-sm font-bold">{trackingPass.max_elevation}</div>
          </div>
        </div>
      </div>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-card-gap">
        {/* Station ID */}
        <div className="glass rounded-xl p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Station</div>
          <div className="font-label-mono text-primary text-sm font-bold">{pkt?.station_id || 'KX-GS-01'}</div>
        </div>
        {/* Packet Count */}
        <div className="glass rounded-xl p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Packets</div>
          <div className="font-stat-lg text-on-surface">{pkt?.packet_id?.toLocaleString() || '104'}</div>
        </div>
        {/* Uptime */}
        <div className="glass rounded-xl p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Uptime</div>
          <div className="font-label-mono text-emerald-400 text-sm">{pkt ? formatUptime(pkt.uptime_seconds) : '00:02:14'}</div>
        </div>
        {/* Battery */}
        <div className="glass rounded-xl p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Battery</div>
          <div className={`font-stat-lg ${(pkt?.battery_pct ?? 100) < 20 ? 'text-red-400' : 'text-emerald-400'}`}>
            {pkt?.battery_pct?.toFixed(1) || '88.5'}%
          </div>
        </div>
        {/* Temperature */}
        <div className="glass rounded-xl p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Temperature</div>
          <div className="font-stat-lg text-secondary">{pkt?.temperature_c?.toFixed(1) || '25.4'}°C</div>
        </div>
        {/* Signal */}
        <div className="glass rounded-xl p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Signal</div>
          <div className="font-stat-lg text-tertiary">{pkt?.signal_dbm || '-58'} dBm</div>
        </div>
        {/* GPS */}
        <div className="glass rounded-xl p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Latitude</div>
          <div className="font-label-mono text-on-surface text-sm">{pkt?.latitude?.toFixed(6) || '19.076000'}</div>
        </div>
        <div className="glass rounded-xl p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Longitude</div>
          <div className="font-label-mono text-on-surface text-sm">{pkt?.longitude?.toFixed(6) || '72.877700'}</div>
        </div>
      </div>

      {/* Charts + Live Data */}
      <div className="grid grid-cols-12 gap-card-gap">
        {/* Temperature Chart */}
        <div className="col-span-12 lg:col-span-4 glass rounded-xl p-4">
          <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-secondary">thermostat</span>
            Receiver Temperature (°C)
          </h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tempHistory}>
                <defs>
                  <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="t" tick={{ fill: '#9ca3af', fontSize: 9 }} axisLine={false} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 9 }} axisLine={false} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '11px' }} />
                <Area type="monotone" dataKey="v" stroke="#f59e0b" fill="url(#tempGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Signal Strength Chart */}
        <div className="col-span-12 lg:col-span-4 glass rounded-xl p-4">
          <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-tertiary">signal_cellular_alt</span>
            RSSI Signal Strength (dBm)
          </h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={signalHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="t" tick={{ fill: '#9ca3af', fontSize: 9 }} axisLine={false} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 9 }} axisLine={false} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '11px' }} />
                <Line type="monotone" dataKey="v" stroke="#a78bfa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Battery Chart */}
        <div className="col-span-12 lg:col-span-4 glass rounded-xl p-4">
          <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-emerald-400">battery_full</span>
            Buffer Power Battery (%)
          </h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={batteryHistory}>
                <defs>
                  <linearGradient id="batGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="t" tick={{ fill: '#9ca3af', fontSize: 9 }} axisLine={false} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 9 }} axisLine={false} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '11px' }} />
                <Area type="monotone" dataKey="v" stroke="#22c55e" fill="url(#batGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Orientation + Mission Log */}
      <div className="grid grid-cols-12 gap-card-gap">
        {/* Orientation / Motion */}
        <div className="col-span-12 lg:col-span-4 glass rounded-xl p-4">
          <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-primary">3d_rotation</span>
            Antenna Pointing &amp; Gimbal Attitude
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-on-surface-variant">Azimuth / Heading</span>
              <span className="font-label-mono text-primary text-sm">{pkt?.heading_deg?.toFixed(1) || '142.4'}°</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-on-surface-variant">Elevation / Pitch</span>
              <span className="font-label-mono text-secondary text-sm">{pkt?.pitch_deg?.toFixed(1) || '38.6'}°</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-on-surface-variant">Cross-Elevation / Roll</span>
              <span className="font-label-mono text-tertiary text-sm">{pkt?.roll_deg?.toFixed(1) || '0.0'}°</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-on-surface-variant">Tracking Slew Rate</span>
              <span className="font-label-mono text-on-surface text-sm">{pkt?.velocity_m_s?.toFixed(2) || '0.45'} °/s</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-on-surface-variant">Station Altitude</span>
              <span className="font-label-mono text-on-surface text-sm">{pkt?.altitude_m?.toFixed(1) || '14.0'} m</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-on-surface-variant">ESP32 Free Heap</span>
              <span className="font-label-mono text-on-surface text-sm">{((pkt?.free_heap_bytes || 200000) / 1024).toFixed(0)} KB</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-on-surface-variant">WiFi RSSI</span>
              <span className="font-label-mono text-on-surface text-sm">{pkt?.wifi_rssi || '-55'} dBm</span>
            </div>
          </div>
        </div>

        {/* Mission Log */}
        <div className="col-span-12 lg:col-span-8 glass rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-on-surface-variant">terminal</span>
              ESP32 Packet Telemetry Log
            </h3>
            <span className="text-[10px] font-mono text-on-surface-variant/70">
              Decision support only — spacecraft command transmission disabled.
            </span>
          </div>
          <div ref={logContainerRef} className="flex-1 bg-surface-container-lowest/60 rounded-lg p-3 font-label-mono text-[11px] overflow-y-auto max-h-[200px] custom-scrollbar space-y-0.5">
            {log.length === 0 && (
              <div className="text-on-surface-variant/40">Waiting for telemetry packets...</div>
            )}
            {log.map((entry, i) => (
              <div key={i} className={`${entry.includes('ALERT') || entry.includes('ADVISORY') ? 'text-amber-400' : entry.includes('HEARTBEAT') ? 'text-emerald-400' : 'text-on-surface-variant/80'}`}>
                {entry}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-on-surface-variant/60 font-label-mono">
            <span>PACKETS: {packets.length}</span>
            <span>LAST: {pkt?.timestamp ? new Date(pkt.timestamp).toLocaleTimeString() : 'N/A'}</span>
            <span>TYPE: {pkt?.packet_type?.toUpperCase() || 'HEARTBEAT'}</span>
            <span>SIMULATOR: {isClientFallback ? 'AUTONOMOUS CLIENT' : 'BACKEND FEED'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
