import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Globe2,
  AlertTriangle,
  BarChart3,
  CloudSun,
  Bot,
  FlaskConical,
  Bell,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Satellite,
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/orbital-map', label: 'Orbital Map', icon: Globe2 },
  { path: '/collision-monitor', label: 'Collision Monitor', icon: AlertTriangle },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/space-weather', label: 'Space Weather', icon: CloudSun },
  { path: '/ai-copilot', label: 'AI Copilot', icon: Bot },
  { path: '/simulations', label: 'Simulations', icon: FlaskConical },
  { path: '/alert-center', label: 'Alert Center', icon: Bell },
  { path: '/reports', label: 'Reports', icon: FileText },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 280 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="h-screen fixed left-0 top-0 z-50 flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #0B1220 0%, #050816 100%)',
        borderRight: '1px solid rgba(0, 174, 239, 0.15)',
      }}
    >
      {/* Logo */}
      <div className="p-5 flex items-center gap-3 relative">
        <div className="relative flex-shrink-0">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #00AEEF, #00E5FF)',
              boxShadow: '0 0 20px rgba(0, 174, 239, 0.4)',
            }}
          >
            <Satellite className="w-5 h-5 text-white" />
          </div>
          {/* Orbiting dot */}
          <div className="absolute inset-[-4px] animate-orbit" style={{ animation: 'orbit 4s linear infinite' }}>
            <div
              className="w-1.5 h-1.5 rounded-full absolute top-0 left-1/2 -translate-x-1/2"
              style={{ background: '#00E5FF', boxShadow: '0 0 6px #00E5FF' }}
            />
          </div>
        </div>

        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h1 className="font-orbitron text-lg font-bold tracking-wider" style={{ color: '#00AEEF' }}>
              KESSLER<span style={{ color: '#00E5FF' }}>X</span>
            </h1>
            <p className="text-[10px] font-space tracking-widest" style={{ color: '#94A3B8' }}>
              PREDICT · PROTECT · PRESERVE
            </p>
          </motion.div>
        )}
      </div>

      {/* Divider */}
      <div className="mx-4 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,174,239,0.3), transparent)' }} />

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 overflow-y-auto space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative ${
                isActive
                  ? 'text-white'
                  : 'text-[#94A3B8] hover:text-white'
              }`
            }
            style={({ isActive }) =>
              isActive
                ? {
                    background: 'rgba(0, 174, 239, 0.1)',
                    borderLeft: '3px solid #00AEEF',
                    boxShadow: '0 0 15px rgba(0, 174, 239, 0.1)',
                  }
                : { borderLeft: '3px solid transparent' }
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className="w-5 h-5 flex-shrink-0 transition-all duration-200"
                  style={isActive ? { color: '#00AEEF', filter: 'drop-shadow(0 0 6px rgba(0,174,239,0.6))' } : {}}
                />
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm font-space font-medium"
                  >
                    {item.label}
                  </motion.span>
                )}
                {collapsed && (
                  <div className="absolute left-full ml-2 px-3 py-1.5 rounded-md text-xs font-space whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50"
                    style={{ background: '#0B1220', border: '1px solid rgba(0,174,239,0.3)', color: '#fff' }}
                  >
                    {item.label}
                  </div>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Divider */}
      <div className="mx-4 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,174,239,0.3), transparent)' }} />

      {/* Bottom Section */}
      <div className="p-4">
        {!collapsed && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="status-dot status-dot-success" />
              <span className="text-xs font-space" style={{ color: '#94A3B8' }}>All Systems Operational</span>
            </div>
            <p className="text-[10px] font-space" style={{ color: '#64748B' }}>KesslerX v2.1</p>
          </motion.div>
        )}

        {/* Collapse Button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="mt-3 w-full flex items-center justify-center py-2 rounded-lg transition-all duration-200 hover:bg-[rgba(0,174,239,0.1)]"
          style={{ color: '#94A3B8' }}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </motion.aside>
  );
}
