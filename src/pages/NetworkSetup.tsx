import React from 'react';
import { Link } from 'react-router-dom';
import { Wifi, ArrowLeft } from 'lucide-react';
import NetworkSetupPanel from '../components/network/NetworkSetupPanel';
import PhoneSatellitePanel from '../components/phone/PhoneSatellitePanel';
import { usePhoneSatellite } from '../hooks/usePhoneSatellite';

export default function NetworkSetup() {
  const { phoneSatellite } = usePhoneSatellite();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-wider uppercase flex items-center gap-3">
            <Wifi className="w-6 h-6 text-cyan-400" />
            Network &amp; Gateway Setup
          </h1>
          <p className="text-xs font-mono text-slate-400 mt-1">
            Hotspot-independent discovery, Raspberry Pi Zero W primary mode, and Laptop Direct Fallback gateway
          </p>
        </div>
        <Link
          to="/ground-station"
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono text-slate-200 flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Ground Station
        </Link>
      </div>

      <NetworkSetupPanel phoneTelemetry={phoneSatellite.telemetry} />
      <PhoneSatellitePanel phoneSatellite={phoneSatellite} defaultExpanded={true} />
    </div>
  );
}
