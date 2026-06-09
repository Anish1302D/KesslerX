import { motion } from 'framer-motion';
import { collisionEvents } from '../data/mockData';
import StatusBadge from '../components/ui/StatusBadge';
import { AlertTriangle, Shield, Navigation, Crosshair, ArrowUpRight } from 'lucide-react';

const statusColors: Record<string, string> = {
  CRITICAL: '#FF4D4D',
  WARNING: '#FFC107',
  CAUTION: '#FF8C00',
  WATCH: '#00AEEF',
  NOMINAL: '#00FF99',
};

export default function CollisionMonitor() {
  return (
    <div className="space-y-5 pb-16">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-orbitron font-bold text-white flex items-center gap-3">
            <AlertTriangle className="w-7 h-7" style={{ color: '#FF4D4D', filter: 'drop-shadow(0 0 8px rgba(255,77,77,0.5))' }} />
            Collision Monitor
          </h1>
          <p className="text-sm font-space mt-1" style={{ color: '#94A3B8' }}>
            Real-time conjunction assessment and collision avoidance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="status-dot status-dot-danger" />
          <span className="text-xs font-space" style={{ color: '#FF4D4D' }}>2 Critical Events</span>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Conjunctions', value: '23', color: '#00AEEF', icon: Crosshair },
          { label: 'Critical Events', value: '2', color: '#FF4D4D', icon: AlertTriangle },
          { label: 'Maneuvers Planned', value: '1', color: '#FFC107', icon: Navigation },
          { label: 'Safe Passages', value: '18', color: '#00FF99', icon: Shield },
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

      {/* Collision Events Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-panel p-5"
      >
        <h3 className="text-sm font-space font-semibold tracking-wider mb-4" style={{ color: '#94A3B8' }}>
          CONJUNCTION ASSESSMENT
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['Event', 'Primary', 'Secondary', 'Probability', 'Miss Dist.', 'Rel. Velocity', 'Status', 'Maneuver'].map((h) => (
                  <th key={h} className="text-[10px] font-space font-semibold tracking-wider text-left py-2 px-3" style={{ color: '#64748B', borderBottom: '1px solid rgba(0,174,239,0.1)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {collisionEvents.map((event, i) => (
                <motion.tr
                  key={event.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="cursor-pointer transition-all duration-200 hover:bg-[rgba(0,174,239,0.05)]"
                  style={{ borderBottom: '1px solid rgba(0,174,239,0.05)' }}
                >
                  <td className="py-3 px-3">
                    <span className="text-xs font-orbitron" style={{ color: '#00AEEF' }}>{event.id}</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-xs font-space text-white">{event.primary}</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-xs font-space" style={{ color: '#94A3B8' }}>{event.secondary}</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-xs font-orbitron font-bold" style={{ color: event.probability > 5 ? '#FF4D4D' : event.probability > 2 ? '#FFC107' : '#00FF99' }}>
                      {event.probability}%
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-xs font-space" style={{ color: '#94A3B8' }}>{event.missDistance}m</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-xs font-space" style={{ color: '#94A3B8' }}>{event.relVelocity} km/s</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-[10px] font-space font-bold tracking-wider" style={{ color: statusColors[event.status] }}>
                      {event.status}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className="text-[10px] font-space px-2 py-1 rounded-full"
                      style={{
                        background: event.maneuver === 'Recommended' ? 'rgba(255,77,77,0.15)' : 'rgba(0,174,239,0.1)',
                        color: event.maneuver === 'Recommended' ? '#FF4D4D' : '#94A3B8',
                        border: `1px solid ${event.maneuver === 'Recommended' ? 'rgba(255,77,77,0.3)' : 'rgba(0,174,239,0.15)'}`,
                      }}
                    >
                      {event.maneuver}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Threat Assessment Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-panel p-5"
        >
          <h3 className="text-sm font-space font-semibold tracking-wider mb-4" style={{ color: '#94A3B8' }}>
            RECOMMENDED ACTIONS
          </h3>
          <div className="space-y-3">
            {[
              { action: 'Execute CAM for STARLINK-3021', priority: 'CRITICAL', detail: 'Delta-v: 0.3 m/s retrograde burn within 8 minutes' },
              { action: 'Prepare PDAM for ISS', priority: 'WARNING', detail: 'Standby for potential debris avoidance maneuver' },
              { action: 'Continue monitoring ONEWEB-0345', priority: 'CAUTION', detail: 'Update TLE data and reassess in 1 hour' },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg transition-all duration-200 hover:bg-[rgba(0,174,239,0.05)]"
                style={{ border: `1px solid ${statusColors[item.priority]}30` }}
              >
                <ArrowUpRight className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: statusColors[item.priority] }} />
                <div>
                  <p className="text-xs font-space font-medium text-white">{item.action}</p>
                  <p className="text-[11px] font-inter mt-0.5" style={{ color: '#94A3B8' }}>{item.detail}</p>
                </div>
                <StatusBadge severity={item.priority === 'CRITICAL' ? 'HIGH' : item.priority === 'WARNING' ? 'MEDIUM' : 'LOW'} label={item.priority} />
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="glass-panel p-5"
        >
          <h3 className="text-sm font-space font-semibold tracking-wider mb-4" style={{ color: '#94A3B8' }}>
            RISK DISTRIBUTION
          </h3>
          <div className="space-y-4">
            {[
              { label: 'Critical (>5%)', count: 2, total: 23, color: '#FF4D4D' },
              { label: 'High (2-5%)', count: 3, total: 23, color: '#FFC107' },
              { label: 'Medium (0.5-2%)', count: 6, total: 23, color: '#00AEEF' },
              { label: 'Low (<0.5%)', count: 12, total: 23, color: '#00FF99' },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-space" style={{ color: '#94A3B8' }}>{item.label}</span>
                  <span className="text-xs font-orbitron font-bold" style={{ color: item.color }}>{item.count}</span>
                </div>
                <div className="progress-bar-track">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(item.count / item.total) * 100}%` }}
                    transition={{ duration: 1, delay: 0.8 }}
                    className="progress-bar-fill"
                    style={{ background: `linear-gradient(90deg, ${item.color}80, ${item.color})` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
