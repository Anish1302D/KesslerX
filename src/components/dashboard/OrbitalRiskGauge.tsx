import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface OrbitalRiskGaugeProps {
  value: number;
  status: string;
}

export default function OrbitalRiskGauge({ value, status }: OrbitalRiskGaugeProps) {
  const [animatedValue, setAnimatedValue] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let start: number | null = null;
    const duration = 1500;

    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedValue(eased * value);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 200;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2 + 10;
    const radius = 75;
    const startAngle = Math.PI * 0.8;
    const endAngle = Math.PI * 2.2;
    const sweepAngle = endAngle - startAngle;
    const valueAngle = startAngle + (animatedValue / 100) * sweepAngle;

    ctx.clearRect(0, 0, size, size);

    // Track
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.strokeStyle = 'rgba(0, 174, 239, 0.1)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Value arc with gradient
    const gradient = ctx.createLinearGradient(0, 0, size, 0);
    gradient.addColorStop(0, '#00FF99');
    gradient.addColorStop(0.4, '#FFC107');
    gradient.addColorStop(0.7, '#FF8C00');
    gradient.addColorStop(1, '#FF4D4D');

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, valueAngle);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Glow effect
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, valueAngle);
    ctx.strokeStyle = 'rgba(255, 193, 7, 0.2)';
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Needle dot
    const dotX = cx + radius * Math.cos(valueAngle);
    const dotY = cy + radius * Math.sin(valueAngle);
    ctx.beginPath();
    ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
    ctx.fillStyle = animatedValue > 60 ? '#FF4D4D' : animatedValue > 30 ? '#FFC107' : '#00FF99';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(dotX, dotY, 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 77, 77, 0.2)';
    ctx.fill();

    // Tick marks
    for (let i = 0; i <= 10; i++) {
      const angle = startAngle + (i / 10) * sweepAngle;
      const innerR = radius - 14;
      const outerR = radius - 8;
      ctx.beginPath();
      ctx.moveTo(cx + innerR * Math.cos(angle), cy + innerR * Math.sin(angle));
      ctx.lineTo(cx + outerR * Math.cos(angle), cy + outerR * Math.sin(angle));
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [animatedValue]);

  const getStatusColor = () => {
    if (value > 60) return '#FF4D4D';
    if (value > 30) return '#FFC107';
    return '#00FF99';
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="glass-panel p-4"
    >
      <h3 className="text-[11px] font-space font-semibold tracking-wider text-center mb-1" style={{ color: '#94A3B8' }}>
        ORBITAL RISK INDEX
      </h3>

      <div className="flex flex-col items-center">
        <div className="relative">
          <canvas ref={canvasRef} />
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingTop: '20px' }}>
            <span className="text-3xl font-orbitron font-bold text-white">
              {Math.round(animatedValue)}%
            </span>
            <span
              className="text-xs font-space font-bold tracking-widest mt-1"
              style={{ color: getStatusColor() }}
            >
              {status}
            </span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-4 mt-2">
        {[
          { label: 'LOW', color: '#00FF99' },
          { label: 'MED', color: '#FFC107' },
          { label: 'HIGH', color: '#FF4D4D' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
            <span className="text-[10px] font-space" style={{ color: '#64748B' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
