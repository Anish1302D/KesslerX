import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import RightPanel from './components/layout/RightPanel';
import AICopilotBar from './components/ai/AICopilotBar';

// Lazy load pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const OrbitalMap = lazy(() => import('./pages/OrbitalMap'));
const CollisionMonitor = lazy(() => import('./pages/CollisionMonitor'));
const Analytics = lazy(() => import('./pages/Analytics'));
const SpaceWeather = lazy(() => import('./pages/SpaceWeather'));
const AICopilot = lazy(() => import('./pages/AICopilot'));
const Simulations = lazy(() => import('./pages/Simulations'));
const AlertCenter = lazy(() => import('./pages/AlertCenter'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div
          className="w-10 h-10 rounded-full border-2 border-t-transparent mx-auto mb-3"
          style={{
            borderColor: 'rgba(0, 174, 239, 0.3)',
            borderTopColor: 'transparent',
            animation: 'orbit 1s linear infinite',
          }}
        />
        <span className="text-sm font-space" style={{ color: '#94A3B8' }}>
          Loading module...
        </span>
      </div>
    </div>
  );
}

function FloatingParticles() {
  const [particles] = useState(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      animDuration: `${12 + Math.random() * 20}s`,
      animDelay: `${Math.random() * 10}s`,
      size: `${1 + Math.random() * 1.5}px`,
      opacity: 0.15 + Math.random() * 0.2,
    }))
  );

  return (
    <div className="particles-container">
      {particles.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={{
            left: p.left,
            bottom: '-10px',
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            animationDuration: p.animDuration,
            animationDelay: p.animDelay,
          }}
        />
      ))}
    </div>
  );
}

function AppContent({ sidebarWidth }: { sidebarWidth: number }) {
  const location = useLocation();
  const showRightPanel = location.pathname === '/';

  return (
    <div
      className="h-screen flex flex-col transition-all duration-300"
      style={{ marginLeft: `${sidebarWidth}px` }}
    >
      {/* Header */}
      <Header />

      {/* Content + Right Panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main scrollable content */}
        <main className="flex-1 overflow-y-auto px-6 py-5 pb-20">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/orbital-map" element={<OrbitalMap />} />
              <Route path="/collision-monitor" element={<CollisionMonitor />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/space-weather" element={<SpaceWeather />} />
              <Route path="/ai-copilot" element={<AICopilot />} />
              <Route path="/simulations" element={<Simulations />} />
              <Route path="/alert-center" element={<AlertCenter />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </main>

        {/* Right Panel - only on Dashboard */}
        {showRightPanel && <RightPanel />}
      </div>

      {/* AI Copilot Bar — positioned in flow, not fixed */}
      <AICopilotBar />
    </div>
  );
}

export default function App() {
  const [sidebarWidth, setSidebarWidth] = useState(260);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const sidebar = document.querySelector('aside');
      if (sidebar) {
        const width = sidebar.getBoundingClientRect().width;
        setSidebarWidth(width);
      }
    });

    const sidebar = document.querySelector('aside');
    if (sidebar) {
      observer.observe(sidebar, { attributes: true, attributeFilter: ['style'] });
    }

    return () => observer.disconnect();
  }, []);

  return (
    <BrowserRouter>
      <div className="h-screen overflow-hidden" style={{ background: '#050816' }}>
        {/* Background particles — subtle */}
        <FloatingParticles />

        {/* Sidebar */}
        <Sidebar />

        {/* Main content area */}
        <AppContent sidebarWidth={sidebarWidth} />
      </div>
    </BrowserRouter>
  );
}
