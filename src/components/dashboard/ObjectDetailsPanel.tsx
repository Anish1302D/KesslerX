import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Gauge, Clock, Compass, Shield, Download } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge';
import * as satellite from 'satellite.js';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface ObjectDetailsPanelProps {
  satelliteData: any | null;
  onClose: () => void;
}

export default function ObjectDetailsPanel({ satelliteData, onClose }: ObjectDetailsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Parse TLE to get real stats
  let altitude = 'Unknown';
  let velocity = 'Unknown';
  let inclination = 'Unknown';
  let period = 'Unknown';

  if (satelliteData && satelliteData.TLE_LINE1 && satelliteData.TLE_LINE2) {
    try {
      const satrec = satellite.twoline2satrec(satelliteData.TLE_LINE1, satelliteData.TLE_LINE2);
      const positionAndVelocity = satellite.propagate(satrec, new Date());
      if (positionAndVelocity && positionAndVelocity.position && positionAndVelocity.velocity) {
        const positionEci = positionAndVelocity.position;
        const velocityEci = positionAndVelocity.velocity;
      
      if (positionEci && velocityEci && typeof positionEci !== 'boolean' && typeof velocityEci !== 'boolean') {
        const gmst = satellite.gstime(new Date());
        const positionGd = satellite.eciToGeodetic(positionEci as satellite.EciVec3<number>, gmst);
        altitude = Math.round(positionGd.height).toLocaleString();
        
        // Calculate velocity magnitude in km/s then to km/h
        const v = velocityEci as satellite.EciVec3<number>;
        const vMag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        velocity = Math.round(vMag * 3600).toLocaleString();

        inclination = (satrec.inclo * (180 / Math.PI)).toFixed(2);
        const meanMotionRevPerDay = satrec.no * 60 * 24 / (2 * Math.PI);
        if (meanMotionRevPerDay > 0) {
           period = Math.round(1440 / meanMotionRevPerDay).toString();
        }
      }
      }
    } catch (e) {
      // Fallback
    }
  }

  // Fallback to directly provided mock data if TLE parsing failed or was missing
  if (altitude === 'Unknown' && satelliteData?.altitude !== undefined) altitude = satelliteData.altitude.toString();
  if (velocity === 'Unknown' && satelliteData?.velocity !== undefined) velocity = satelliteData.velocity.toString();
  if (inclination === 'Unknown' && satelliteData?.inclination !== undefined) inclination = satelliteData.inclination.toString();
  if (period === 'Unknown' && satelliteData?.period !== undefined) period = satelliteData.period.toString();

  // Generate a stable fake collision risk based on ID
  const baseRisk = satelliteData ? (satelliteData.NORAD_CAT_ID % 20) : 0;
  const collisionRisk = satelliteData?.CATEGORY === 'Debris' ? 0 : baseRisk;
  const requiresManeuver = collisionRisk > 10;
  const deltaV = (collisionRisk * 0.15).toFixed(2);
  const deltaTheta = (collisionRisk * 0.08).toFixed(2);

  const handleExportPDF = async () => {
    if (!panelRef.current || !satelliteData) return;
    setIsExporting(true);
    
    // Slight delay to allow UI to remove export button before capturing
    setTimeout(async () => {
      try {
        const canvas = await html2canvas(panelRef.current as HTMLElement, {
          backgroundColor: '#060e20',
          scale: 2,
          logging: false,
          useCORS: true
        });
        
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        // Add a header
        pdf.setFillColor(6, 14, 32);
        pdf.rect(0, 0, pdfWidth, 20, 'F');
        pdf.setTextColor(0, 174, 239);
        pdf.setFontSize(16);
        pdf.text('KESSLERX ORBITAL REPORT', 10, 14);
        
        pdf.addImage(imgData, 'PNG', 10, 25, pdfWidth - 20, pdfHeight - 20);
        
        pdf.setTextColor(100, 116, 139);
        pdf.setFontSize(8);
        pdf.text(`Generated: ${new Date().toISOString()}`, 10, pdf.internal.pageSize.getHeight() - 10);
        
        pdf.save(`KesslerX_Report_${satelliteData.NORAD_CAT_ID}.pdf`);
      } catch (error) {
        console.error('Error generating PDF:', error);
      } finally {
        setIsExporting(false);
      }
    }, 100);
  };

  return (
    <AnimatePresence>
      {satelliteData && (
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 30 }}
          transition={{ duration: 0.3 }}
          className="absolute top-4 right-4 w-80 z-20"
        >
          <div ref={panelRef} className="glass-panel-strong p-5 rounded-xl border border-primary/20" style={{ background: 'rgba(6, 14, 32, 0.85)', backdropFilter: 'blur(16px)' }}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-orbitron font-bold text-white truncate pr-2">
                {satelliteData.OBJECT_NAME || `Object ${satelliteData.NORAD_CAT_ID}`}
              </h4>
              {!isExporting && (
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded flex items-center justify-center transition-colors hover:bg-primary/20 shrink-0"
                >
                  <X className="w-4 h-4" style={{ color: '#94A3B8' }} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 mb-5">
              <span
                className="text-[10px] font-space px-2.5 py-1 rounded-full uppercase tracking-wider"
                style={{ background: 'rgba(0,174,239,0.15)', color: '#00AEEF', border: '1px solid rgba(0,174,239,0.3)' }}
              >
                {satelliteData.CATEGORY || satelliteData.OBJECT_TYPE || 'UNKNOWN'}
              </span>
              <span className="text-[11px] font-space" style={{ color: '#64748B' }}>NORAD: {satelliteData.NORAD_CAT_ID}</span>
            </div>

            <div className="space-y-4 mb-6">
              {[
                { icon: MapPin, label: 'Altitude', value: `${altitude} km` },
                { icon: Gauge, label: 'Velocity', value: `${velocity} km/h` },
                { icon: Clock, label: 'Orbital Period', value: `${period} min` },
                { icon: Compass, label: 'Inclination', value: `${inclination}°` },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <item.icon className="w-4 h-4" style={{ color: '#64748B' }} />
                    <span className="text-xs font-space" style={{ color: '#94A3B8' }}>{item.label}</span>
                  </div>
                  <span className="text-sm font-orbitron text-white">{item.value}</span>
                </div>
              ))}

              <div className="h-px my-4" style={{ background: 'rgba(0,174,239,0.2)' }} />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Shield className="w-4 h-4" style={{ color: '#64748B' }} />
                  <span className="text-xs font-space" style={{ color: '#94A3B8' }}>Collision Risk</span>
                </div>
                <StatusBadge
                  severity={collisionRisk > 10 ? 'CRITICAL' : collisionRisk > 5 ? 'HIGH' : collisionRisk > 2 ? 'MEDIUM' : 'LOW'}
                  label={satelliteData.CATEGORY === 'Debris' ? 'N/A' : `${collisionRisk}%`}
                />
              </div>

              {requiresManeuver && satelliteData.CATEGORY !== 'Debris' && (
                <div className="mt-3 p-3 rounded flex flex-col gap-2" style={{ background: 'rgba(255, 77, 77, 0.1)', border: '1px solid rgba(255, 77, 77, 0.3)' }}>
                  <span className="text-[10px] font-label-mono uppercase tracking-widest" style={{ color: '#FF4D4D' }}>Recommended Maneuver</span>
                  <div className="flex justify-between items-center text-xs font-space">
                    <span style={{ color: '#94A3B8' }}>Delta-v (∆V)</span>
                    <span className="font-bold" style={{ color: '#FF4D4D' }}>+{deltaV} m/s</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-space">
                    <span style={{ color: '#94A3B8' }}>Orbit Change (∆θ)</span>
                    <span className="font-bold" style={{ color: '#FF4D4D' }}>+{deltaTheta}°</span>
                  </div>
                </div>
              )}
            </div>

            {!isExporting && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleExportPDF}
                  className="w-full py-2.5 rounded-lg text-xs font-space font-semibold tracking-wider transition-all duration-200 flex items-center justify-center gap-2"
                  style={{
                    background: 'rgba(0, 174, 239, 0.15)',
                    border: '1px solid rgba(0, 174, 239, 0.3)',
                    color: '#00AEEF',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 174, 239, 0.25)';
                    e.currentTarget.style.boxShadow = '0 0 15px rgba(0,174,239,0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 174, 239, 0.15)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <Download className="w-4 h-4" />
                  DOWNLOAD PDF REPORT
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
