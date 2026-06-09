// ============================================================
// KesslerX Mock Data
// Realistic simulated data for all dashboard components
// ============================================================

export interface Satellite {
  id: string;
  name: string;
  type: 'Communication' | 'Weather' | 'Military' | 'GPS' | 'Scientific' | 'ISS' | 'Debris';
  country: string;
  altitude: number;    // km
  velocity: number;    // km/h
  period: number;      // minutes
  inclination: number; // degrees
  collisionRisk: number; // percentage
  lat: number;
  lon: number;
  orbitType: 'LEO' | 'MEO' | 'GEO' | 'HEO';
  status: 'Active' | 'Inactive' | 'Decommissioned';
  launchDate: string;
  operator: string;
}

export interface Alert {
  id: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  timestamp: string;
  type: string;
  object1?: string;
  object2?: string;
  risk?: number;
}

export interface CloseApproach {
  id: string;
  object1: string;
  object2: string;
  tca: string;        // time to closest approach
  tcaMinutes: number;
  risk: number;        // percentage
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  missDistance: number; // meters
}

export interface SpaceWeatherData {
  solarActivity: string;
  kpIndex: number;
  solarWind: number;     // km/s
  bz: number;            // nT
  protonFlux: number;
  electronFlux: number;
  xrayFlux: string;
  solarFlareClass: string;
}

export interface AnalyticsPoint {
  year: number;
  satellites: number;
  debris: number;
  collisions: number;
}

export interface CountryData {
  country: string;
  satellites: number;
  color: string;
}

// ============================================================
// Satellite Catalog
// ============================================================

