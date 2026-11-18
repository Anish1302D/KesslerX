import React, { useState, useEffect, useCallback, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Wifi,
  Radio,
  Laptop,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  QrCode,
  PlugZap,
  ArrowRightLeft,
  Server,
} from 'lucide-react';
import { API_BASE_URL, API_ENDPOINTS, getApiUrl } from '../../config/api';
import { apiRequest } from '../../utils/apiClient';
import type { PhoneTelemetrySnapshot } from '../../utils/phoneSatelliteOrbit';

const DEFAULT_LOCAL_AGENT_URL = 'http://127.0.0.1:8000';

function isLocalHostnameUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url.trim());
}

export interface NetworkInterfaceInfo {
  interface_alias: string;
  interface_description: string;
  ip_address: string;
  prefix_length: number;
  subnet_cidr: string | null;
  kind: string;
  network_category: string;
  network_name: string;
  usable: boolean;
  priority_score: number;
}

export interface NetworkStatusPayload {
  mode_preference: 'AUTO' | 'PI' | 'LAPTOP_FALLBACK' | string;
  active_mode: 'PI' | 'LAPTOP_FALLBACK' | 'SEARCHING' | string;
  ground_station_id: string;
  hardware_model: string;
  detected_network: {
    selected_ip: string | null;
    selected_interface: string | null;
    network_name: string | null;
    profile_type: string | null;
    connection_kind: string | null;
    hotspot_active?: boolean;
    subnet_cidr?: string | null;
    hostname?: string | null;
    interfaces: NetworkInterfaceInfo[];
  };
  raspberry_pi: {
    reachable: boolean;
    endpoint: string | null;
    manual_endpoint: string | null;
    mdns_hostname: string;
    simulator_url: string | null;
    consecutive_failures: number;
    failure_threshold: number;
    recovered_available: boolean;
    last_checked_at: string | null;
  };
  laptop_fallback: {
    active: boolean;
    ground_station_id: string;
    hardware_model: string;
    bind_ip: string | null;
    http_port: number;
    https_port: number;
    cert_sans: string[];
    sqlite_buffered_rows: number;
    packets_accepted: number;
    packets_forwarded: number;
    ws_clients: number;
  };
  simulator: {
    url: string | null;
    url_with_token: string | null;
    pairing_token: string | null;
    pairing_token_expires_at: string | null;
    pairing_required: boolean;
  };
  backend: {
    url: string;
    reachable: boolean;
    service_status: string;
    error?: string | null;
  };
  warnings: string[];
  last_error: string | null;
}

export interface FirewallStatusPayload {
  platform: string;
  supported: boolean;
  active_interface_profile: string | null;
  public_profile_warning: boolean;
  private_rule_configured?: boolean;
  recommended_command: string | null;
  summary: string;
}

interface NetworkSetupPanelProps {
  phoneTelemetry?: PhoneTelemetrySnapshot;
  pollIntervalMs?: number;
  apiBaseUrlOverride?: string;
  localAgentUrl?: string;
}

