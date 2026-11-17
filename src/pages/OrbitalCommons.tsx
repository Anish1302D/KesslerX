import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import OrbitalCommonsCockpit from '../components/orbitalCommons/OrbitalCommonsCockpit';
import {
  type CommonsResult,
  buildDemoCommonsRequest,
  evaluateOrbitalCommonsApi,
} from '../utils/orbitalCommons';

export default function OrbitalCommons() {
  const [initialResult, setInitialResult] = useState<CommonsResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const req = buildDemoCommonsRequest('FAIR_BURDEN_SHARING', 'MULTI_OP');
        const { result } = await evaluateOrbitalCommonsApi(req, 'anish');
        if (!cancelled) {
          setInitialResult(result);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <span className="material-symbols-outlined text-cyan-400">balance</span>
            Orbital Commons AI
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Explainable, auditable, human-governed multi-operator conjunction coordination across shared LEO/MEO/GEO corridors.
          </p>
        </div>
      </div>

      {loading && !initialResult ? (
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-8 text-center text-xs font-mono text-cyan-300">
          Computing initial deterministic Orbital Commons evaluation for OC-DEMO-001...
        </div>
      ) : (
        <OrbitalCommonsCockpit initialResult={initialResult ?? undefined} />
      )}
    </motion.div>
  );
}
