import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, Filter, Search, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { alerts } from '../data/mockData';
import StatusBadge from '../components/ui/StatusBadge';

export default function AlertCenter() {
  const [filter, setFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = alerts.filter((a) => {
    if (filter !== 'ALL' && a.severity !== filter) return false;
    if (searchQuery && !a.title.toLowerCase().includes(searchQuery.toLowerCase()) && !a.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const counts = {
    ALL: alerts.length,
    HIGH: alerts.filter((a) => a.severity === 'HIGH').length,
    MEDIUM: alerts.filter((a) => a.severity === 'MEDIUM').length,
    LOW: alerts.filter((a) => a.severity === 'LOW').length,
  };

  return (
    <div className="space-y-5 pb-16">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-orbitron font-bold text-white flex items-center gap-3">
          <Bell className="w-7 h-7" style={{ color: '#FFC107', filter: 'drop-shadow(0 0 8px rgba(255,193,7,0.5))' }} />
          Alert Center
        </h1>
        <p className="text-sm font-space mt-1" style={{ color: '#94A3B8' }}>
          Comprehensive alert management and history
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Alerts', value: alerts.length, color: '#00AEEF', icon: Bell },
          { label: 'Critical', value: counts.HIGH, color: '#FF4D4D', icon: AlertTriangle },
          { label: 'Resolved Today', value: 14, color: '#00FF99', icon: CheckCircle2 },
          { label: 'Avg Response', value: '2.3m', color: '#00E5FF', icon: Info },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.1 }}
            className="glass-panel glass-panel-hover p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-space font-semibold tracking-wider" style={{ color: '#94A3B8' }}>{card.label}</span>
              <card.icon className="w-4 h-4" style={{ color: card.color }} />
            </div>
            <span className="text-2xl font-orbitron font-bold" style={{ color: card.color }}>{card.value}</span>
          </motion.div>
        ))}
      </div>

      {/* Filters & Search */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-panel p-4 flex flex-col md:flex-row items-center gap-4"
      >
        <div className="flex items-center gap-2 flex-shrink-0">
          <Filter className="w-4 h-4" style={{ color: '#94A3B8' }} />
          {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="text-[11px] font-space font-semibold tracking-wider px-3 py-1.5 rounded-lg transition-all duration-200"
              style={{
                background: filter === f ? 'rgba(0,174,239,0.2)' : 'transparent',
                color: filter === f ? '#00AEEF' : '#64748B',
                border: `1px solid ${filter === f ? 'rgba(0,174,239,0.3)' : 'rgba(0,174,239,0.1)'}`,
              }}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>

        <div
          className="flex-1 flex items-center rounded-lg px-3 py-2"
          style={{ background: 'rgba(11,18,32,0.6)', border: '1px solid rgba(0,174,239,0.15)' }}
        >
          <Search className="w-3.5 h-3.5 mr-2" style={{ color: '#64748B' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search alerts..."
            className="bg-transparent border-none outline-none text-xs font-space w-full"
            style={{ color: '#fff' }}
          />
        </div>
      </motion.div>

      {/* Alert List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="space-y-3"
      >
        {filtered.map((alert, i) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 + i * 0.05 }}
            className="glass-panel glass-panel-hover p-4 cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <StatusBadge severity={alert.severity} />
                  <span className="text-[10px] font-space" style={{ color: '#64748B' }}>
                    {new Date(alert.timestamp).toLocaleString()}
                  </span>
                  <span className="text-[10px] font-orbitron" style={{ color: '#00AEEF' }}>{alert.id}</span>
                </div>
                <h4 className="text-sm font-space font-medium text-white mb-1">{alert.title}</h4>
                <p className="text-xs font-inter" style={{ color: '#94A3B8' }}>{alert.description}</p>
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  className="text-[10px] font-space px-3 py-1.5 rounded-lg transition-all duration-200 hover:scale-105"
                  style={{ background: 'rgba(0,174,239,0.1)', color: '#00AEEF', border: '1px solid rgba(0,174,239,0.2)' }}
                >
                  Details
                </button>
                <button
                  className="text-[10px] font-space px-3 py-1.5 rounded-lg transition-all duration-200 hover:scale-105"
                  style={{ background: 'rgba(0,255,153,0.1)', color: '#00FF99', border: '1px solid rgba(0,255,153,0.2)' }}
                >
                  Resolve
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
