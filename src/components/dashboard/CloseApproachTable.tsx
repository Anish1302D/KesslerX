import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import StatusBadge from '../ui/StatusBadge';
import { Clock, Target } from 'lucide-react';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

interface CloseApproach {
  id: string;
  object1: string;
  object2: string;
  tca: string;
  tcaMinutes: number;
  risk: number;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  missDistance: number;
}

// Fallback close approaches
const fallbackApproaches: CloseApproach[] = [
  { id: 'CA-001', object1: 'STARLINK-3021', object2: 'DEBRIS-88172', tca: '12 min', tcaMinutes: 12, risk: 9.8, severity: 'HIGH', missDistance: 142 },
  { id: 'CA-002', object1: 'ISS (ZARYA)', object2: 'COSMOS-DEB-4421', tca: '47 min', tcaMinutes: 47, risk: 6.7, severity: 'HIGH', missDistance: 380 },
  { id: 'CA-003', object1: 'ONEWEB-0345', object2: 'DEBRIS-72401', tca: '2h 14min', tcaMinutes: 134, risk: 4.2, severity: 'MEDIUM', missDistance: 890 },
];

function mapSeverity(risk: string): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (risk === 'CRITICAL' || risk === 'HIGH') return 'HIGH';
  if (risk === 'MEDIUM') return 'MEDIUM';
  return 'LOW';
}

function formatTCA(tcaStr: string): { display: string; minutes: number } {
  try {
    const tcaDate = new Date(tcaStr);
    const now = new Date();
    const diffMs = tcaDate.getTime() - now.getTime();
    const diffMin = Math.max(0, Math.round(diffMs / 60000));
    if (diffMin < 60) return { display: `${diffMin} min`, minutes: diffMin };
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return { display: `${hours}h ${mins}min`, minutes: diffMin };
  } catch {
    return { display: 'N/A', minutes: 999 };
  }
}

export default function CloseApproachTable() {
  const [approaches, setApproaches] = useState<CloseApproach[]>(fallbackApproaches);

  useEffect(() => {
    const fetchCollisions = async () => {
      try {
        const res = await fetch(`${API}/api/collisions`);
        if (!res.ok) return;
        const data = await res.json();
        // Map backend collision events to CloseApproach format
        const mapped: CloseApproach[] = (Array.isArray(data) ? data : data.data || []).map((ev: any) => {
          const { display, minutes } = formatTCA(ev.tca);
          return {
            id: ev.id,
            object1: ev.satellite,
            object2: ev.object,
            tca: display,
            tcaMinutes: minutes,
            risk: ev.collision_probability * 100,
            severity: mapSeverity(ev.risk),
            missDistance: Math.round(ev.miss_distance * 1000), // km to meters
          };
        });
        if (mapped.length > 0) setApproaches(mapped);
      } catch {
        // Keep fallback data
      }
    };
    fetchCollisions();
    const interval = setInterval(fetchCollisions, 60000);
    return () => clearInterval(interval);
  }, []);

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
            {approaches.map((ca, i) => (
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
                    {ca.risk.toFixed(1)}%
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
