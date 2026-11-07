import React, { useState } from 'react';
import { type DataEnvelope } from '../../types/dataEnvelope';
import { ShieldAlert, Database, Info, AlertTriangle } from 'lucide-react';

interface ProvenanceBadgeProps {
  envelope?: DataEnvelope<unknown> | null;
  source?: string;
  mode?: 'observed' | 'derived' | 'simulated' | 'fallback';
  observedAt?: string;
  generatedAt?: string;
  warnings?: string[];
  compact?: boolean;
}

export const ProvenanceBadge: React.FC<ProvenanceBadgeProps> = ({
  envelope,
  source: explicitSource,
  mode: explicitMode,
  observedAt: explicitObservedAt,
  generatedAt: explicitGeneratedAt,
  warnings: explicitWarnings = [],
  compact = false,
}) => {
  const [currentTs] = useState(() => Date.now());
  const source = envelope?.source || explicitSource || 'local';
  const mode = envelope?.mode || explicitMode || 'derived';
  const timestamp = envelope?.generatedAt || envelope?.observedAt || explicitGeneratedAt || explicitObservedAt || new Date(currentTs).toISOString();
  const warnings = envelope?.warnings?.length ? envelope.warnings : explicitWarnings;

  const ageMinutes = Math.max(0, Math.round((currentTs - new Date(timestamp).getTime()) / 60000));
  const ageLabel = ageMinutes < 1 ? '<1m ago' : ageMinutes < 60 ? `${ageMinutes}m ago` : `${Math.floor(ageMinutes / 60)}h ago`;

  const modeConfig: Record<string, { label: string; bg: string; text: string; border: string }> = {
    observed: {
      label: 'Observed',
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
    },
    derived: {
      label: 'Derived',
      bg: 'bg-cyan-500/10',
      text: 'text-cyan-400',
      border: 'border-cyan-500/30',
    },
    simulated: {
      label: 'Simulated',
      bg: 'bg-purple-500/10',
      text: 'text-purple-400',
      border: 'border-purple-500/30',
    },
    fallback: {
      label: 'Fallback / Demo Fixture',
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
    },
  };

  const currentMode = modeConfig[mode] || modeConfig.derived;

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded border border-white/10 bg-white/5" title={`Source: ${source} | ${ageLabel} | Mode: ${mode}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${mode === 'observed' ? 'bg-emerald-400' : mode === 'fallback' ? 'bg-amber-400' : 'bg-cyan-400'}`} />
        <span className="text-white/70 uppercase">{source}</span>
        <span className="text-white/40">·</span>
        <span className="text-white/50">{ageLabel}</span>
        {warnings.length > 0 && (
          <span title={warnings.join('; ')}>
            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 ml-0.5" />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {/* Mode badge */}
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] uppercase font-bold border ${currentMode.bg} ${currentMode.text} ${currentMode.border}`}>
        {mode === 'fallback' ? <ShieldAlert className="w-3 h-3" /> : <Database className="w-3 h-3" />}
        {currentMode.label}
      </span>

      {/* Source badge */}
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] text-white/80 bg-white/5 border border-white/10">
        <span className="text-white/40">SRC:</span>
        <span className="font-semibold">{source}</span>
      </span>

      {/* Age badge */}
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] text-white/60 bg-white/5 border border-white/10">
        <Info className="w-2.5 h-2.5 text-white/40" />
        <span>{ageLabel}</span>
      </span>

      {/* Warnings */}
      {warnings.map((warn, i) => (
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>{warn}</span>
        </span>
      ))}
    </div>
  );
};

export default ProvenanceBadge;