export const satellites: Satellite[] = [
  { id: 'SAT-001', name: 'STARLINK-3021', type: 'Communication', country: 'USA', altitude: 542, velocity: 27540, period: 95.4, inclination: 53.2, collisionRisk: 2.4, lat: 32.5, lon: -78.3, orbitType: 'LEO', status: 'Active', launchDate: '2024-03-15', operator: 'SpaceX' },
  { id: 'SAT-002', name: 'STARLINK-4501', type: 'Communication', country: 'USA', altitude: 550, velocity: 27520, period: 95.6, inclination: 53.0, collisionRisk: 1.8, lat: -15.2, lon: 45.7, orbitType: 'LEO', status: 'Active', launchDate: '2024-06-22', operator: 'SpaceX' },
  { id: 'SAT-003', name: 'ISS (ZARYA)', type: 'ISS', country: 'International', altitude: 420, velocity: 27600, period: 92.7, inclination: 51.6, collisionRisk: 0.8, lat: 12.8, lon: 120.5, orbitType: 'LEO', status: 'Active', launchDate: '1998-11-20', operator: 'NASA/Roscosmos' },
  { id: 'SAT-004', name: 'GPS IIF-12', type: 'GPS', country: 'USA', altitude: 20200, velocity: 13900, period: 717.9, inclination: 55.0, collisionRisk: 0.1, lat: 38.5, lon: -95.2, orbitType: 'MEO', status: 'Active', launchDate: '2016-02-05', operator: 'USSF' },
  { id: 'SAT-005', name: 'COSMOS 2551', type: 'Military', country: 'Russia', altitude: 487, velocity: 27610, period: 94.2, inclination: 97.6, collisionRisk: 5.1, lat: 55.7, lon: 37.6, orbitType: 'LEO', status: 'Inactive', launchDate: '2021-09-09', operator: 'Russian MoD' },
  { id: 'SAT-006', name: 'GOES-18', type: 'Weather', country: 'USA', altitude: 35786, velocity: 11068, period: 1436.0, inclination: 0.04, collisionRisk: 0.02, lat: 0.0, lon: -137.2, orbitType: 'GEO', status: 'Active', launchDate: '2022-03-01', operator: 'NOAA' },
  { id: 'SAT-007', name: 'FENGYUN-3E', type: 'Weather', country: 'China', altitude: 836, velocity: 26900, period: 101.5, inclination: 98.7, collisionRisk: 1.2, lat: 28.2, lon: 102.3, orbitType: 'LEO', status: 'Active', launchDate: '2021-07-05', operator: 'CMA' },
  { id: 'SAT-008', name: 'ONEWEB-0345', type: 'Communication', country: 'UK', altitude: 1200, velocity: 26400, period: 109.4, inclination: 87.9, collisionRisk: 0.9, lat: -42.1, lon: -12.8, orbitType: 'LEO', status: 'Active', launchDate: '2023-01-09', operator: 'OneWeb' },
  { id: 'SAT-009', name: 'SENTINEL-6B', type: 'Scientific', country: 'EU', altitude: 1336, velocity: 25800, period: 112.4, inclination: 66.0, collisionRisk: 0.3, lat: 22.4, lon: -45.6, orbitType: 'LEO', status: 'Active', launchDate: '2025-11-21', operator: 'ESA/EUMETSAT' },
  { id: 'SAT-010', name: 'BEIDOU-3 M23', type: 'GPS', country: 'China', altitude: 21528, velocity: 13800, period: 773.2, inclination: 55.0, collisionRisk: 0.05, lat: 35.0, lon: 115.2, orbitType: 'MEO', status: 'Active', launchDate: '2020-06-23', operator: 'CNSA' },
  { id: 'DEB-001', name: 'DEBRIS-88172', type: 'Debris', country: 'Unknown', altitude: 540, velocity: 27550, period: 95.3, inclination: 52.8, collisionRisk: 9.8, lat: 30.1, lon: -75.2, orbitType: 'LEO', status: 'Inactive', launchDate: 'N/A', operator: 'N/A' },
  { id: 'DEB-002', name: 'DEBRIS-72401', type: 'Debris', country: 'Unknown', altitude: 800, velocity: 26950, period: 100.8, inclination: 98.2, collisionRisk: 4.2, lat: -18.3, lon: 67.9, orbitType: 'LEO', status: 'Inactive', launchDate: 'N/A', operator: 'N/A' },
  { id: 'DEB-003', name: 'COSMOS-DEB-4421', type: 'Debris', country: 'Russia', altitude: 780, velocity: 27000, period: 100.4, inclination: 74.0, collisionRisk: 6.7, lat: 62.1, lon: 142.3, orbitType: 'LEO', status: 'Inactive', launchDate: 'N/A', operator: 'N/A' },
  { id: 'SAT-011', name: 'TIANGONG', type: 'ISS', country: 'China', altitude: 390, velocity: 27650, period: 91.5, inclination: 41.5, collisionRisk: 1.1, lat: 20.5, lon: 110.8, orbitType: 'LEO', status: 'Active', launchDate: '2021-04-29', operator: 'CMSA' },
  { id: 'SAT-012', name: 'INTELSAT 40E', type: 'Communication', country: 'USA', altitude: 35786, velocity: 11068, period: 1436.0, inclination: 0.01, collisionRisk: 0.01, lat: 0.0, lon: -58.0, orbitType: 'GEO', status: 'Active', launchDate: '2025-08-14', operator: 'Intelsat' },
  { id: 'SAT-013', name: 'GALILEO-FOC-26', type: 'GPS', country: 'EU', altitude: 23222, velocity: 13600, period: 844.7, inclination: 56.0, collisionRisk: 0.08, lat: 45.0, lon: 10.5, orbitType: 'MEO', status: 'Active', launchDate: '2024-12-01', operator: 'ESA' },
  { id: 'SAT-014', name: 'KUIPER-0122', type: 'Communication', country: 'USA', altitude: 630, velocity: 27400, period: 97.2, inclination: 51.9, collisionRisk: 1.5, lat: -8.3, lon: -155.7, orbitType: 'LEO', status: 'Active', launchDate: '2025-10-30', operator: 'Amazon' },
];

// ============================================================
// Dashboard Metrics
// ============================================================

