import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchItem {
  id: string;
  title: string;
  subtitle: string;
  type: 'Page' | 'Satellite' | 'Alert' | 'Simulation';
  icon: string;
  path?: string;
  action?: () => void;
}

const SEARCH_DATA: SearchItem[] = [
  // Pages
  { id: 'p1', title: 'Dashboard', subtitle: 'Mission Overview', type: 'Page', icon: 'dashboard', path: '/' },
  { id: 'p2', title: 'Orbital Map', subtitle: '3D Globe Visualization', type: 'Page', icon: 'public', path: '/orbital-map' },
  { id: 'p3', title: 'Collision Monitor', subtitle: 'Live Conjunctions', type: 'Page', icon: 'warning', path: '/collision-monitor' },
  { id: 'p4', title: 'Analytics', subtitle: 'Debris Density Trends', type: 'Page', icon: 'analytics', path: '/analytics' },
  { id: 'p5', title: 'Space Weather', subtitle: 'Solar Activity', type: 'Page', icon: 'routine', path: '/space-weather' },
  { id: 'p6', title: 'AI Copilot', subtitle: 'Kessler Assistant', type: 'Page', icon: 'smart_toy', path: '/ai-copilot' },
  { id: 'p7', title: 'Simulations', subtitle: 'Kessler Cascade Physics', type: 'Page', icon: 'science', path: '/simulations' },
  { id: 'p8', title: 'Alert Center', subtitle: 'Active Warnings', type: 'Page', icon: 'notifications_active', path: '/alert-center' },
  
  // Satellites
  { id: 's1', title: 'ISS (ZARYA)', subtitle: 'NORAD 25544 • LEO', type: 'Satellite', icon: 'satellite_alt', path: '/orbital-map' },
  { id: 's2', title: 'STARLINK-3021', subtitle: 'NORAD 49112 • LEO', type: 'Satellite', icon: 'satellite_alt', path: '/orbital-map' },
  { id: 's3', title: 'GOES-16', subtitle: 'NORAD 41866 • GEO', type: 'Satellite', icon: 'satellite_alt', path: '/orbital-map' },
  { id: 's4', title: 'HUBBLE', subtitle: 'NORAD 20580 • LEO', type: 'Satellite', icon: 'satellite_alt', path: '/orbital-map' },
  
  // Alerts
  { id: 'a1', title: 'High Risk: STARLINK-3021 vs DEBRIS-88172', subtitle: 'TCA: 12 min • Miss: 0.12km', type: 'Alert', icon: 'error', path: '/alert-center' },
  { id: 'a2', title: 'Anomaly: SENTINEL-6A', subtitle: 'Orbital Path Deviation', type: 'Alert', icon: 'info', path: '/alert-center' },
  
  // Simulations
  { id: 'sim1', title: 'Kessler Cascade Scenario', subtitle: 'Run high-density collision simulation', type: 'Simulation', icon: 'hub', path: '/simulations' },
];

export default function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Filter logic
  const filteredData = SEARCH_DATA.filter((item) => {
    const searchStr = `${item.title} ${item.subtitle} ${item.type}`.toLowerCase();
    return searchStr.includes(query.toLowerCase());
  });

  // Grouping
  const groups = filteredData.reduce((acc, item) => {
    if (!acc[item.type]) acc[item.type] = [];
    acc[item.type].push(item);
    return acc;
  }, {} as Record<string, SearchItem[]>);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Focus input after modal mount animation
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(filteredData.length, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredData.length) % Math.max(filteredData.length, 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredData.length > 0) {
          handleSelect(filteredData[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredData, selectedIndex, onClose]);

  const handleSelect = (item: SearchItem) => {
    if (item.action) {
      item.action();
    } else if (item.path) {
      navigate(item.path);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div 
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl bg-surface-container/90 backdrop-blur-2xl border border-outline-variant/30 rounded-xl shadow-2xl overflow-hidden flex flex-col mx-4"
        >
          {/* Search Input */}
          <div className="flex items-center px-4 py-3 border-b border-outline-variant/20">
            <span className="material-symbols-outlined text-primary text-xl mr-3">search</span>
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-on-surface font-label-mono text-lg outline-none placeholder:text-on-surface-variant/40"
              placeholder="Search satellites, debris, events, missions..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
            />
            <div className="flex items-center gap-1 border border-outline-variant/40 rounded px-1.5 py-0.5 ml-3">
              <span className="text-[10px] font-bold text-on-surface-variant/50">ESC</span>
            </div>
          </div>

          {/* Results Area */}
          <div className="max-h-[60vh] overflow-y-auto p-2 scroll-hide">
            {filteredData.length === 0 ? (
              <div className="py-12 text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-4xl mb-2 opacity-50">satellite_alt</span>
                <p className="font-label-mono text-sm opacity-80">No results found for "{query}"</p>
              </div>
            ) : (
              Object.entries(groups).map(([type, items]) => (
                <div key={type} className="mb-4 last:mb-0">
                  <div className="px-3 py-1 text-[10px] font-label-mono uppercase tracking-widest text-on-surface-variant/60">
                    {type}s
                  </div>
                  <div className="space-y-1">
                    {items.map((item) => {
                      const globalIndex = filteredData.findIndex(i => i.id === item.id);
                      const isSelected = selectedIndex === globalIndex;
                      
                      return (
                        <div
                          key={item.id}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                          onClick={() => handleSelect(item)}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                            isSelected 
                              ? 'bg-primary/10 border-l-2 border-primary' 
                              : 'hover:bg-surface-container-highest/50 border-l-2 border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`material-symbols-outlined text-[18px] ${isSelected ? 'text-primary' : 'text-on-surface-variant'}`}>
                              {item.icon}
                            </span>
                            <div className="flex flex-col">
                              <span className={`text-sm font-medium ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                                {item.title}
                              </span>
                              <span className="text-[10px] font-label-mono text-on-surface-variant/70 mt-0.5">
                                {item.subtitle}
                              </span>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-on-surface-variant/30 text-sm">
                            {item.path ? 'chevron_right' : 'bolt'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
          
          {/* Footer Footer */}
          <div className="px-4 py-2 border-t border-outline-variant/10 bg-surface-container-low flex items-center justify-between text-[10px] font-label-mono text-on-surface-variant/50">
            <div className="flex gap-4">
              <span className="flex items-center gap-1"><span className="border border-outline-variant/30 rounded px-1">↑↓</span> to navigate</span>
              <span className="flex items-center gap-1"><span className="border border-outline-variant/30 rounded px-1">↵</span> to select</span>
            </div>
            <span>KesslerX Search Engine v1.0</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
