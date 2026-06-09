interface StatusBadgeProps {
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL' | 'NOMINAL';
  label?: string;
  pulse?: boolean;
}

export default function StatusBadge({ severity, label, pulse = false }: StatusBadgeProps) {
  const styles: Record<string, { bg: string; color: string; border: string; shadow: string }> = {
    HIGH: { bg: 'rgba(255,77,77,0.15)', color: '#FF4D4D', border: 'rgba(255,77,77,0.3)', shadow: '0 0 8px rgba(255,77,77,0.3)' },
    CRITICAL: { bg: 'rgba(255,77,77,0.2)', color: '#FF4D4D', border: 'rgba(255,77,77,0.5)', shadow: '0 0 12px rgba(255,77,77,0.4)' },
    MEDIUM: { bg: 'rgba(255,193,7,0.15)', color: '#FFC107', border: 'rgba(255,193,7,0.3)', shadow: '0 0 8px rgba(255,193,7,0.3)' },
    LOW: { bg: 'rgba(0,174,239,0.15)', color: '#00AEEF', border: 'rgba(0,174,239,0.3)', shadow: '0 0 8px rgba(0,174,239,0.3)' },
    NOMINAL: { bg: 'rgba(0,255,153,0.15)', color: '#00FF99', border: 'rgba(0,255,153,0.3)', shadow: '0 0 8px rgba(0,255,153,0.3)' },
  };

  const s = styles[severity] || styles.LOW;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-space font-semibold tracking-wider ${pulse ? 'animate-pulse' : ''}`}
      style={{
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        boxShadow: s.shadow,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: s.color, boxShadow: `0 0 4px ${s.color}` }}
      />
      {label || severity}
    </span>
  );
}