export const dashboardMetrics = {
  activeSatellites: { value: 12457, trend: 3.2, trendDir: 'up' as const },
  trackedDebris: { value: 39812, trend: 1.8, trendDir: 'up' as const },
  highRiskObjects: { value: 37, trend: -5.1, trendDir: 'down' as const },
  predictedCollisions: { value: 4, trend: 0, trendDir: 'neutral' as const },
  spaceWeatherIndex: { value: 'Moderate', severity: 'MEDIUM' as const },
  orbitalCongestion: { value: 'High', severity: 'HIGH' as const },
};

// ============================================================
// Alerts
// ============================================================

export const alerts: Alert[] = [
  { id: 'ALT-001', severity: 'HIGH', title: 'Potential Collision Detected', description: 'STARLINK-3021 and DEBRIS-88172 on converging trajectories. TCA in 12 minutes.', timestamp: '2026-06-09T15:28:00Z', type: 'COLLISION', object1: 'STARLINK-3021', object2: 'DEBRIS-88172', risk: 9.8 },
  { id: 'ALT-002', severity: 'MEDIUM', title: 'Solar Storm Warning', description: 'G2-class geomagnetic storm expected in 6 hours. Potential impact on LEO satellites.', timestamp: '2026-06-09T14:45:00Z', type: 'SPACE_WEATHER' },
  { id: 'ALT-003', severity: 'LOW', title: 'Debris Cluster Detected', description: 'New debris cluster identified at 780km altitude, 98.2° inclination band.', timestamp: '2026-06-09T13:12:00Z', type: 'DEBRIS' },
  { id: 'ALT-004', severity: 'HIGH', title: 'Critical Conjunction Alert', description: 'COSMOS 2551 fragments approaching ISS corridor. Monitoring required.', timestamp: '2026-06-09T12:30:00Z', type: 'COLLISION', object1: 'ISS (ZARYA)', object2: 'COSMOS-DEB-4421', risk: 6.7 },
  { id: 'ALT-005', severity: 'MEDIUM', title: 'Orbital Decay Warning', description: 'COSMOS 2551 altitude decreasing. Expected reentry within 30 days.', timestamp: '2026-06-09T11:00:00Z', type: 'DECAY' },
  { id: 'ALT-006', severity: 'LOW', title: 'New Object Catalogued', description: 'Object #54821 catalogued in LEO at 420km. Origin: Falcon 9 upper stage.', timestamp: '2026-06-09T10:15:00Z', type: 'NEW_OBJECT' },
];

// ============================================================
// Close Approaches
// ============================================================

export const closeApproaches: CloseApproach[] = [
  { id: 'CA-001', object1: 'STARLINK-3021', object2: 'DEBRIS-88172', tca: '12 min', tcaMinutes: 12, risk: 9.8, severity: 'HIGH', missDistance: 142 },
  { id: 'CA-002', object1: 'ISS (ZARYA)', object2: 'COSMOS-DEB-4421', tca: '47 min', tcaMinutes: 47, risk: 6.7, severity: 'HIGH', missDistance: 380 },
  { id: 'CA-003', object1: 'ONEWEB-0345', object2: 'DEBRIS-72401', tca: '2h 14min', tcaMinutes: 134, risk: 4.2, severity: 'MEDIUM', missDistance: 890 },
  { id: 'CA-004', object1: 'FENGYUN-3E', object2: 'SL-16 R/B', tca: '3h 45min', tcaMinutes: 225, risk: 2.1, severity: 'MEDIUM', missDistance: 1540 },
  { id: 'CA-005', object1: 'KUIPER-0122', object2: 'DEBRIS-55102', tca: '6h 20min', tcaMinutes: 380, risk: 0.8, severity: 'LOW', missDistance: 3200 },
  { id: 'CA-006', object1: 'STARLINK-4501', object2: 'CZ-2C DEB', tca: '8h 05min', tcaMinutes: 485, risk: 0.3, severity: 'LOW', missDistance: 5800 },
];

// ============================================================
// Orbital Congestion
// ============================================================

export const orbitalCongestion = {
  LEO: 78,
  MEO: 32,
  GEO: 18,
  HEO: 9,
};

