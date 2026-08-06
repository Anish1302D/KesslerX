# Session 006 — Real-Time Satellite Orbital Trajectories
**Date**: 2026-08-06
**Developer**: anish
**Agent**: Antigravity IDE (Claude Opus 4.6 Thinking)

---

## Overview

This session focused on making satellites move along their **real orbital trajectories** on the Cesium 3D globe, instead of appearing "tidally locked" to Earth's surface. The root cause was that satellites were rendered as static dots at a single propagated position — they rotated with the globe's ECEF frame, giving the illusion of being fixed to Earth.

## Problem

Satellites and debris dots on the globe were all moving in the same direction at the same speed as the Earth's rotation, regardless of their actual orbital inclination or velocity. This made the visualization unrealistic.

## Root Cause

In `CesiumGlobe.tsx`, each satellite's TLE was propagated via SGP4 to a **single timestamp** (`new Date()`), producing a fixed `Cesium.Cartesian3` position. Cesium treated this as a static entity that rotated with the globe.

## Solution

### 1. `SampledPositionProperty` with SGP4 Propagation
- **File**: `src/components/dashboard/CesiumGlobe.tsx`
- For each satellite with TLE data, SGP4 positions are propagated over a **180-minute window** (2 full LEO orbits)
- Positions sampled every **30 seconds** (payloads) or **60 seconds** (debris)
- Fed into `Cesium.SampledPositionProperty` with **Lagrange polynomial interpolation** (degree 5)
- Cesium's clock automatically animates the dots along their real trajectories

### 2. Cesium Clock System Enabled
- `shouldAnimate = true` — clock drives satellite positions
- `multiplier = 60` — **60x speed** (1 real second = 1 simulated minute)
- At 60x, a LEO satellite completes a full orbit in ~90 real seconds — clearly visible
- `clockRange = LOOP_STOP` — loops after 180 sim-minutes

### 3. Trailing Orbital Path Visualization
- Non-debris satellites get a `path` property showing a **trailing/leading arc**:
  - 45 min lead time + 45 min trail time
  - Color-matched to satellite category with 40% opacity
- Separate orbit polylines also drawn for full-orbit visualization

### 4. Performance Optimizations
- Debris (100+ objects): 60s sampling interval, no orbit polylines, no trailing paths
- Payload satellites: 30s sampling, full orbit polylines + trailing paths
- Total propagation: ~180 samples/debris × 100 + ~360 samples/payload × 25 = manageable

### 5. Auto-Rotate Preserved
- Globe auto-rotate remains enabled (user requested it back after initial disable)
- Reduced rotation speed to `0.0002` rad/frame so it doesn't compete with satellite motion
- Satellites clearly move independently of the globe rotation

## Helper Functions Added
- `propagateToDate(satrec, date)` — SGP4 propagation to geodetic coords
- `buildSampledPosition(Cesium, satrec, start, duration, step)` — builds time-sampled position property
- `buildOrbitPath(Cesium, satrec, start, duration, step)` — builds static polyline positions

## Files Modified
- `src/components/dashboard/CesiumGlobe.tsx` — complete rework of satellite rendering

## Deployment
- Committed: `feat: real-time satellite orbital trajectories with SGP4 propagation and 60x time acceleration`
- Pushed to `origin/main`
- Vercel auto-deploys frontend
- Render auto-deploys backend (no backend changes this session)

## Visual Result
- ISS, Starlink, and other LEO satellites visibly orbit the globe
- Different inclinations clearly visible (polar vs equatorial orbits)
- GEO satellites (GOES-16) appear nearly stationary relative to Earth
- Debris objects drift along their orbits at 60x speed
- Orbital path arcs show trajectory shape and inclination

## Pending/Next Steps
- Consider adding a speed control slider (1x / 10x / 60x / 120x)
- Add satellite selection flyTo animation (camera follows selected satellite)
- Investigate Render cold-start optimization for backend
