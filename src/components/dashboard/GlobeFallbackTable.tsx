import React, { useState, useMemo } from 'react';
import { Search, RotateCw, Satellite, ShieldAlert, Radio, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react';

export interface SatelliteItem {
  NORAD_CAT_ID?: string | number;
  id?: string | number;
  OBJECT_NAME?: string;
  name?: string;
  OBJECT_TYPE?: string;
  CATEGORY?: string;
  type?: string;
  altitude?: number;
  alt_km?: number;
  velocity?: number;
  speed_km_s?: number;
  inclination?: number;
  inc_deg?: number;
  period?: number | string;
  TLE_LINE1?: string;
  TLE_LINE2?: string;
  epoch?: string;
  source?: string;
  status?: string;
}

export interface GlobeFallbackTableProps {
  satellites: SatelliteItem[];
  onSelectObject?: (sat: SatelliteItem | null) => void;
  selectedObject?: SatelliteItem | null;
  reason?: string;
  onRetry3D?: () => void;
  onOpen2DTable?: () => void;
  filters?: Record<string, boolean>;
}

type SortField = 'name' | 'id' | 'category' | 'altitude' | 'epoch';
type SortDirection = 'asc' | 'desc';

function downloadCsvFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const GlobeFallbackTable: React.FC<GlobeFallbackTableProps> = ({
  satellites,
  onSelectObject,
  selectedObject,
  reason = '3D Globe unavailable or running in 2D mode',
  onRetry3D,
  filters,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [orbitLayer, setOrbitLayer] = useState<'ALL' | 'LEO' | 'MEO' | 'GEO'>('ALL');
  const [sortField, setSortField] = useState<SortField>('altitude');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Derive altitude from item or TLE
  const getAltitude = (sat: SatelliteItem): number => {
    if (typeof sat.altitude === 'number') return sat.altitude;
    if (typeof sat.alt_km === 'number') return sat.alt_km;
    // Approximate from TLE if available
    if (sat.TLE_LINE2) {
      const parts = sat.TLE_LINE2.trim().split(/\s+/);
      if (parts.length >= 8) {
        const meanMotion = parseFloat(parts[7]);
        if (meanMotion > 0) {
          const aKm = Math.cbrt(398600.4418 / Math.pow((2 * Math.PI * meanMotion) / 86400, 2));
          return Math.max(Math.round(aKm - 6371.0), 160);
        }
      }
    }
    return 550; // nominal default
  };

  // Derive TLE epoch if available
  const getEpoch = (sat: SatelliteItem): string => {
    if (sat.epoch) return sat.epoch;
    if (sat.TLE_LINE1 && sat.TLE_LINE1.length >= 32) {
      const yearPart = sat.TLE_LINE1.substring(18, 20).trim();
      const dayPart = sat.TLE_LINE1.substring(20, 32).trim();
      if (yearPart && dayPart) {
        const fullYear = parseInt(yearPart, 10) < 57 ? 2000 + parseInt(yearPart, 10) : 1900 + parseInt(yearPart, 10);
        return `${fullYear} Day ${parseFloat(dayPart).toFixed(2)}`;
      }
    }
    return 'Observed / Propagated';
  };

  const getCategory = (sat: SatelliteItem): string => {
    return sat.CATEGORY || sat.type || sat.OBJECT_TYPE || 'Unknown';
  };

  const getSource = (sat: SatelliteItem): string => {
    return sat.source || 'Space-Track / SGP4';
  };

  const getStatus = (sat: SatelliteItem): string => {
    if (sat.status) return sat.status;
    const cat = getCategory(sat).toUpperCase();
    if (cat === 'DEBRIS') return 'Tracked Debris';
    if (cat === 'ISS') return 'Manned Station';
    return 'Active Operational';
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleExportCsv = () => {
    const headers = ['NORAD_ID', 'Name', 'Category', 'Altitude_km', 'Epoch', 'Source', 'Status'];
    const rows = filteredSatellites.map(sat => [
      String(sat.NORAD_CAT_ID || sat.id || ''),
      `"${(sat.OBJECT_NAME || sat.name || '').replace(/"/g, '""')}"`,
      getCategory(sat),
      getAltitude(sat),
      `"${getEpoch(sat)}"`,
      `"${getSource(sat)}"`,
      `"${getStatus(sat)}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCsvFile(csvContent, 'kesslerx-tracking-table.csv');
  };

  const filteredSatellites = useMemo(() => {
    const list = satellites.filter((sat) => {
      const name = (sat.OBJECT_NAME || sat.name || '').toLowerCase();
      const id = String(sat.NORAD_CAT_ID || sat.id || '').toLowerCase();
      const cat = getCategory(sat);
      const alt = getAltitude(sat);

      if (filters && filters[cat] === false) {
        return false;
      }

      if (selectedCategory !== 'ALL' && cat.toUpperCase() !== selectedCategory.toUpperCase()) {
        return false;
      }

      if (orbitLayer === 'LEO' && alt >= 2000) return false;
      if (orbitLayer === 'MEO' && (alt < 2000 || alt >= 35786)) return false;
      if (orbitLayer === 'GEO' && alt < 35786) return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return name.includes(term) || id.includes(term);
      }

      return true;
    });

    list.sort((a, b) => {
      let comp = 0;
      if (sortField === 'name') {
        const nameA = (a.OBJECT_NAME || a.name || '').toLowerCase();
        const nameB = (b.OBJECT_NAME || b.name || '').toLowerCase();
        comp = nameA.localeCompare(nameB);
      } else if (sortField === 'id') {
        const idA = Number(a.NORAD_CAT_ID || a.id || 0);
        const idB = Number(b.NORAD_CAT_ID || b.id || 0);
        comp = idA - idB;
      } else if (sortField === 'category') {
        comp = getCategory(a).localeCompare(getCategory(b));
      } else if (sortField === 'altitude') {
        comp = getAltitude(a) - getAltitude(b);
      } else if (sortField === 'epoch') {
        comp = getEpoch(a).localeCompare(getEpoch(b));
      }
      return sortDirection === 'asc' ? comp : -comp;
    });

    return list;
  }, [satellites, searchTerm, selectedCategory, orbitLayer, sortField, sortDirection, filters]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    satellites.forEach((s) => set.add(getCategory(s)));
    return Array.from(set);
  }, [satellites]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-500 opacity-60 ml-1 inline" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-cyan-400 ml-1 inline" />
    ) : (
      <ArrowDown className="w-3 h-3 text-cyan-400 ml-1 inline" />
    );
  };

  return (
    <div
      role="region"
      aria-label="2D Satellite Tracking Table"
      className="relative w-full h-[540px] flex flex-col bg-[#050816] rounded-xl overflow-hidden border border-cyan-500/20 text-slate-200"
      data-testid="globe-fallback-view"
    >
      {/* Banner Notice */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>2D Planetary Fallback Mode:</strong> {reason}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            title="Export CSV"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          {onRetry3D && (
            <button
              onClick={onRetry3D}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs transition-colors cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Retry 3D Globe</span>
            </button>
          )}
        </div>
      </div>

      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/60 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by object name or NORAD ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-700/60 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        {/* Orbit Layer Filter */}
        <div className="flex items-center gap-1 bg-slate-950/60 p-0.5 rounded border border-slate-800 font-mono text-[11px]">
          {(['ALL', 'LEO', 'MEO', 'GEO'] as const).map(layer => (
            <button
              key={layer}
              onClick={() => setOrbitLayer(layer)}
              className={`px-2 py-0.5 rounded transition-colors ${orbitLayer === layer ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {layer}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 font-mono">Category:</span>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-950/80 border border-slate-700/60 rounded px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-cyan-400"
          >
            <option value="ALL">All Categories ({satellites.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
          <span>Showing: <strong className="text-cyan-400">{filteredSatellites.length}</strong> / {satellites.length} objects</span>
        </div>
      </div>

      {/* Tabular Satellite Directory */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-slate-950/90 backdrop-blur z-10 text-[11px] font-mono uppercase tracking-wider text-slate-400 border-b border-slate-800">
            <tr>
              <th
                scope="col"
                onClick={() => handleSort('name')}
                aria-sort={sortField === 'name' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-2.5 px-4 font-semibold cursor-pointer select-none hover:text-slate-200"
              >
                Object / NORAD {renderSortIcon('name')}
              </th>
              <th
                scope="col"
                onClick={() => handleSort('category')}
                aria-sort={sortField === 'category' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-2.5 px-3 font-semibold cursor-pointer select-none hover:text-slate-200"
              >
                Category {renderSortIcon('category')}
              </th>
              <th
                scope="col"
                onClick={() => handleSort('altitude')}
                aria-sort={sortField === 'altitude' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-2.5 px-3 font-semibold cursor-pointer select-none hover:text-slate-200"
              >
                Altitude {renderSortIcon('altitude')}
              </th>
              <th
                scope="col"
                onClick={() => handleSort('epoch')}
                aria-sort={sortField === 'epoch' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="py-2.5 px-3 font-semibold cursor-pointer select-none hover:text-slate-200"
              >
                TLE Epoch / Timestamp {renderSortIcon('epoch')}
              </th>
              <th scope="col" className="py-2.5 px-3 font-semibold">Provenance Source</th>
              <th scope="col" className="py-2.5 px-3 font-semibold">Status</th>
              <th scope="col" className="py-2.5 px-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {filteredSatellites.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Radio className="w-8 h-8 text-slate-600 animate-pulse" />
                    <p>No orbital objects found matching current filters.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredSatellites.map((sat) => {
                const id = String(sat.NORAD_CAT_ID || sat.id || 'N/A');
                const name = sat.OBJECT_NAME || sat.name || `Object #${id}`;
                const cat = getCategory(sat);
                const alt = getAltitude(sat);
                const isSelected = selectedObject && String(selectedObject.NORAD_CAT_ID || selectedObject.id) === id;
                const isDebris = cat.toUpperCase() === 'DEBRIS';

                return (
                  <tr
                    key={id}
                    tabIndex={0}
                    role="row"
                    onClick={() => onSelectObject?.(sat)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectObject?.(sat);
                      }
                    }}
                    className={`transition-colors cursor-pointer outline-none focus:bg-cyan-500/10 ${
                      isSelected
                        ? 'bg-cyan-500/15 border-l-2 border-cyan-400'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-2">
                        {isDebris ? (
                          <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        ) : (
                          <Satellite className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        )}
                        <div>
                          <div className="font-medium text-slate-100">{name}</div>
                          <div className="text-[10px] font-mono text-slate-400">NORAD: {id}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-2 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                          isDebris
                            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                            : cat === 'ISS'
                            ? 'bg-white/20 text-white border border-white/30'
                            : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        }`}
                      >
                        {cat}
                      </span>
                    </td>

                    <td className="py-2 px-3 font-mono text-slate-300">
                      {alt.toLocaleString()} km
                    </td>

                    <td className="py-2 px-3 font-mono text-slate-400 text-[11px]">
                      {getEpoch(sat)}
                    </td>

                    <td className="py-2 px-3 text-slate-300 text-[11px]">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                        {getSource(sat)}
                      </span>
                    </td>

                    <td className="py-2 px-3">
                      <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {getStatus(sat)}
                      </span>
                    </td>

                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectObject?.(sat);
                        }}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                          isSelected
                            ? 'bg-cyan-500 text-slate-950 font-bold'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Inspect'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Attribution footer */}
      <div className="px-4 py-2 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
        <span>KesslerX Space Situational Awareness Engine • SGP4 Tabular Model</span>
        <span>Ephemeris: Space-Track.org / Celestrak</span>
      </div>
    </div>
  );
};

export default GlobeFallbackTable;