// ============================================================
// Space Weather
// ============================================================

export const spaceWeather: SpaceWeatherData = {
  solarActivity: 'Moderate',
  kpIndex: 5,
  solarWind: 450,
  bz: -3.2,
  protonFlux: 2.4,
  electronFlux: 1.8,
  xrayFlux: 'C2.1',
  solarFlareClass: 'C',
};

// ============================================================
// Analytics Data
// ============================================================

export const analyticsData: AnalyticsPoint[] = [
  { year: 2015, satellites: 1381, debris: 17852, collisions: 0 },
  { year: 2016, satellites: 1459, debris: 18296, collisions: 0 },
  { year: 2017, satellites: 1738, debris: 19221, collisions: 1 },
  { year: 2018, satellites: 2063, debris: 20312, collisions: 0 },
  { year: 2019, satellites: 2787, debris: 22341, collisions: 1 },
  { year: 2020, satellites: 3371, debris: 24891, collisions: 0 },
  { year: 2021, satellites: 4852, debris: 28420, collisions: 2 },
  { year: 2022, satellites: 6718, debris: 30891, collisions: 1 },
  { year: 2023, satellites: 8734, debris: 33410, collisions: 2 },
  { year: 2024, satellites: 10521, debris: 36218, collisions: 3 },
  { year: 2025, satellites: 11893, debris: 38104, collisions: 2 },
  { year: 2026, satellites: 12457, debris: 39812, collisions: 4 },
];

export const countryData: CountryData[] = [
  { country: 'USA', satellites: 5218, color: '#00AEEF' },
  { country: 'China', satellites: 2845, color: '#FF4D4D' },
  { country: 'UK', satellites: 1234, color: '#00E5FF' },
  { country: 'Russia', satellites: 892, color: '#FFC107' },
  { country: 'Japan', satellites: 456, color: '#00FF99' },
  { country: 'India', satellites: 389, color: '#FF8C00' },
  { country: 'EU', satellites: 678, color: '#9B59B6' },
  { country: 'Others', satellites: 745, color: '#94A3B8' },
];

// ============================================================
// Collision Monitor Data
// ============================================================

export const collisionEvents = [
  { id: 'COL-001', primary: 'STARLINK-3021', secondary: 'DEBRIS-88172', probability: 9.8, tca: '2026-06-09T15:40:00Z', missDistance: 142, relVelocity: 14.2, combinedSize: 4.8, status: 'CRITICAL', maneuver: 'Recommended' },
  { id: 'COL-002', primary: 'ISS (ZARYA)', secondary: 'COSMOS-DEB-4421', probability: 6.7, tca: '2026-06-09T16:15:00Z', missDistance: 380, relVelocity: 11.8, combinedSize: 120.5, status: 'WARNING', maneuver: 'Monitoring' },
  { id: 'COL-003', primary: 'ONEWEB-0345', secondary: 'DEBRIS-72401', probability: 4.2, tca: '2026-06-09T17:42:00Z', missDistance: 890, relVelocity: 9.4, combinedSize: 3.2, status: 'CAUTION', maneuver: 'Optional' },
  { id: 'COL-004', primary: 'FENGYUN-3E', secondary: 'SL-16 R/B', probability: 2.1, tca: '2026-06-09T19:13:00Z', missDistance: 1540, relVelocity: 7.6, combinedSize: 8.1, status: 'WATCH', maneuver: 'Not Required' },
  { id: 'COL-005', primary: 'KUIPER-0122', secondary: 'DEBRIS-55102', probability: 0.8, tca: '2026-06-09T21:48:00Z', missDistance: 3200, relVelocity: 12.1, combinedSize: 2.4, status: 'NOMINAL', maneuver: 'Not Required' },
];

// ============================================================
// Space Weather Timeline
// ============================================================