export const NetworkSetupPanel: React.FC<NetworkSetupPanelProps> = ({
  phoneTelemetry,
  pollIntervalMs = 5000,
  apiBaseUrlOverride,
  localAgentUrl = DEFAULT_LOCAL_AGENT_URL,
}) => {
  const effectiveApiBase = (apiBaseUrlOverride ?? API_BASE_URL).replace(/\/+$/, '');
  const isRemoteCloudApi = !isLocalHostnameUrl(effectiveApiBase);

  const [status, setStatus] = useState<NetworkStatusPayload | null>(null);
  const [firewall, setFirewall] = useState<FirewallStatusPayload | null>(null);
  const [localAgentActive, setLocalAgentActive] = useState<boolean>(!isRemoteCloudApi);
  const [qrState, setQrState] = useState<{ url: string; svg: string } | null>(null);
  const [manualPiInput, setManualPiInput] = useState<string>('');
  const [selectedInterfaceIp, setSelectedInterfaceIp] = useState<string>('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [testResultSummary, setTestResultSummary] = useState<string[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const resolveControlUrl = useCallback(
    (path: string, useLocalAgent: boolean): string => {
      if (useLocalAgent && isRemoteCloudApi) {
        const clean = path.startsWith('/') ? path : `/${path}`;
        return `${localAgentUrl.replace(/\/+$/, '')}${clean}`;
      }
      if (apiBaseUrlOverride) {
        const clean = path.startsWith('/') ? path : `/${path}`;
        return `${effectiveApiBase}${clean}`;
      }
      return getApiUrl(path);
    },
    [apiBaseUrlOverride, effectiveApiBase, isRemoteCloudApi, localAgentUrl]
  );

  const loadAll = useCallback(async () => {
    try {
      let useLocal = false;
      let netData: NetworkStatusPayload | null = null;

      if (isRemoteCloudApi) {
        try {
          netData = await apiRequest<NetworkStatusPayload>(
            `${localAgentUrl.replace(/\/+$/, '')}${API_ENDPOINTS.NETWORK_STATUS}`,
            { timeoutMs: 2500, retries: 0 }
          );
          useLocal = true;
        } catch {
          useLocal = false;
        }
      }

      if (!netData) {
        netData = await apiRequest<NetworkStatusPayload>(resolveControlUrl(API_ENDPOINTS.NETWORK_STATUS, false), {
          timeoutMs: 8000,
        });
      }

      const fwData = await apiRequest<FirewallStatusPayload>(
        resolveControlUrl(API_ENDPOINTS.NETWORK_FIREWALL_STATUS, useLocal),
        { timeoutMs: 8000, retries: 0 }
      ).catch(() => null);

      if (!mountedRef.current) return;
      setLocalAgentActive(!isRemoteCloudApi || useLocal);
      setStatus(netData);
      if (netData.detected_network?.selected_ip && !selectedInterfaceIp) {
        setSelectedInterfaceIp(netData.detected_network.selected_ip);
      }
      if (netData.raspberry_pi?.manual_endpoint && !manualPiInput) {
        setManualPiInput(netData.raspberry_pi.manual_endpoint);
      }
      if (fwData) {
        setFirewall(fwData);
      }
      setErrorMessage(null);
    } catch (err) {
      if (mountedRef.current) {
        setErrorMessage(err instanceof Error ? err.message : 'Unable to fetch network discovery status');
      }
    }
}, [isRemoteCloudApi, localAgentUrl, manualPiInput, resolveControlUrl, selectedInterfaceIp]);

useEffect(() => {
  mountedRef.current = true;
  const runInitial = async () => {
    await loadAll();
  };
  void runInitial();
  const timer = setInterval(() => {
    void loadAll();
  }, pollIntervalMs);
  return () => {
    mountedRef.current = false;
    clearInterval(timer);
  };
}, [loadAll, pollIntervalMs]);

const activeSimulatorUrl = status?.simulator?.url_with_token || status?.simulator?.url || '';
const qrSvg = activeSimulatorUrl && qrState?.url === activeSimulatorUrl ? qrState.svg : '';

useEffect(() => {
  let active = true;
  if (!activeSimulatorUrl) {
    return () => {
      active = false;
    };
  }
  QRCode.toString(activeSimulatorUrl, {
    type: 'svg',
    margin: 1,
    width: 152,
    color: { dark: '#0f172a', light: '#ffffff' },
  })
    .then((svg) => {
      if (active) setQrState({ url: activeSimulatorUrl, svg });
    })
    .catch(() => {
      if (active) setQrState(null);
    });
  return () => {
    active = false;
  };
}, [activeSimulatorUrl]);

const handleDiscover = async (autoConnect = false, preferredIpOverride?: string) => {
  setBusyAction(autoConnect ? 'auto_connect' : 'discover');
  setErrorMessage(null);
  try {
      const data = await apiRequest<NetworkStatusPayload>(resolveControlUrl(API_ENDPOINTS.NETWORK_DISCOVER, localAgentActive), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferred_ip: preferredIpOverride ?? (selectedInterfaceIp || null),
          manual_pi_endpoint: manualPiInput.trim() || null,
          auto_connect: autoConnect,
        }),
        timeoutMs: 12000,
      });
      if(!mountedRef.current) return;
    setStatus(data);
    if (data.detected_network?.selected_ip) {
      setSelectedInterfaceIp(data.detected_network.selected_ip);
    }
  } catch (err) {
    if (mountedRef.current) {
      setErrorMessage(err instanceof Error ? err.message : 'Discovery failed');
    }
  } finally {
    if (mountedRef.current) setBusyAction(null);
  }
};

