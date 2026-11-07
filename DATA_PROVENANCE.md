# KesslerX — Data Provenance & Freshness Specification

## 1. Provenance Philosophy

In aerospace and orbital safety operations, unverified, unlabelled, or silently mixed synthetic data can lead to catastrophic operational decisions. KesslerX enforces **honest, transparent data provenance** across every interface, API endpoint, and exportable report.

---

## 2. The Data Envelope (`DataEnvelope<T>`)

All telemetry, conjunction, orbital, and space weather data models implement or wrap the standard `DataEnvelope<T>`:

```typescript
export interface DataEnvelope<T> {
  value: T;
  source: 'space-track' | 'noaa' | 'nasa' | 'local' | 'simulation' | 'demo';
  mode: 'observed' | 'derived' | 'simulated' | 'fallback';
  observedAt?: string;
  generatedAt: string;
  freshnessSeconds?: number;
  warnings: string[];
}
```

### Definitions:

#### Sources:
- `space-track`: Official Space-Track.org / 18th Space Defense Squadron catalog.
- `noaa`: NOAA Space Weather Prediction Center (SWPC) Boulder, CO.
- `nasa`: NASA orbital debris program office / CelesTrak.
- `local`: Locally computed or SGP4-propagated physics.
- `simulation`: Monte Carlo kinetic fragmentation or HIL hardware simulation.
- `demo`: Static demonstration fixtures when upstream networks are unavailable.

#### Modes:
- `observed`: Direct telemetry sensor packets or unmanipulated radar observations.
- `derived`: Calculated via deterministic analytical physics (e.g. SGP4 propagation, Vis-Viva maneuver burns, Jacchia-Bowman thermospheric drag).
- `simulated`: Stochastic kinetic fragmentation cascades or hardware-in-the-loop emulation.
- `fallback`: Offline cached fixtures utilized when upstream APIs are sleeping or rate-limited.

---

## 3. Freshness & Stale Data Policies

1. **Dynamic Time of Closest Approach (TCA)**:
   - Conjunction events never display static fixed historical dates as "next 24 hours".
   - TCA values are dynamically calculated relative to the active operational session time.
2. **TLE Epoch Age Warnings**:
   - TLEs older than 72 hours trigger a visible `"Stale TLE"` warning badge.
   - SGP4 covariance error expands exponentially with epoch age; users are notified when radar re-tasking is required.
3. **Upstream Degradation**:
   - When external upstream providers (e.g. Space-Track or NOAA) are unreachable, endpoints return structured fallback responses with `warnings: ["Upstream service unavailable — using validated offline baseline"]`.
   - The platform **never** silently masks an upstream error as live data.

---

## 4. UI Indicators

- **`ProvenanceBadge`**: Compact visual pill displayed on charts, tables, cards, and modal dialogs indicating source, mode, and warning tooltips.
- **`GlobalProvenanceBanner`**: Global system status banner pinned to the top of the application informing the operator whether the session is operating in Live, Derived, Simulated, or Fallback mode.

