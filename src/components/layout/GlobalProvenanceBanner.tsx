import React, { useState } from 'react';
import { ShieldAlert, Activity, ChevronDown, ChevronUp, Database, AlertTriangle } from 'lucide-react';

interface GlobalProvenanceBannerProps {
  mode?: 'live' | 'cached' | 'simulated' | 'fallback';
}

export const GlobalProvenanceBanner: React.FC<GlobalProvenanceBannerProps> = ({
  mode = 'fallback',
}) => {
  const [expanded, setExpanded] = useState(false);

  const isLive = mode === 'live';

  return (
    <aside
      aria-label="System operational mode and data provenance"
      className={`w-full border-b text-xs transition-colors ${
        isLive
          ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
          : 'bg-amber-950/40 border-amber-500/30 text-amber-200'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 py-1.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          {isLive ? (
            <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-pulse" />
          ) : (
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          )}
          <span className="font-mono font-bold uppercase tracking-wider text-[11px]">
            {isLive ? 'LIVE OBSERVATIONAL MODE' : 'DEMO FIXTURE & LOCAL PROPAGATION MODE'}
          </span>
          <span className="text-white/40 hidden sm:inline">|</span>
          <span className="text-white/80 hidden md:inline truncate">
            {isLive
              ? 'Telemetry and TLE data backed by upstream Space-Track / NOAA feeds.'
              : 'Upstream feeds unauthenticated or offline. Using validated demo fixtures & local SGP4 propagation.'}
          </span>
          <span className="text-amber-400 font-semibold hidden lg:inline ml-2 border border-amber-500/40 px-1.5 py-0.2 rounded bg-amber-500/10 text-[10px]">
            Decision support only — human approval required
          </span>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[11px] font-mono text-white/70 hover:text-white shrink-0 bg-white/5 px-2 py-0.5 rounded border border-white/10"
          aria-expanded={expanded}
        >
          <span>{expanded ? 'Hide Details' : 'Data Provenance'}</span>
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-white/10 px-4 py-3 bg-black/40 text-[11px] font-mono text-white/80 space-y-2">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-2 rounded bg-white/5 border border-white/10 space-y-1">
              <div className="text-white/50 text-[10px] uppercase flex items-center gap-1">
                <Database className="w-3 h-3 text-cyan-400" />
                Orbital Catalog (TLE)
              </div>
              <div className="font-semibold">{isLive ? 'Space-Track Live API' : 'Cached Ephemeris / Demo Fixtures'}</div>
              <div className="text-[10px] text-white/60">
                {isLive ? 'Dynamic orbital elements updated every 12h' : 'Stored active objects with relative TCA computation'}
              </div>
            </div>

            <div className="p-2 rounded bg-white/5 border border-white/10 space-y-1">
              <div className="text-white/50 text-[10px] uppercase flex items-center gap-1">
                <Activity className="w-3 h-3 text-purple-400" />
                Space Weather & Drag
              </div>
              <div className="font-semibold">{isLive ? 'NOAA SWPC Live Feed' : 'Synthesized SWPC Baseline'}</div>
              <div className="text-[10px] text-white/60">
                {isLive ? 'Live Kp index & solar flux F10.7' : 'Nominal geomagnetic index (Kp 3) with atmospheric drag model'}
              </div>
            </div>

            <div className="p-2 rounded bg-white/5 border border-white/10 space-y-1">
              <div className="text-white/50 text-[10px] uppercase flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                Operational Compliance
              </div>
              <div className="font-semibold text-amber-300">Safety Decision Support</div>
              <div className="text-[10px] text-white/60">
                Never generates direct spacecraft commands. All maneuvers require human mission control review.
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default GlobalProvenanceBanner;
