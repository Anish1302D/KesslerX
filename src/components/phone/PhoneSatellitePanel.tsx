import React, { useState } from 'react';
import { Smartphone, Radio, ChevronDown, ChevronUp, ShieldAlert, Compass, Crosshair } from 'lucide-react';
import {
  PHONE_SATELLITE_SAFETY_LABELS,
  type PhoneSatelliteData,
} from '../../utils/phoneSatelliteOrbit';

interface PhoneSatellitePanelProps {
  phoneSatellite: PhoneSatelliteData;
  onSelectPhoneSatellite?: () => void;
  defaultExpanded?: boolean;
  compact?: boolean;
}

const RISK_STYLES: Record<string, string> = {
  SAFE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  LOW: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
  MEDIUM: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  HIGH: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
  CRITICAL: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
};

export const PhoneSatellitePanel: React.FC<PhoneSatellitePanelProps> = ({
  phoneSatellite,
  onSelectPhoneSatellite,
  defaultExpanded = true,
  compact = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const telem = phoneSatellite.telemetry;
  const conj = phoneSatellite.conjunction;
  const ori = telem.orientation;
  const isLive = telem.link_status === 'LIVE_RPI3_GATEWAY';
  const riskClass = RISK_STYLES[conj.risk_level] || RISK_STYLES.SAFE;

  return (
    <section
      aria-label="Phone Satellite Demonstration Telemetry"
      data-testid="phone-satellite-panel"
      className="glass rounded-xl border border-[#FF2EF5]/40 bg-[#060e20]/90 text-xs overflow-hidden shadow-xl"
    >
      {/* Compact Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 border-b border-[#FF2EF5]/20 cursor-pointer hover:bg-[#FF2EF5]/10 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: '#FF2EF5', boxShadow: '0 0 8px #FF2EF5' }}
          />
          <Smartphone className="w-3.5 h-3.5 text-[#FF2EF5] shrink-0" />
          <span className="font-label-mono font-bold text-white truncate">PHONE SATELLITE</span>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#FF2EF5]/15 text-[#FF2EF5] border border-[#FF2EF5]/35 shrink-0">
            DEMO SIMULATION
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono border font-bold ${riskClass}`}>
            {conj.risk_level} ({conj.collision_probability_pct.toFixed(1)}%)
          </span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </div>
      </div>

      {expanded && (
        <div className={`p-3 space-y-2.5 ${compact ? 'text-[11px]' : 'text-xs'}`}>
          {/* Safety & Provenance Badges */}
          <div className="space-y-1">
            <div className="px-2 py-1 rounded bg-[#FF2EF5]/10 border border-[#FF2EF5]/30 text-[10px] font-mono text-[#F9A8D4] font-semibold">
              {PHONE_SATELLITE_SAFETY_LABELS.simulated}
            </div>
            <div className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] font-mono text-amber-300">
              {PHONE_SATELLITE_SAFETY_LABELS.mockOrbit}
            </div>
          </div>

          {/* Ground Station Link */}
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-300 bg-slate-950/60 px-2.5 py-1.5 rounded border border-slate-800">
            <span className="flex items-center gap-1.5">
              <Radio className={`w-3 h-3 ${isLive ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
              <span>GS: {telem.ground_station_id}</span>
            </span>
            <span className={isLive ? 'text-emerald-400 font-bold' : 'text-amber-300'}>
              {isLive ? `LIVE (#${telem.sequence})` : 'AWAITING RPI3'}
            </span>
          </div>

          {/* Attitude Orientation Grid */}
          <div>
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
              <span className="flex items-center gap-1 uppercase">
                <Compass className="w-3 h-3 text-[#FF2EF5]" /> Attitude (Deg)
              </span>
              <span>Tilt: <strong className="text-white">{conj.tilt_magnitude_deg.toFixed(1)}°</strong></span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 font-mono text-center">
              <div className="bg-slate-950/70 rounded p-1.5 border border-slate-800">
                <div className="text-[9px] text-slate-400">ROLL</div>
                <div className="text-white font-bold">{ori.roll_deg.toFixed(1)}°</div>
              </div>
              <div className="bg-slate-950/70 rounded p-1.5 border border-slate-800">
                <div className="text-[9px] text-slate-400">PITCH</div>
                <div className="text-white font-bold">{ori.pitch_deg.toFixed(1)}°</div>
              </div>
              <div className="bg-slate-950/70 rounded p-1.5 border border-slate-800">
                <div className="text-[9px] text-slate-400">YAW</div>
                <div className="text-white font-bold">{ori.yaw_deg.toFixed(1)}°</div>
              </div>
            </div>
          </div>

          {/* Tilt-Driven Demonstration Collision Probability */}
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 text-amber-400" />
                Demonstration collision probability
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono border font-bold ${riskClass}`}>
                {conj.risk_level}
              </span>
            </div>

            <div className="flex items-baseline justify-between font-mono">
              <span className="text-base font-bold text-white">
                {conj.collision_probability_pct.toFixed(2)}%
              </span>
              <span className="text-[10px] text-slate-400">
                vs {conj.debris_name}
              </span>
            </div>

            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-150"
                style={{
                  width: `${Math.min(100, (conj.collision_probability / 0.6) * 100)}%`,
                  background:
                    conj.risk_level === 'CRITICAL'
                      ? '#EF4444'
                      : conj.risk_level === 'HIGH'
                      ? '#F97316'
                      : conj.risk_level === 'MEDIUM'
                      ? '#F59E0B'
                      : '#10B981',
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-mono text-slate-400 pt-1">
              <div>Mock Miss: <strong className="text-slate-200">{conj.miss_distance_km} km</strong></div>
              <div>Mock TCA: <strong className="text-slate-200">{conj.tca_hours}h</strong></div>
              <div>Model Conf: <strong className="text-slate-200">{conj.confidence}%</strong></div>
              <div>Source: <strong className="text-slate-200">{conj.source}</strong></div>
            </div>

            <div className="text-[9px] font-mono text-amber-300/90 pt-1 border-t border-slate-800/80">
              {PHONE_SATELLITE_SAFETY_LABELS.demoProbability}
            </div>
            <div className="text-[9px] font-mono text-slate-400">
              Last update: {conj.last_updated ? new Date(conj.last_updated).toLocaleTimeString() : 'Awaiting RPi3 packet'}
            </div>
          </div>

          {onSelectPhoneSatellite && (
            <button
              type="button"
              onClick={onSelectPhoneSatellite}
              className="w-full py-1.5 px-3 rounded-lg bg-[#FF2EF5]/15 hover:bg-[#FF2EF5]/25 border border-[#FF2EF5]/40 text-[#F9A8D4] font-mono text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Crosshair className="w-3.5 h-3.5" />
              Inspect &amp; Follow PHONE SATELLITE
            </button>
          )}

          <p className="text-[9px] font-mono text-amber-400/90 leading-snug">
            {PHONE_SATELLITE_SAFETY_LABELS.disclaimer}
          </p>
        </div>
      )}
    </section>
  );
};

export default PhoneSatellitePanel;
