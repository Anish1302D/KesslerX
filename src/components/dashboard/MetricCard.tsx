import { motion } from 'framer-motion';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import AnimatedCounter from '../ui/AnimatedCounter';

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  color: string;
  trend?: number;
  trendDir?: 'up' | 'down' | 'neutral';
  delay?: number;
  severity?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export default function MetricCard({ title, value, icon: Icon, color, trend, trendDir, delay = 0, severity }: MetricCardProps) {
  const isNumber = typeof value === 'number';
  const trendColor = trendDir === 'up' ? '#00FF99' : trendDir === 'down' ? '#FF4D4D' : '#94A3B8';
  const TrendIcon = trendDir === 'up' ? TrendingUp : trendDir === 'down' ? TrendingDown : Minus;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="glass-panel glass-panel-hover p-5 cursor-pointer relative overflow-hidden group"
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${color}10 0%, transparent 70%)`,
        }}
      />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-space font-medium tracking-wider" style={{ color: '#94A3B8' }}>
            {title}
          </span>
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300 group-hover:scale-110"
            style={{
              background: `${color}15`,
              border: `1px solid ${color}30`,
            }}
          >
            <Icon className="w-4 h-4" style={{ color, filter: `drop-shadow(0 0 6px ${color})` }} />
          </div>
        </div>

        {/* Value */}
        <div className="mb-2">
          {isNumber ? (
            <span className="text-2xl font-orbitron font-bold text-white">
              <AnimatedCounter value={value} />
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-orbitron font-bold text-white">{value}</span>
              {severity && (
                <span
                  className="text-[10px] font-space font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: severity === 'HIGH' ? 'rgba(255,77,77,0.15)' : severity === 'MEDIUM' ? 'rgba(255,193,7,0.15)' : 'rgba(0,174,239,0.15)',
                    color: severity === 'HIGH' ? '#FF4D4D' : severity === 'MEDIUM' ? '#FFC107' : '#00AEEF',
                    border: `1px solid ${severity === 'HIGH' ? 'rgba(255,77,77,0.3)' : severity === 'MEDIUM' ? 'rgba(255,193,7,0.3)' : 'rgba(0,174,239,0.3)'}`,
                  }}
                >
                  {severity}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Trend */}
        {trend !== undefined && (
          <div className="flex items-center gap-1">
            <TrendIcon className="w-3.5 h-3.5" style={{ color: trendColor }} />
            <span className="text-xs font-space" style={{ color: trendColor }}>
              {Math.abs(trend)}%
            </span>
            <span className="text-xs font-space" style={{ color: '#64748B' }}>
              vs last month
            </span>
          </div>
        )}
      </div>

      {/* Bottom accent line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />
    </motion.div>
  );
}