const handleModeSwitch = async (mode: 'AUTO' | 'PI' | 'LAPTOP_FALLBACK') => {
  setBusyAction(`mode_${mode}`);
  setErrorMessage(null);
  try {
      const data = await apiRequest<NetworkStatusPayload>(resolveControlUrl(API_ENDPOINTS.NETWORK_MODE, localAgentActive), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, force_switch_to_pi: mode === 'PI' }),
        timeoutMs: 12000,
      });
      if(!mountedRef.current) return;
    setStatus(data);
  } catch (err) {
    if (mountedRef.current) {
      setErrorMessage(err instanceof Error ? err.message : 'Mode switch failed');
    }
  } finally {
    if (mountedRef.current) setBusyAction(null);
  }
};

const handleRefreshToken = async () => {
  setBusyAction('token');
  try {
      await apiRequest(resolveControlUrl(API_ENDPOINTS.NETWORK_PAIRING_TOKEN, localAgentActive), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl_seconds: 900 }),
        timeoutMs: 8000,
      });
      await loadAll();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to rotate pairing token');
    } finally {
      if (mountedRef.current) setBusyAction(null);
    }
  };

  const handleTestConnection = async () => {
    setBusyAction('test');
    setErrorMessage(null);
    try {
      const res = await apiRequest<{
        local_network: { ok: boolean; selected_ip: string | null; network_name: string | null };
        raspberry_pi: { reachable: boolean; url?: string };
        laptop_fallback: { running: boolean; reachable: boolean };
        backend: { reachable: boolean; service_status: string };
        firewall: FirewallStatusPayload;
        diagnostics: string[];
      } > (resolveControlUrl(API_ENDPOINTS.NETWORK_TEST_CONNECTION, localAgentActive), {
        method: 'POST',
        timeoutMs: 12000,
      });
      if (!mountedRef.current) return;
      setFirewall(res.firewall);
      const summaryLines = [
        `Local IP: ${res.local_network.ok ? `${res.local_network.selected_ip} (${res.local_network.network_name || 'LAN'})` : 'None detected'}`,
        `Raspberry Pi Zero W: ${res.raspberry_pi.reachable ? `Online (${res.raspberry_pi.url || 'mDNS'})` : 'Unreachable'}`,
        `Laptop Direct Fallback: ${res.laptop_fallback.running ? (res.laptop_fallback.reachable ? 'Active & Healthy' : 'Starting / Check Firewall') : 'Standby'}`,
        `Render Backend: ${res.backend.reachable ? 'Reachable' : 'Unreachable (SQLite offline buffer ready)'}`,
        ...res.diagnostics,
      ];
      setTestResultSummary(summaryLines);
      await loadAll();
    } catch (err) {
      if (mountedRef.current) {
        setErrorMessage(err instanceof Error ? err.message : 'Connection diagnostic failed');
      }
    } finally {
      if (mountedRef.current) setBusyAction(null);
    }
  };

  const handleCopyUrl = async () => {
    if (!activeSimulatorUrl) return;
    try {
      await navigator.clipboard.writeText(activeSimulatorUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      setErrorMessage('Clipboard access blocked; copy the displayed URL manually.');
    }
  };

  const activeMode = status?.active_mode || 'SEARCHING';
  const isFallback = activeMode === 'LAPTOP_FALLBACK';
  const isPi = activeMode === 'PI';
  const piRecovered = Boolean(status?.raspberry_pi?.recovered_available);
  const phonePackets = phoneTelemetry?.packets_received ?? status?.laptop_fallback?.packets_accepted ?? 0;
  const isPhoneConnected = phoneTelemetry
    ? phoneTelemetry.link_status === 'LIVE_RPI_ZERO_GATEWAY' || phoneTelemetry.link_status === 'LIVE_LAPTOP_FALLBACK'
    : (status?.laptop_fallback?.ws_clients ?? 0) > 0;
  const bufferedCount = status?.laptop_fallback?.sqlite_buffered_rows ?? 0;

  return (
    <section
      aria-label="Network Setup and Dynamic Fallback Gateway"
      data-testid="network-setup-panel"
      className="glass rounded-xl p-5 border border-cyan-500/25 space-y-4"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Wifi className="w-5 h-5 text-cyan-400" />
          <div>
            <h2 className="font-display text-sm font-bold text-white uppercase tracking-wider">
              Network &amp; Hotspot Gateway Setup
            </h2>
            <p className="text-[11px] font-mono text-slate-400">
              Dynamic Wi-Fi / Mobile Hotspot discovery with Raspberry Pi Zero W &amp; Laptop Direct Fallback
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleDiscover(true)}
            disabled={busyAction !== null}
            className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-300 font-mono text-[11px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <PlugZap className="w-3.5 h-3.5" />
            {busyAction === 'auto_connect' ? 'Connecting...' : 'Auto Connect'}
          </button>
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={busyAction !== null}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-mono text-[11px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'test' ? 'animate-spin' : ''}`} />
            Test Connection
          </button>
        </div>
      </div>

      {/* Cloud / Vercel Hybrid Local Agent Guidance */}
      {isRemoteCloudApi && (
        <div
          data-testid="vercel-agent-status"
          className={`p-3 rounded-lg border text-[11px] font-mono flex flex-wrap items-center justify-between gap-2 ${localAgentActive
              ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-200'
              : 'bg-cyan-500/10 border-cyan-500/35 text-cyan-200'
            }`}
        >
          {localAgentActive ? (
            <span>
              <strong>Connected to Local Laptop Gateway Agent</strong> ({localAgentUrl}) · Telemetry syncs to cloud backend ({effectiveApiBase}).
            </span>
          ) : (
            <span>
              Viewing cloud UI ({effectiveApiBase}). Start the Local Gateway Agent on your laptop (
              <code>powershell -ExecutionPolicy Bypass -File scripts/start_laptop_gateway.ps1</code>) to discover your hotspot IP &amp; generate the QR code right here on Vercel.
            </span>
          )}
        </div>
      )}

      {/* Recovery Notification Banner when Pi returns during active Laptop Fallback */}
      {isFallback && piRecovered && (
        <div
          data-testid="pi-recovery-banner"
          className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-400/45 flex flex-wrap items-center justify-between gap-3 text-xs font-mono"
        >
          <div className="flex items-center gap-2 text-emerald-200">
            <Radio className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Raspberry Pi Zero W is back online</strong> ({status?.raspberry_pi?.endpoint}). Current fallback
              session stays uninterrupted until you switch cleanly.
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleModeSwitch('PI')}
            disabled={busyAction !== null}
            className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Switch to Raspberry Pi
          </button>
        </div>
      )}

      {/* Firewall Public Network Warning */}
      {firewall?.public_profile_warning && (
        <div
          data-testid="firewall-public-warning"
          className="p-3 rounded-lg bg-rose-500/15 border border-rose-400/45 text-xs font-mono text-rose-200 flex items-start gap-2"
        >
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-rose-300">Windows Network Profile is PUBLIC</div>
            <div>{firewall.summary}</div>
            {firewall.recommended_command && (
              <div className="mt-1 text-[11px] text-amber-200">
                Then run in elevated PowerShell: <code>{firewall.recommended_command}</code>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Badges Grid (Exact Section 12 States) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
        <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
          <div className="text-[10px] text-slate-400 uppercase">Active Ground Station</div>
          <div className={`font-bold mt-0.5 ${isFallback ? 'text-amber-300' : isPi ? 'text-emerald-300' : 'text-cyan-300'}`}>
            {isPi
              ? 'Raspberry Pi Ground Station Active'
              : isFallback
                ? 'Laptop Fallback Active (Emergency Mode)'
                : activeMode === 'CLOUD_HOST'
                ? 'Cloud Host Only (Start Local Agent)'
                : 'Searching for Raspberry Pi...'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">{status?.ground_station_id || 'KX-RPI-ZERO-GS-001'}</div>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
          <div className="text-[10px] text-slate-400 uppercase">Raspberry Pi Zero W</div>
          <div className={`font-bold mt-0.5 ${status?.raspberry_pi?.reachable ? 'text-emerald-300' : 'text-amber-300'}`}>
            {status?.raspberry_pi?.reachable ? 'Reachable' : 'Raspberry Pi Unreachable'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">
            {status?.raspberry_pi?.endpoint || status?.raspberry_pi?.mdns_hostname || 'anishraspberrypizero.local'}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
          <div className="text-[10px] text-slate-400 uppercase">Phone Link &amp; Buffer</div>
          <div className={`font-bold mt-0.5 ${isPhoneConnected ? 'text-emerald-300' : 'text-slate-200'}`}>
            {isPhoneConnected ? `Phone Connected (${phonePackets} pkts)` : 'Awaiting Phone Stream'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {bufferedCount > 0 ? `Offline Buffered (${bufferedCount} queued)` : 'Offline Buffer Clear (0 queued)'}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
          <div className="text-[10px] text-slate-400 uppercase">Render Backend</div>
          <div className={`font-bold mt-0.5 ${status?.backend?.reachable ? 'text-emerald-300' : 'text-amber-300'}`}>
            {status?.backend?.reachable ? 'Backend Synced' : 'Backend Unavailable (Buffering)'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">{status?.backend?.url || 'kesslerx-backend.onrender.com'}</div>
        </div>
      </div>

      {/* Mode Selector + Detected Interface Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-mono font-bold text-slate-200 uppercase">Operating Mode</span>
            <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden text-[11px] font-mono">
              {(['AUTO', 'PI', 'LAPTOP_FALLBACK'] as const).map((mode) => {
                const active = status?.mode_preference === mode;
                const label = mode === 'AUTO' ? 'Auto' : mode === 'PI' ? 'Raspberry Pi' : 'Laptop Fallback';
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleModeSwitch(mode)}
                    disabled={busyAction !== null}
                    className={`px-2.5 py-1 font-bold transition-colors cursor-pointer ${active
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                      }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div>
              <div className="text-[10px] text-slate-400">Detected Network</div>
              <div className="text-white font-semibold truncate">
                {status?.detected_network?.network_name || 'Scanning...'}
                {status?.detected_network?.profile_type ? ` (${status.detected_network.profile_type})` : ''}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">Laptop Local IP</div>
              <div className="text-cyan-300 font-semibold">
                {status?.detected_network?.selected_ip || 'Unavailable'}
              </div>
            </div>
          </div>

          {/* Usable Adapter Selector */}
          {(status?.detected_network?.interfaces?.length ?? 0) > 0 && (
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase">
                Active Wi-Fi / Hotspot Interface
              </label>
              <select
                aria-label="Active Wi-Fi or Hotspot Interface"
                value={selectedInterfaceIp || status?.detected_network?.selected_ip || ''}
                onChange={(e) => {
                  const nextIp = e.target.value;
                  setSelectedInterfaceIp(nextIp);
                  void handleDiscover(false, nextIp);
                }}
                className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200"
              >
                {status?.detected_network?.interfaces?.map((iface) => (
                  <option key={`${iface.interface_alias}-${iface.ip_address}`} value={iface.ip_address}>
                    {iface.interface_alias} — {iface.ip_address} ({iface.network_name})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Manual Pi Endpoint Override */}
          <div>
            <label className="block text-[10px] font-mono text-slate-400 mb-1 uppercase">
              Manual Raspberry Pi IP / Endpoint (Optional Fallback Discovery)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualPiInput}
                onChange={(e) => setManualPiInput(e.target.value)}
                placeholder="e.g. anishraspberrypizero.local or Pi IP"
                className="flex-1 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => handleDiscover(false)}
                disabled={busyAction !== null}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-mono text-slate-200 cursor-pointer"
              >
                Probe
              </button>
            </div>
          </div>

          {/* Firewall Summary */}
          {firewall && (
            <div className="p-2 rounded bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-slate-300 flex items-start gap-2">
              <ShieldCheck className={`w-4 h-4 shrink-0 mt-0.5 ${firewall.public_profile_warning ? 'text-rose-400' : firewall.private_rule_configured ? 'text-emerald-400' : 'text-amber-400'}`} />
              <div>
                <div>{firewall.summary}</div>
                {firewall.recommended_command && !firewall.private_rule_configured && (
                  <div className="text-[10px] text-amber-300 mt-0.5">
                    Script: <code>{firewall.recommended_command}</code>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Phone Simulator URL + Scannable QR Code */}
        <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono font-bold text-slate-200 uppercase flex items-center gap-1.5">
              <QrCode className="w-4 h-4 text-[#FF2EF5]" />
              Phone Simulator Link &amp; QR Pairing
            </span>
            {isFallback && (
              <button
                type="button"
                onClick={handleRefreshToken}
                disabled={busyAction !== null}
                className="text-[10px] font-mono text-cyan-300 hover:text-cyan-200 underline cursor-pointer"
              >
                Rotate Token
              </button>
            )}
          </div>

          {activeSimulatorUrl ? (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              {qrSvg && (
                <div
                  data-testid="simulator-qr-code"
                  className="p-2 rounded-lg bg-white shrink-0 border border-slate-300"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              )}
              <div className="flex-1 min-w-0 space-y-2 text-[11px] font-mono">
                <div className="text-slate-400">
                  Open this URL on your phone browser ({isPi ? 'Pi Zero W HTTPS' : 'Laptop Fallback HTTPS'}):
                </div>
                <div
                  data-testid="generated-simulator-url"
                  className="p-2 rounded bg-slate-900 border border-slate-700 text-cyan-300 break-all select-all"
                >
                  {activeSimulatorUrl}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="px-3 py-1 rounded bg-[#FF2EF5]/15 hover:bg-[#FF2EF5]/25 border border-[#FF2EF5]/40 text-[#F9A8D4] font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedUrl ? 'Copied' : 'Copy URL'}
                  </button>
                  {isFallback && (
                    <span className="text-[10px] text-amber-300 flex items-center gap-1">
                      <Laptop className="w-3 h-3" /> Accept self-signed TLS cert on phone browser once
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded bg-slate-900/70 border border-slate-800 text-xs font-mono text-slate-400 flex items-center gap-2">
              <Server className="w-4 h-4 text-slate-500" />
              <span>
                Click <strong>Auto Connect</strong> or switch to <strong>Laptop Fallback</strong> to generate the live HTTPS simulator URL and QR code.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Warnings & Diagnostic Test Output */}
      {(status?.warnings?.length ?? 0) > 0 && (
        <div className="space-y-1">
          {status!.warnings.map((warn, idx) => (
            <div
              key={`${warn}-${idx}`}
              className="px-3 py-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] font-mono text-amber-200 flex items-center gap-2"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{warn}</span>
            </div>
          ))}
        </div>
      )}

      {testResultSummary && (
        <div
          data-testid="connection-test-results"
          className="p-3 rounded-lg bg-slate-950/90 border border-cyan-500/30 text-[11px] font-mono text-slate-200 space-y-1"
        >
          <div className="font-bold text-cyan-300 uppercase">Diagnostic Check Summary</div>
          {testResultSummary.map((line, i) => (
            <div key={i}>• {line}</div>
          ))}
        </div>
      )}

      {errorMessage && (
        <div className="px-3 py-1.5 rounded bg-rose-500/15 border border-rose-500/40 text-[11px] font-mono text-rose-200">
          {errorMessage}
        </div>
      )}
    </section>
  );
};

export default NetworkSetupPanel;
