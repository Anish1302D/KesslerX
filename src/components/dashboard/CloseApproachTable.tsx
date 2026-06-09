import { motion } from 'framer-motion';
import { closeApproaches } from '../../data/mockData';
import StatusBadge from '../ui/StatusBadge';
import { Clock, Target } from 'lucide-react';

export default function CloseApproachTable() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.7 }}
      className="glass-panel p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-space font-semibold tracking-wider" style={{ color: '#94A3B8' }}>
          UPCOMING CLOSE APPROACHES
        </h3>
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" style={{ color: '#64748B' }} />
          <span className="text-[10px] font-space" style={{ color: '#64748B' }}>Next 24h</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {['Objects', 'TCA', 'Miss Dist.', 'Risk', 'Severity'].map((h) => (
                <th
                  key={h}
                  className="text-[10px] font-space font-semibold tracking-wider text-left py-2 px-3"
                  style={{ color: '#64748B', borderBottom: '1px solid rgba(0,174,239,0.1)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {closeApproaches.map((ca, i) => (
              <motion.tr
                key={ca.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 + i * 0.1 }}
                className="group cursor-pointer transition-all duration-200"
                style={{ borderBottom: '1px solid rgba(0,174,239,0.05)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(0,174,239,0.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <Target className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#00AEEF' }} />
                    <div>
                      <p className="text-xs font-space font-medium text-white">{ca.object1}</p>
                      <p className="text-[10px] font-space" style={{ color: '#64748B' }}>× {ca.object2}</p>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 px-3">
                  <span className="text-xs font-orbitron" style={{ color: ca.tcaMinutes < 30 ? '#FF4D4D' : ca.tcaMinutes < 120 ? '#FFC107' : '#94A3B8' }}>
                    {ca.tca}
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <span className="text-xs font-space" style={{ color: '#94A3B8' }}>
                    {ca.missDistance.toLocaleString()}m
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <span className="text-xs font-orbitron font-bold" style={{
                    color: ca.risk > 5 ? '#FF4D4D' : ca.risk > 2 ? '#FFC107' : '#00FF99',
                  }}>
                    {ca.risk}%
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <StatusBadge severity={ca.severity} />
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