export const solarActivityTimeline = [
  { time: '00:00', kp: 2, solarWind: 380, bz: 1.2 },
  { time: '02:00', kp: 2, solarWind: 390, bz: 0.8 },
  { time: '04:00', kp: 3, solarWind: 410, bz: -0.5 },
  { time: '06:00', kp: 3, solarWind: 420, bz: -1.2 },
  { time: '08:00', kp: 4, solarWind: 435, bz: -2.1 },
  { time: '10:00', kp: 5, solarWind: 448, bz: -2.8 },
  { time: '12:00', kp: 5, solarWind: 452, bz: -3.2 },
  { time: '14:00', kp: 6, solarWind: 460, bz: -4.1 },
  { time: '16:00', kp: 5, solarWind: 450, bz: -3.2 },
  { time: '18:00', kp: 4, solarWind: 440, bz: -2.5 },
  { time: '20:00', kp: 3, solarWind: 420, bz: -1.0 },
  { time: '22:00', kp: 3, solarWind: 400, bz: 0.2 },
];

// ============================================================
// Simulation Presets
// ============================================================

export const simulationPresets = [
  { name: 'Minor Collision', magnitude: 2, debrisRate: 50, description: 'Small satellite breakup generating ~50 fragments' },
  { name: 'Major Collision', magnitude: 5, debrisRate: 500, description: 'Large satellite collision generating ~500 fragments' },
  { name: 'Catastrophic Event', magnitude: 8, debrisRate: 3000, description: 'Catastrophic breakup generating ~3000 fragments' },
  { name: 'Kessler Cascade', magnitude: 10, debrisRate: 10000, description: 'Full Kessler Syndrome cascade scenario' },
];

// ============================================================
// Reports
// ============================================================

export const reports = [
  { id: 'RPT-001', title: 'Daily Orbital Situation Report', type: 'daily', date: '2026-06-09', status: 'Ready', pages: 12, riskLevel: 'ELEVATED' },
  { id: 'RPT-002', title: 'Weekly Risk Assessment', type: 'weekly', date: '2026-06-08', status: 'Ready', pages: 28, riskLevel: 'HIGH' },
  { id: 'RPT-003', title: 'Debris Field Analysis Q2 2026', type: 'quarterly', date: '2026-06-01', status: 'Ready', pages: 45, riskLevel: 'MODERATE' },
  { id: 'RPT-004', title: 'Satellite Health Report — Starlink Constellation', type: 'special', date: '2026-06-07', status: 'Ready', pages: 18, riskLevel: 'NOMINAL' },
  { id: 'RPT-005', title: 'Conjunction Assessment Summary', type: 'daily', date: '2026-06-09', status: 'Generating', pages: 0, riskLevel: 'HIGH' },
];

// ============================================================
// AI Copilot Suggested Prompts
// ============================================================

export const aiSuggestedPrompts = [
  'Analyze collision risk for STARLINK-3021',
  'Generate debris avoidance report for ISS',
  'What is the current Kp index forecast?',
  'Show me all high-risk conjunctions in the next 24 hours',
  'Summarize orbital congestion in LEO',
  'Recommend maneuver for ISS debris avoidance',
];

export const aiMockResponses: Record<string, string> = {
  default: `## Orbital Analysis Report

Based on current tracking data, I've identified **4 high-priority conjunctions** in the next 24 hours:

### Critical Events
1. **STARLINK-3021 × DEBRIS-88172** — TCA in 12 minutes, miss distance 142m, probability 9.8%
   - **Recommendation**: Immediate collision avoidance maneuver (CAM) advised
   - Delta-v required: 0.3 m/s retrograde burn

2. **ISS × COSMOS-DEB-4421** — TCA in 47 minutes, miss distance 380m, probability 6.7%
   - **Recommendation**: Continue monitoring, prepare Pre-Determined Avoidance Maneuver (PDAM)

### Space Weather Impact
Current Kp index of 5 indicates moderate geomagnetic activity. This may cause increased atmospheric drag on LEO objects below 500km, potentially altering predicted trajectories.

### Summary
Overall orbital risk index is at **72% (HIGH)**. Recommend elevated monitoring posture for the next 6 hours.`,
};
