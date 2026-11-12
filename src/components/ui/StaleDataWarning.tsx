import React from 'react';
import { AlertTriangle, Clock, ShieldAlert } from 'lucide-react';
import { evaluateTleFreshness, type TleFreshnessInfo } from '../../utils/tleFreshness';

interface StaleDataWarningProps {
  tleLine1?: string;
  freshnessInfo?: TleFreshnessInfo;
  compact?: boolean;
}

export const StaleDataWarning: React.FC<StaleDataWarningProps> = ({
  tleLine1,
  freshnessInfo: providedInfo,
  compact = false,
}) => {
  const info = providedInfo || evaluateTleFreshness(tleLine1);

  if (!info.isStale && info.severity === 'nominal') {
    return null;
  }

  const isCritical = info.isCritical || info.severity === 'critical';

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono border ${
          isCritical
            ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
            : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
        }`}
        title={info.warningMessage}
      >
        <Clock className="w-3 h-3 shrink-0" />
        <span>TLE: {info.ageHours !== null ? `${info.ageHours}h old` : 'Age Unknown'}</span>
      </div>
    );
  }

  return (
    <div
      className={`p-2.5 rounded-lg border text-xs font-mono space-y-1 ${
        isCritical
          ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
          : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
      }`}
      role="alert"
    >
      <div className="flex items-center gap-2 font-bold uppercase tracking-wide text-[11px]">
        {isCritical ? (
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        )}
        <span>{isCritical ? 'Critical Ephemeris Staleness' : 'Stale Orbital Elements Warning'}</span>
      </div>
      <p className="text-[11px] text-white/80 leading-relaxed">
        {info.warningMessage}
      </p>
      {info.ageHours !== null && (
        <div className="text-[10px] text-white/50 pt-0.5">
          Epoch: {info.epochDate?.toISOString().replace('T', ' ').slice(0, 19)} UTC (Age: {info.ageHours}h / {info.ageDays}d)
        </div>
      )}
    </div>
  );
};

export default StaleDataWarning;

