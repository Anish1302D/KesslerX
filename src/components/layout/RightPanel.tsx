import { motion } from 'framer-motion';
import { alerts } from '../../data/mockData';
import AlertStack from '../alerts/AlertStack';
import OrbitalRiskGauge from '../dashboard/OrbitalRiskGauge';

import { useWebSocket } from '../../hooks/useWebSocket';
import { useMemo } from 'react';

export default function RightPanel() {
  const { messages } = useWebSocket('/ws/alerts');

  // Convert raw WS messages into alert objects format
  const liveAlerts = useMemo(() => {
    return messages.map((msg, idx) => ({
      id: `live-${idx}`,
      object_id: 'LIVE-UPDATE',
      type: 'Collision Vector', // Fallback type
      severity: msg.data.includes('WARNING') ? 'HIGH' : 'MEDIUM',
      timestamp: new Date().toISOString(),
      description: msg.data,
      probability: null
    })).reverse(); // Newest first
  }, [messages]);

  // Merge live alerts with mock alerts
  const combinedAlerts = useMemo(() => {
    return [...liveAlerts, ...alerts];
  }, [liveAlerts]);
  return (
    <motion.aside
      initial={{ x: 30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="w-[320px] h-full flex-shrink-0 overflow-y-auto py-5 px-4 space-y-5 hidden xl:block"
      style={{
        borderLeft: '1px solid rgba(0, 174, 239, 0.08)',
      }}
    >
      {/* Section Label */}
      <div className="flex items-center gap-2">
        <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(0,174,239,0.2), transparent)' }} />
        <span className="text-[9px] font-space font-semibold tracking-[0.2em]" style={{ color: '#64748B' }}>
          INSIGHTS
        </span>
        <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,174,239,0.2))' }} />
      </div>

      {/* Orbital Risk Index */}
      <OrbitalRiskGauge value={72} status="HIGH" />

      {/* Divider */}
      <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,174,239,0.15), transparent)' }} />

      {/* Live Alerts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-space font-semibold tracking-wider" style={{ color: '#94A3B8' }}>
            LIVE ALERTS
          </h3>
          <span
            className="text-[9px] font-space px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(255, 77, 77, 0.1)', color: '#FF4D4D', border: '1px solid rgba(255,77,77,0.2)' }}
          >
            {combinedAlerts.length} active
          </span>
        </div>
        <AlertStack alerts={combinedAlerts.slice(0, 5)} />
      </div>
    </motion.aside>
  );
}
