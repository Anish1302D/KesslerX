import { useState } from 'react';
import {
  Activity,
  Server,
  Database,
  Radio,
  Cpu,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { useConnectivityDiagnostics } from '../../hooks/useConnectivityDiagnostics';
import { detectWebGLSupport } from '../../utils/webglDetection';

interface SystemHealthPanelProps {
  isWsConnected?: boolean;
}

export default function SystemHealthPanel({ isWsConnected = false }: SystemHealthPanelProps) {
  const { diagnostic, loading, checkNow } = useConnectivityDiagnostics(30000);
  const [expanded, setExpanded] = useState(false);
  const webgl = detectWebGLSupport();

  const getStatusBadge = (status: 'online' | 'degraded' | 'offline') => {
    switch (status) {
      case 'online':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            OPERATIONAL
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            DEGRADED
          </span>
        );
      case 'offline':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3 h-3 text-rose-400" />
            OFFLINE
          </span>
        );
    }
  };

  const getDependencyPill = (name: string, state?: string) => {
    const isNominal = state === 'active' || state === 'connected' || state === 'available';
    const isDegraded = state === 'in-memory-fallback' || state === 'mock-fallback' || state === 'fallback';

    return (
      <div key={name} className="flex items-center justify-between p-2 rounded bg-surface-container-highest/20 border border-outline-variant/20 text-[11px]">
        <span className="text-on-surface-variant font-mono capitalize">
          {name.replace('_', ' ')}
        </span>
        <span
          className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
            isNominal
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              : isDegraded
              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
          }`}
        >
          {state || 'unknown'}
        </span>
      </div>
    );
  };

  return (
    <div className="glass p-inner-padding rounded-xl border border-outline-variant/30 space-y-3">
      {/* Header Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary animate-pulse" />
          <h3 className="font-headline-sm text-headline-sm uppercase tracking-wider text-on-surface">
            System Health & Diagnostics
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(diagnostic.status)}
          <button
            onClick={() => checkNow()}
            disabled={loading}
            title="Re-run Diagnostics"
            className="p-1 rounded bg-surface-container-highest/30 hover:bg-surface-container-highest/60 text-on-surface-variant hover:text-on-surface border border-outline-variant/30 transition-all disabled:opacity-50"
            aria-label="Refresh status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary' : ''}`} />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded bg-surface-container-highest/30 hover:bg-surface-container-highest/60 text-on-surface-variant hover:text-on-surface border border-outline-variant/30 transition-all"
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Primary Status Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {/* Backend API */}
        <div className="p-2.5 rounded-lg bg-surface-container-low/40 border border-outline-variant/20 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-on-surface-variant/70 text-[10px] font-mono uppercase">
            <Server className="w-3 h-3 text-cyan-400" />
            Backend REST
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className={`font-bold font-mono ${diagnostic.status === 'offline' ? 'text-rose-400' : 'text-emerald-400'}`}>
              {diagnostic.status === 'offline' ? 'Unreachable' : `${diagnostic.latencyMs}ms`}
            </span>
            <span className="text-[10px] text-on-surface-variant/60 font-mono">
              {diagnostic.status}
            </span>
          </div>
        </div>

        {/* WebSocket */}
        <div className="p-2.5 rounded-lg bg-surface-container-low/40 border border-outline-variant/20 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-on-surface-variant/70 text-[10px] font-mono uppercase">
            <Radio className="w-3 h-3 text-purple-400" />
            WS Stream
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className={`font-bold font-mono ${isWsConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isWsConnected ? 'Connected' : 'Connecting'}
            </span>
            <span className="text-[10px] text-on-surface-variant/60 font-mono">
              {isWsConnected ? 'Live' : 'Retrying'}
            </span>
          </div>
        </div>

        {/* Graphics Engine */}
        <div className="p-2.5 rounded-lg bg-surface-container-low/40 border border-outline-variant/20 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-on-surface-variant/70 text-[10px] font-mono uppercase">
            <Cpu className="w-3 h-3 text-amber-400" />
            3D Graphics
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className={`font-bold font-mono ${webgl.supported ? 'text-emerald-400' : 'text-rose-400'}`}>
              {webgl.supported ? (webgl.webgl2 ? 'WebGL 2' : 'WebGL 1') : '2D Table'}
            </span>
            <span className="text-[10px] text-on-surface-variant/60 font-mono">
              {webgl.supported ? 'Hardware' : 'Fallback'}
            </span>
          </div>
        </div>

        {/* Upstream Sources */}
        <div className="p-2.5 rounded-lg bg-surface-container-low/40 border border-outline-variant/20 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-on-surface-variant/70 text-[10px] font-mono uppercase">
            <Database className="w-3 h-3 text-teal-400" />
            Data Feeds
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-bold font-mono text-cyan-300">
              {Object.keys(diagnostic.dependencies).length > 0 ? `${Object.keys(diagnostic.dependencies).length} active` : 'Local'}
            </span>
            <span className="text-[10px] text-on-surface-variant/60 font-mono">
              Synced
            </span>
          </div>
        </div>
      </div>

      {/* Expanded Granular Diagnostics */}
      {expanded && (
        <div className="pt-2 border-t border-outline-variant/20 space-y-3">
          <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
            <span>Target Host: <strong className="text-on-surface">{diagnostic.endpoint || 'http://localhost:8000'}</strong></span>
            <span>Last Probe: <strong>{diagnostic.lastChecked ? new Date(diagnostic.lastChecked).toLocaleTimeString() : 'Pending'}</strong></span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-on-surface-variant/70 tracking-wider">
              Subsystem & Dependency Statuses
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(diagnostic.dependencies).map(([depName, depState]) =>
                getDependencyPill(depName, depState)
              )}
            </div>
          </div>

          {diagnostic.error && (
            <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] font-mono">
              Diagnostic warning: {diagnostic.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
