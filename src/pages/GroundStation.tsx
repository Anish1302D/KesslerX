import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';

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

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const WS_BASE = API.replace('http', 'ws');

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

export default function GroundStation() {
  const [connected, setConnected] = useState(false);
  const [renderTick, setRenderTick] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Use refs for high-frequency data to avoid re-render storms
  const latestRef = useRef<TelemetryPacket | null>(null);
  const packetsRef = useRef<TelemetryPacket[]>([]);
  const tempHistoryRef = useRef<{t: number; v: number}[]>([]);
  const signalHistoryRef = useRef<{t: number; v: number}[]>([]);
  const batteryHistoryRef = useRef<{t: number; v: number}[]>([]);
  const logRef = useRef<string[]>([]);
  const rafRef = useRef<number>(0);

  // Batch render: flush ref data to a single state update via rAF
  const scheduleRender = useCallback(() => {
    if (rafRef.current) return; // already scheduled
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setRenderTick(t => t + 1);
    });
  }, []);

  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE}/ws/ground-station`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      logRef.current = [...logRef.current.slice(-49), `[${new Date().toISOString()}] WebSocket connected to ground station`];
      scheduleRender();
    };

    ws.onmessage = (event) => {
      try {
        const pkt: TelemetryPacket = JSON.parse(event.data);
        latestRef.current = pkt;
        packetsRef.current = [...packetsRef.current.slice(-99), pkt];
        
        const idx = pkt.packet_id;
        tempHistoryRef.current = [...tempHistoryRef.current.slice(-59), { t: idx, v: pkt.temperature_c }];
        signalHistoryRef.current = [...signalHistoryRef.current.slice(-59), { t: idx, v: pkt.signal_dbm }];
        batteryHistoryRef.current = [...batteryHistoryRef.current.slice(-59), { t: idx, v: pkt.battery_pct }];
        
        if (pkt.packet_type === 'heartbeat') {
          logRef.current = [...logRef.current.slice(-49), `[${pkt.timestamp}] ♥ HEARTBEAT #${pkt.packet_id} | Battery: ${pkt.battery_pct}% | Temp: ${pkt.temperature_c}°C`];
        } else if (pkt.packet_type === 'alert') {
          logRef.current = [...logRef.current.slice(-49), `[${pkt.timestamp}] ⚠ ALERT #${pkt.packet_id} | ${pkt.battery_pct < 15 ? 'LOW BATTERY' : 'HIGH TEMP'} | Battery: ${pkt.battery_pct}% Temp: ${pkt.temperature_c}°C`];
        }
        
        scheduleRender();
      } catch (e) {
        console.error('Failed to parse ground station packet', e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      logRef.current = [...logRef.current, `[${new Date().toISOString()}] WebSocket disconnected`];
      scheduleRender();
    };

    // Send keep-alive pings
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('ping');
      }
    }, 5000);

    return () => {
      clearInterval(pingInterval);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ws.close();
    };
  }, []);

  // Auto-scroll log container only (not the whole page)
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [renderTick]);

  // Read from refs for rendering
  const pkt = latestRef.current;
  const packets = packetsRef.current;
  const tempHistory = tempHistoryRef.current;
  const signalHistory = signalHistoryRef.current;
  const batteryHistory = batteryHistoryRef.current;
  const log = logRef.current;

  return (
    <div className="space-y-4 h-full overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <div className="flex items-center gap-3 text-tertiary mb-2">
            <span className="material-symbols-outlined">cell_tower</span>
            <h2 className="font-headline-md text-headline-md tracking-tight uppercase">Ground Station</h2>
          </div>
          <p className="text-on-surface-variant font-body-lg max-w-2xl">
            ESP32 telemetry receiver — live sensor data, GPS tracking, and system health monitoring.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${connected ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
            <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className={`text-xs font-bold uppercase tracking-wider ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
              {connected ? 'LINK ACTIVE' : 'DISCONNECTED'}
            </span>
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
          <div className="font-stat-lg text-on-surface">{pkt?.packet_id?.toLocaleString() || '0'}</div>
        </div>
        {/* Uptime */}
        <div className="glass rounded-xl p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Uptime</div>
          <div className="font-label-mono text-emerald-400 text-sm">{pkt ? formatUptime(pkt.uptime_seconds) : '00:00:00'}</div>
        </div>
        {/* Battery */}
        <div className="glass rounded-xl p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Battery</div>
          <div className={`font-stat-lg ${(pkt?.battery_pct ?? 100) < 20 ? 'text-red-400' : 'text-emerald-400'}`}>
            {pkt?.battery_pct?.toFixed(1) || '100'}%
          </div>
        </div>
        {/* Temperature */}
        <div className="glass rounded-xl p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Temperature</div>
          <div className="font-stat-lg text-secondary">{pkt?.temperature_c?.toFixed(1) || '25.0'}°C</div>
        </div>
        {/* Signal */}
        <div className="glass rounded-xl p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Signal</div>
          <div className="font-stat-lg text-tertiary">{pkt?.signal_dbm || '-55'} dBm</div>
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
            Temperature (°C)
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
            Signal Strength (dBm)
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
            Battery (%)
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
            Orientation & Motion
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-on-surface-variant">Heading</span>
              <span className="font-label-mono text-primary text-sm">{pkt?.heading_deg?.toFixed(1) || '0.0'}°</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-on-surface-variant">Pitch</span>
              <span className="font-label-mono text-secondary text-sm">{pkt?.pitch_deg?.toFixed(1) || '0.0'}°</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-on-surface-variant">Roll</span>
              <span className="font-label-mono text-tertiary text-sm">{pkt?.roll_deg?.toFixed(1) || '0.0'}°</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-on-surface-variant">Velocity</span>
              <span className="font-label-mono text-on-surface text-sm">{pkt?.velocity_m_s?.toFixed(2) || '0.00'} m/s</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-on-surface-variant">Altitude</span>
              <span className="font-label-mono text-on-surface text-sm">{pkt?.altitude_m?.toFixed(1) || '14.0'} m</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-on-surface-variant">Free Heap</span>
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
          <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-on-surface-variant">terminal</span>
            Mission Log
          </h3>
          <div ref={logContainerRef} className="flex-1 bg-surface-container-lowest/60 rounded-lg p-3 font-label-mono text-[11px] overflow-y-auto max-h-[200px] custom-scrollbar space-y-0.5">
            {log.length === 0 && (
              <div className="text-on-surface-variant/40">Waiting for telemetry packets...</div>
            )}
            {log.map((entry, i) => (
              <div key={i} className={`${entry.includes('ALERT') ? 'text-red-400' : entry.includes('HEARTBEAT') ? 'text-emerald-400' : 'text-on-surface-variant/80'}`}>
                {entry}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-on-surface-variant/60 font-label-mono">
            <span>PACKETS: {packets.length}</span>
            <span>LAST: {pkt?.timestamp ? new Date(pkt.timestamp).toLocaleTimeString() : 'N/A'}</span>
            <span>TYPE: {pkt?.packet_type?.toUpperCase() || 'N/A'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
