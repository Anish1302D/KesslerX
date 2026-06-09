import { motion } from 'framer-motion';
import type { Alert } from '../../data/mockData';
import { AlertTriangle, CloudLightning, Radar, Trash2, Plus, AlertCircle } from 'lucide-react';

interface AlertCardProps {
  alert: Alert;
  index: number;
}

const iconMap: Record<string, typeof AlertTriangle> = {
  COLLISION: AlertTriangle,
  SPACE_WEATHER: CloudLightning,
  DEBRIS: Radar,
  DECAY: Trash2,
  NEW_OBJECT: Plus,
};

function AlertCard({ alert, index }: AlertCardProps) {
  const Icon = iconMap[alert.type] || AlertCircle;

  const severityStyles = {
    HIGH: {
      bg: 'rgba(255, 77, 77, 0.06)',
      border: 'rgba(255, 77, 77, 0.15)',
      color: '#FF4D4D',
      label: 'HIGH',
    },
    MEDIUM: {
      bg: 'rgba(255, 193, 7, 0.06)',
      border: 'rgba(255, 193, 7, 0.15)',
      color: '#FFC107',
      label: 'MEDIUM',
    },
    LOW: {
      bg: 'rgba(0, 174, 239, 0.06)',
      border: 'rgba(0, 174, 239, 0.15)',
      color: '#00AEEF',
      label: 'LOW',
    },
  };

  const s = severityStyles[alert.severity];
  const timestamp = new Date(alert.timestamp);
  const timeAgo = getTimeAgo(timestamp);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="rounded-lg p-3 cursor-pointer transition-all duration-200 hover:scale-[1.01]"
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: `${s.color}10`, border: `1px solid ${s.color}20` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: s.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[9px] font-space font-bold tracking-widest px-1.5 py-0.5 rounded"
              style={{ background: `${s.color}20`, color: s.color }}
            >
              {s.label}
            </span>
            <span className="text-[10px] font-space" style={{ color: '#64748B' }}>{timeAgo}</span>
          </div>
          <p className="text-xs font-space font-medium text-white mb-1 truncate">{alert.title}</p>
          <p className="text-[11px] font-inter leading-relaxed line-clamp-2" style={{ color: '#94A3B8' }}>
            {alert.description}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

interface AlertStackProps {
  alerts: Alert[];
}

export default function AlertStack({ alerts }: AlertStackProps) {
  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => (
        <AlertCard key={alert.id} alert={alert} index={i} />
      ))}
    </div>
  );
}
