import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { motion } from 'framer-motion';
import * as satellite from 'satellite.js';
import * as CesiumModule from 'cesium';
import { detectWebGLSupport } from '../../utils/webglDetection';
import GlobeFallbackTable, { SatelliteItem } from './GlobeFallbackTable';
import {
  PHONE_SATELLITE_IDENTITY,
  PHONE_MOCK_ORBIT,
  buildPhoneOrbitTrack,
  phoneSatelliteToItem,
  type PhoneSatelliteData,
} from '../../utils/phoneSatelliteOrbit';

// Ensure Cesium base URL is set
if (typeof window !== 'undefined' && !(window as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL) {
  (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = '/cesium/';
}

// ── Follow Mode Types ───────────────────────────────────────
export type CameraMode = 'FREE' | 'FOCUSING' | 'FOLLOWING';

export interface FollowState {
  mode: CameraMode;
  targetId?: string;
  targetName?: string;
}

export interface CesiumGlobeProps {
  satellites: SatelliteItem[];
  phoneSatellite?: PhoneSatelliteData | null;
  onSelectObject?: (sat: SatelliteItem | null) => void;
  selectedObject?: SatelliteItem | null;
  filters?: Record<string, boolean>;
  showOrbitLines?: boolean;
  enableLighting?: boolean;
  showSunMoon?: boolean;
  onFollowStateChange?: (state: FollowState) => void;
  forceFallback?: boolean;
}

export interface CesiumGlobeRef {
  zoomIn: () => void;
  zoomOut: () => void;
  zenithView: () => void;
  resetView: () => void;
  toggleAutoRotate: () => void;
  flyToSatellite: (noradId: string) => void;
  stopFollowing: () => void;
  getFollowState: () => FollowState;
  retryInitialization: () => void;
}

// SGP4 propagation helper
function propagateToDate(satrec: satellite.SatRec, date: Date) {
  const pv = satellite.propagate(satrec, date);
  if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
  const gmst = satellite.gstime(date);
  const gd = satellite.eciToGeodetic(pv.position as satellite.EciVec3<number>, gmst);
  return {
    lon: satellite.degreesLong(gd.longitude),
    lat: satellite.degreesLat(gd.latitude),
    height: gd.height, // km
  };
}

// Build a SampledPositionProperty from TLE over a time window
function buildSampledPosition(
  Cesium: typeof CesiumModule,
  satrec: satellite.SatRec,
  startDate: Date,
  durationMinutes: number,
  stepSeconds: number,
) {
  const property = new Cesium.SampledPositionProperty();
  property.setInterpolationOptions({
    interpolationDegree: 5,
    interpolationAlgorithm: Cesium.LagrangePolynomialApproximation,
  });
  property.forwardExtrapolationType = Cesium.ExtrapolationType.EXTRAPOLATE;
  property.backwardExtrapolationType = Cesium.ExtrapolationType.EXTRAPOLATE;

  const pastSeconds = 45 * 60;
  const totalSeconds = durationMinutes * 60 + pastSeconds;
  const steps = Math.floor(totalSeconds / stepSeconds);

  for (let i = 0; i <= steps; i++) {
    const t = new Date(startDate.getTime() - pastSeconds * 1000 + i * stepSeconds * 1000);
    const pos = propagateToDate(satrec, t);
    if (!pos) continue;
    const cesiumTime = Cesium.JulianDate.fromDate(t);
    const cartesian = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.height * 1000);
    property.addSample(cesiumTime, cartesian);
  }

  return property;
}

// Build a polyline positions array for the orbital path
function buildOrbitPath(
  Cesium: typeof CesiumModule,
  satrec: satellite.SatRec,
  startDate: Date,
  durationMinutes: number,
  stepSeconds: number,
) {
  const positions: CesiumModule.Cartesian3[] = [];
  const steps = Math.floor((durationMinutes * 60) / stepSeconds);
  for (let i = 0; i <= steps; i++) {
    const t = new Date(startDate.getTime() + i * stepSeconds * 1000);
    const pos = propagateToDate(satrec, t);
    if (!pos) continue;
    positions.push(Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.height * 1000));
  }
  return positions;
}

const CesiumGlobe = forwardRef<CesiumGlobeRef, CesiumGlobeProps>((
  {
    satellites,
    phoneSatellite,
    onSelectObject,
    selectedObject,
    filters,
    showOrbitLines = true,
    enableLighting = true,
    showSunMoon = true,
    onFollowStateChange,
    forceFallback = false,
  },
  ref
) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const creditContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumModule.Viewer | null>(null);
  const entitiesRef = useRef<{ entity: CesiumModule.Entity; category: string }[]>([]);
  const autoRotateEnabledRef = useRef<boolean>(true);
  const autoRotateWasEnabledRef = useRef<boolean>(true);

  const [error, setError] = useState<string | null>(null);
  const [cesiumReady, setCesiumReady] = useState(false);
  const [useFallback, setUseFallback] = useState(forceFallback);
  const [fallbackReason, setFallbackReason] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);

  const handleRetry = useCallback(() => {
    setError(null);
    setCesiumReady(false);
    setUseFallback(false);
    setFallbackReason('');
    setRetryCount((prev) => prev + 1);
  }, []);

  const followStateRef = useRef<FollowState>({ mode: 'FREE' });
  const selectedEntityOriginalRef = useRef<{
    pixelSize?: number;
    outlineWidth?: number;
    outlineColor?: CesiumModule.Color;
    entity: CesiumModule.Entity;
  } | null>(null);

  const onFollowStateChangeRef = useRef(onFollowStateChange);
  onFollowStateChangeRef.current = onFollowStateChange;

  const onSelectObjectRef = useRef(onSelectObject);
  onSelectObjectRef.current = onSelectObject;

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const showOrbitLinesRef = useRef(showOrbitLines);
  showOrbitLinesRef.current = showOrbitLines;

  const phoneSatelliteRef = useRef<PhoneSatelliteData | null | undefined>(phoneSatellite);
  phoneSatelliteRef.current = phoneSatellite;
  const phoneMarkerEntityRef = useRef<CesiumModule.Entity | null>(null);
  const phoneOrbitEntityRef = useRef<CesiumModule.Entity | null>(null);

  const emitFollowState = useCallback((state: FollowState) => {
    followStateRef.current = state;
    onFollowStateChangeRef.current?.(state);
  }, []);

  // Expose imperative camera / navigation methods
  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.camera.moveForward(2000000);
      }
    },
    zoomOut: () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.camera.moveBackward(2000000);
      }
    },
    zenithView: () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        if (followStateRef.current.mode !== 'FREE') {
          viewerRef.current.trackedEntity = undefined;
          emitFollowState({ mode: 'FREE' });
          autoRotateEnabledRef.current = autoRotateWasEnabledRef.current;
        }
        viewerRef.current.camera.flyTo({
          destination: CesiumModule.Cartesian3.fromDegrees(20, 20, 20000000),
          duration: 1.5,
        });
      }
    },
    resetView: () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        if (followStateRef.current.mode !== 'FREE') {
          viewerRef.current.trackedEntity = undefined;
          emitFollowState({ mode: 'FREE' });
          autoRotateEnabledRef.current = autoRotateWasEnabledRef.current;
        }
        viewerRef.current.camera.flyTo({
          destination: CesiumModule.Cartesian3.fromDegrees(20, 20, 20000000),
          duration: 1.5,
        });
      }
    },
    toggleAutoRotate: () => {
      autoRotateEnabledRef.current = !autoRotateEnabledRef.current;
      autoRotateWasEnabledRef.current = autoRotateEnabledRef.current;
    },
    flyToSatellite: (noradId: string) => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;

      const entity = viewer.entities.getById(noradId);
      if (!entity) return;

      restoreEntityHighlight();
      highlightEntity(entity);

      autoRotateWasEnabledRef.current = autoRotateEnabledRef.current;
      autoRotateEnabledRef.current = false;

      let offset = 250000;
      try {
        const currentTime = viewer.clock.currentTime;
        const pos = entity.position?.getValue(currentTime);
        if (pos) {
          const carto = CesiumModule.Cartographic.fromCartesian(pos);
          const altKm = carto.height / 1000;
          offset = Math.max(120000, Math.min(2500000, altKm * 350));
        }
      } catch {
        // use default offset
      }

      entity.viewFrom = new CesiumModule.ConstantProperty(
        new CesiumModule.Cartesian3(-offset * 0.75, -offset * 0.75, offset * 0.4)
      );

      emitFollowState({
        mode: 'FOCUSING',
        targetId: noradId,
        targetName: entity.name || noradId,
      });

      viewer.flyTo(entity, {
        duration: 1.8,
        offset: new CesiumModule.HeadingPitchRange(0, CesiumModule.Math.toRadians(-25), offset),
      }).then(() => {
        if (viewer.isDestroyed()) return;
        viewer.trackedEntity = entity;
        emitFollowState({
          mode: 'FOLLOWING',
          targetId: noradId,
          targetName: entity.name || noradId,
        });
      });
    },
    stopFollowing: () => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;

      viewer.trackedEntity = undefined;
      autoRotateEnabledRef.current = autoRotateWasEnabledRef.current;
      emitFollowState({ mode: 'FREE' });

      viewer.camera.flyTo({
        destination: CesiumModule.Cartesian3.fromDegrees(20, 20, 20000000),
        duration: 1.5,
      });
    },
    getFollowState: () => followStateRef.current,
    retryInitialization: handleRetry,
  }));

  function highlightEntity(entity: CesiumModule.Entity) {
    if (!entity.point) return;
    const currentTime = viewerRef.current?.clock?.currentTime;
    selectedEntityOriginalRef.current = {
      pixelSize: (currentTime ? entity.point.pixelSize?.getValue(currentTime) : undefined) || 12,
      outlineWidth: (currentTime ? entity.point.outlineWidth?.getValue(currentTime) : undefined) || 1.5,
      outlineColor: (currentTime ? entity.point.outlineColor?.getValue(currentTime) : undefined) || CesiumModule.Color.WHITE.withAlpha(0.6),
      entity,
    };
    entity.point.pixelSize = new CesiumModule.ConstantProperty(18);
    entity.point.outlineWidth = new CesiumModule.ConstantProperty(3.5);
    entity.point.outlineColor = new CesiumModule.ConstantProperty(CesiumModule.Color.fromCssColorString('#00FFFF'));
    entity.point.disableDepthTestDistance = new CesiumModule.ConstantProperty(Number.POSITIVE_INFINITY);
  }

  function restoreEntityHighlight() {
    const prev = selectedEntityOriginalRef.current;
    if (prev?.entity && viewerRef.current && !viewerRef.current.isDestroyed()) {
      try {
        if (prev.entity.point) {
          prev.entity.point.pixelSize = new CesiumModule.ConstantProperty(prev.pixelSize || 12);
          prev.entity.point.outlineWidth = new CesiumModule.ConstantProperty(prev.outlineWidth || 1.5);
          prev.entity.point.outlineColor = new CesiumModule.ConstantProperty(
            prev.outlineColor || CesiumModule.Color.fromCssColorString('#ffffff').withAlpha(0.6)
          );
          prev.entity.point.disableDepthTestDistance = new CesiumModule.ConstantProperty(Number.POSITIVE_INFINITY);
        }
      } catch {
        // entity may have been destroyed
      }
    }
    selectedEntityOriginalRef.current = null;
  }

  // Cesium viewer initialization
  useEffect(() => {
    if (useFallback) return;

    // Check WebGL support first
    const webglSupport = detectWebGLSupport();
    if (!webglSupport.supported) {
      console.warn('WebGL not supported:', webglSupport.errorMessage);
      setFallbackReason(webglSupport.errorMessage || 'WebGL is not supported or hardware acceleration is disabled.');
      setUseFallback(true);
      return;
    }

    let viewer: CesiumModule.Viewer | null = null;
    let animFrameId: number;
    let isCancelled = false;

    // Safe timeout to prevent hanging on "Initializing Globe..."
    const initTimeout = setTimeout(() => {
      if (!isCancelled && !cesiumReady && !viewerRef.current) {
        console.warn('Cesium initialization timed out after 12 seconds. Falling back to 2D view.');
        setFallbackReason('3D Globe initialization timed out (12s). Switched to 2D Fallback view.');
        setUseFallback(true);
      }
    }, 12000);

    const initCesium = async () => {
      try {
        const Cesium = CesiumModule;
        if (isCancelled || !containerRef.current) return;

        containerRef.current.innerHTML = '';

        // Read token ONLY from env var. Never hardcode tokens in source code!
        const token = (import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined)?.trim();
        if (token && token !== '') {
          Cesium.Ion.defaultAccessToken = token;
        } else {
          // Clear default token; use free open tile layers
          Cesium.Ion.defaultAccessToken = '';
        }

        const now = new Date();
        const startJD = Cesium.JulianDate.fromDate(now);
        const stopJD = Cesium.JulianDate.addMinutes(startJD, 180, new Cesium.JulianDate());

        // Create viewer
        viewer = new Cesium.Viewer(containerRef.current, {
          animation: false,
          timeline: false,
          fullscreenButton: false,
          vrButton: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          baseLayerPicker: false,
          navigationHelpButton: false,
          infoBox: false,
          selectionIndicator: false,
          creditContainer: creditContainerRef.current || undefined,
          skyBox: false,
          skyAtmosphere: false,
          baseLayer: false,
          contextOptions: {
            webgl: {
              alpha: true,
              preserveDrawingBuffer: true,
              failIfMajorPerformanceCaveat: false,
            },
          },
        });

        if (isCancelled) {
          viewer.destroy();
          return;
        }

        viewerRef.current = viewer;

        // Configure clock
        viewer.clock.startTime = startJD.clone();
        viewer.clock.stopTime = stopJD.clone();
        viewer.clock.currentTime = startJD.clone();
        viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
        viewer.clock.multiplier = 60;
        viewer.clock.shouldAnimate = true;
        viewer.scene.requestRenderMode = false;

        // Lighting
        try {
          if (!viewer.scene.sun) viewer.scene.sun = new Cesium.Sun();
          viewer.scene.sun.show = showSunMoon;
        } catch {
          // sun not supported
        }

        try {
          if (!viewer.scene.moon) viewer.scene.moon = new Cesium.Moon();
          viewer.scene.moon.show = showSunMoon;
        } catch {
          // moon not supported
        }

        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#040714');
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#081224');
        viewer.scene.globe.showGroundAtmosphere = true;
        viewer.scene.globe.enableLighting = enableLighting;

        // Imagery layer: try Ion Bing Maps if token is set, else OSM tiles
        try {
          if (token && token.length > 20) {
            const ionProvider = await Cesium.IonImageryProvider.fromAssetId(2);
            viewer.imageryLayers.addImageryProvider(ionProvider);
          } else {
            // OpenStreetMap tiles without requiring an Ion token
            viewer.imageryLayers.addImageryProvider(
              new Cesium.UrlTemplateImageryProvider({
                url: 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                maximumLevel: 19,
              })
            );
          }
        } catch {
          try {
            viewer.imageryLayers.addImageryProvider(
              new Cesium.UrlTemplateImageryProvider({
                url: 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                maximumLevel: 19,
              })
            );
          } catch {
            console.warn('Globe imagery fallback to base color');
          }
        }

        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(20, 20, 20000000),
        });

        // Auto-rotation
        autoRotateEnabledRef.current = true;
        const rotate = () => {
          if (viewer && !viewer.isDestroyed() && autoRotateEnabledRef.current) {
            viewer.scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, 0.0002);
          }
          animFrameId = requestAnimationFrame(rotate);
        };
        animFrameId = requestAnimationFrame(rotate);

        // Add satellite entities
        addEntities(Cesium, viewer, now);
        addPhoneSatelliteOverlay(Cesium, viewer, now);

        // Click handler for selection
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((movement: { position: CesiumModule.Cartesian2 }) => {
          const picked = viewer?.scene.pick(movement.position);
          if (Cesium.defined(picked) && picked.id) {
            const pickedEntity = picked.id as CesiumModule.Entity;
            const sat =
              pickedEntity.id === PHONE_SATELLITE_IDENTITY.id && phoneSatelliteRef.current
                ? phoneSatelliteToItem(phoneSatelliteRef.current)
                : satellites.find((s) => String(s.NORAD_CAT_ID || s.id) === pickedEntity.id);
            if (sat && onSelectObjectRef.current) {
              restoreEntityHighlight();
              highlightEntity(pickedEntity);
              onSelectObjectRef.current(sat);
            }
          } else if (onSelectObjectRef.current) {
            restoreEntityHighlight();
            if (followStateRef.current.mode !== 'FREE') {
              if (viewer) viewer.trackedEntity = undefined;
              autoRotateEnabledRef.current = autoRotateWasEnabledRef.current;
              emitFollowState({ mode: 'FREE' });
            }
            onSelectObjectRef.current(null);
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        // Listen for user camera movements to reset follow mode
        let lastTracked: CesiumModule.Entity | undefined = undefined;
        viewer.scene.preRender.addEventListener(() => {
          const currentTracked = viewer?.trackedEntity;
          if (lastTracked && !currentTracked && followStateRef.current.mode === 'FOLLOWING') {
            autoRotateEnabledRef.current = autoRotateWasEnabledRef.current;
            emitFollowState({ mode: 'FREE' });
          }
          lastTracked = currentTracked;
        });

        // Attach WebGL context loss handlers
        const canvas = viewer.scene.canvas;
        const handleContextLost = (e: Event) => {
          e.preventDefault();
          console.warn('[CesiumGlobe] WebGL context lost.');
          setError('WebGL context lost. Hardware acceleration or GPU reset occurred.');
        };
        const handleContextRestored = () => {
          console.info('[CesiumGlobe] WebGL context restored. Reinitializing viewer.');
          handleRetry();
        };

        canvas.addEventListener('webglcontextlost', handleContextLost, false);
        canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

        clearTimeout(initTimeout);
        setCesiumReady(true);
        setError(null);
      } catch (err) {
        console.error('Failed to initialize Cesium:', err);
        clearTimeout(initTimeout);
        const msg = err instanceof Error ? err.message : 'Failed to initialize Cesium globe';
        setError(msg);
        setFallbackReason(`Globe initialization error: ${msg}`);
      }
    };

    const addEntities = (Cesium: typeof CesiumModule, v: CesiumModule.Viewer, now: Date) => {
      v.entities.removeAll();
      entitiesRef.current = [];

      satellites.forEach((sat) => {
        const id = String(sat.NORAD_CAT_ID || sat.id || Math.random());
        const name = sat.OBJECT_NAME || sat.name || `Object #${id}`;
        const category = sat.CATEGORY || sat.type || sat.OBJECT_TYPE || 'Unknown';
        const isDebris = category.toUpperCase() === 'DEBRIS';

        try {
          let positionProperty: CesiumModule.PositionProperty | CesiumModule.Cartesian3 | null = null;
          let orbitPathPositions: CesiumModule.Cartesian3[] | null = null;

          if (sat.TLE_LINE1 && sat.TLE_LINE2) {
            const satrec = satellite.twoline2satrec(sat.TLE_LINE1, sat.TLE_LINE2);
            const testPos = propagateToDate(satrec, now);
            if (!testPos) return;

            const durationMin = 180;
            const stepSec = isDebris ? 60 : 30;

            positionProperty = buildSampledPosition(Cesium, satrec, now, durationMin, stepSec);

            if (!isDebris) {
              orbitPathPositions = buildOrbitPath(Cesium, satrec, now, durationMin, 60);
            }
          } else if (sat.altitude !== undefined) {
            const lat = 0;
            const lon = 0;
            positionProperty = Cesium.Cartesian3.fromDegrees(lon, lat, sat.altitude * 1000);
          } else {
            return;
          }

          const color = getCategoryColor(Cesium, category);
          const size = isDebris ? 7 : 12;
          const isVisible = filtersRef.current && category ? filtersRef.current[category] !== false : true;

          const entityConfig: CesiumModule.Entity.ConstructorOptions = {
            id,
            name,
            show: isVisible,
            position: positionProperty,
            point: {
              pixelSize: size,
              color: color,
              outlineColor: Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.6),
              outlineWidth: 1.5,
              scaleByDistance: new Cesium.NearFarScalar(5e4, 1.8, 5e7, 0.7),
            },
            label: {
              text: name,
              font: '11px "Space Grotesk", sans-serif',
              fillColor: Cesium.Color.WHITE.withAlpha(0.9),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -14),
              scaleByDistance: new Cesium.NearFarScalar(1e6, 1, 4e7, 0),
              translucencyByDistance: new Cesium.NearFarScalar(1e6, 1, 4e7, 0),
            },
          };

          if (!isDebris && sat.TLE_LINE1) {
            entityConfig.path = {
              resolution: 120,
              material: color.withAlpha(0.4),
              width: 1.5,
              leadTime: 2700,
              trailTime: 2700,
              show: (isVisible && showOrbitLines) as unknown as boolean,
            };
          }

          const entity = v.entities.add(entityConfig);
          entitiesRef.current.push({ entity, category });

          if (orbitPathPositions && orbitPathPositions.length > 1) {
            v.entities.add({
              polyline: {
                positions: orbitPathPositions,
                width: 1,
                material: color.withAlpha(0.25),
                show: (isVisible && showOrbitLines) as unknown as boolean,
              },
              properties: new Cesium.PropertyBag({
                orbitPathFor: id,
                category,
              }),
            });
          }
        } catch {
          // ignore individual item parse failure
        }
      });
    };

    const addPhoneSatelliteOverlay = (Cesium: typeof CesiumModule, v: CesiumModule.Viewer, now: Date) => {
      if (!phoneSatelliteRef.current) return;
      try {
        const startSampleDate = new Date(now.getTime() - 45 * 60 * 1000);
        const sampledTrack = buildPhoneOrbitTrack(startSampleDate, 225, 30);
        const posProp = new Cesium.SampledPositionProperty();
        posProp.setInterpolationOptions({
          interpolationDegree: 5,
          interpolationAlgorithm: Cesium.LagrangePolynomialApproximation,
        });
        posProp.forwardExtrapolationType = Cesium.ExtrapolationType.EXTRAPOLATE;
        posProp.backwardExtrapolationType = Cesium.ExtrapolationType.EXTRAPOLATE;

        for (const sample of sampledTrack) {
          posProp.addSample(
            Cesium.JulianDate.fromDate(sample.time),
            Cesium.Cartesian3.fromDegrees(sample.pos.lon, sample.pos.lat, sample.pos.altitude_km * 1000)
          );
        }

        const closedOrbitSamples = buildPhoneOrbitTrack(now, PHONE_MOCK_ORBIT.period_minutes, 45);
        const orbitCartesians = closedOrbitSamples.map((s) =>
          Cesium.Cartesian3.fromDegrees(s.pos.lon, s.pos.lat, s.pos.altitude_km * 1000)
        );
        if (orbitCartesians.length > 2) {
          orbitCartesians.push(orbitCartesians[0]);
        }

        const phoneColor = Cesium.Color.fromCssColorString(PHONE_SATELLITE_IDENTITY.color);
        const isVisible = filtersRef.current?.['Phone Satellite'] !== false;

        const orientationProp = new Cesium.CallbackProperty((time: CesiumModule.JulianDate | undefined) => {
          const evalTime = time || v.clock.currentTime;
          const pos = posProp.getValue(evalTime);
          if (!pos) return Cesium.Quaternion.IDENTITY;
          const ori = phoneSatelliteRef.current?.telemetry?.orientation;
          const hpr = new Cesium.HeadingPitchRoll(
            Cesium.Math.toRadians(ori?.yaw_deg ?? 0),
            Cesium.Math.toRadians(ori?.pitch_deg ?? 0),
            Cesium.Math.toRadians(ori?.roll_deg ?? 0)
          );
          return Cesium.Transforms.headingPitchRollQuaternion(pos, hpr);
        }, false);

        const markerEntity = v.entities.add({
          id: PHONE_SATELLITE_IDENTITY.id,
          name: PHONE_SATELLITE_IDENTITY.name,
          description: PHONE_SATELLITE_IDENTITY.description,
          show: isVisible,
          position: posProp,
          orientation: orientationProp,
          point: {
            pixelSize: 15,
            color: phoneColor,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            scaleByDistance: new Cesium.NearFarScalar(5e4, 1.8, 5e7, 0.8),
          },
          box: {
            dimensions: new Cesium.Cartesian3(12000, 22000, 3500),
            material: phoneColor.withAlpha(0.85),
            outline: true,
            outlineColor: Cesium.Color.WHITE,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3500000),
          },
          label: {
            text: PHONE_SATELLITE_IDENTITY.name,
            font: 'bold 11px "Space Grotesk", sans-serif',
            fillColor: Cesium.Color.fromCssColorString('#F9A8D4'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -16),
            scaleByDistance: new Cesium.NearFarScalar(1e6, 1, 5e7, 0.35),
            translucencyByDistance: new Cesium.NearFarScalar(1e6, 1, 5e7, 0.25),
          },
          path: {
            resolution: 90,
            material: phoneColor.withAlpha(0.7),
            width: 2.0,
            leadTime: 2922,
            trailTime: 2922,
            show: (isVisible && showOrbitLinesRef.current) as unknown as boolean,
          },
        });
        phoneMarkerEntityRef.current = markerEntity;
        entitiesRef.current.push({ entity: markerEntity, category: 'Phone Satellite' });

        if (orbitCartesians.length > 1) {
          const orbitEntity = v.entities.add({
            id: `${PHONE_SATELLITE_IDENTITY.id}-ORBIT`,
            polyline: {
              positions: orbitCartesians,
              width: 2.5,
              material: phoneColor.withAlpha(0.85),
              show: (isVisible && showOrbitLinesRef.current) as unknown as boolean,
            },
            properties: new Cesium.PropertyBag({
              orbitPathFor: PHONE_SATELLITE_IDENTITY.id,
              category: 'Phone Satellite',
            }),
          });
          phoneOrbitEntityRef.current = orbitEntity;
        }
      } catch {
        // ignore phone overlay errors so existing globe never breaks
      }
    };

    initCesium();

    return () => {
      isCancelled = true;
      clearTimeout(initTimeout);
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (viewer && !viewer.isDestroyed()) {
        try {
          viewer.destroy();
        } catch {
          // ignore destroy errors
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satellites, useFallback, retryCount, handleRetry]);

  // Update entity and path visibility when filters or showOrbitLines change
  useEffect(() => {
    entitiesRef.current.forEach(({ entity, category }) => {
      const shouldShow = filters ? filters[category] !== false : true;
      if (entity.show !== shouldShow) {
        entity.show = shouldShow;
      }
      if (entity.path) {
        entity.path.show = new CesiumModule.ConstantProperty(shouldShow && showOrbitLines);
      }
    });

    if (viewerRef.current && !viewerRef.current.isDestroyed()) {
      const entities = viewerRef.current.entities.values;
      for (let i = 0; i < entities.length; i++) {
        const e = entities[i];
        if (e.properties && e.properties.hasProperty('category')) {
          const cat = e.properties.getValue(CesiumModule.JulianDate.now())?.category;
          const shouldShow = filters && cat ? filters[cat] !== false : true;
          if (e.polyline) {
            e.polyline.show = new CesiumModule.ConstantProperty(shouldShow && showOrbitLines);
          }
        }
      }
    }
  }, [filters, showOrbitLines]);

  // Lighting & Sun/Moon update
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    try {
      viewer.scene.globe.enableLighting = enableLighting;
      if (viewer.scene.sun) viewer.scene.sun.show = showSunMoon;
      if (viewer.scene.moon) viewer.scene.moon.show = showSunMoon;
    } catch {
      // API not available
    }
  }, [enableLighting, showSunMoon]);

  // Render 2D Fallback view if WebGL is disabled or failed
  if (useFallback) {
    return (
      <GlobeFallbackTable
        satellites={satellites}
        phoneSatellite={phoneSatellite}
        onSelectObject={onSelectObject}
        selectedObject={selectedObject}
        reason={fallbackReason || 'WebGL disabled or 3D Globe fallback requested'}
        onRetry3D={handleRetry}
        filters={filters}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="relative rounded-xl overflow-hidden"
      style={{
        border: '1px solid rgba(0, 174, 239, 0.12)',
        boxShadow: '0 0 30px rgba(0, 174, 239, 0.06)',
      }}
    >
      {error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#050816]/95 backdrop-blur-sm p-6 text-center">
          <div className="max-w-md">
            <span className="material-symbols-outlined text-4xl text-amber-400 mb-2 block">warning</span>
            <p className="text-amber-300 font-medium mb-2">{error}</p>
            <p className="text-slate-400 text-xs mb-4">
              WebGL context error or Cesium failed to load properly. You can continue using the 2D tabular fallback.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setUseFallback(true)}
                className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition-colors"
              >
                Open 2D Tracking Table
              </button>
              <button
                onClick={handleRetry}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 text-xs hover:bg-slate-700 transition-colors"
              >
                Retry 3D Globe
              </button>
            </div>
          </div>
        </div>
      )}

      {!cesiumReady && !error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#050816]">
          <div className="text-center">
            <div
              className="w-12 h-12 rounded-full border-2 border-t-transparent mx-auto mb-3 border-cyan-400/30"
              style={{ borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }}
            />
            <span className="text-xs font-mono text-cyan-300 uppercase tracking-widest block mb-1">
              Initializing 3D Orbital Globe...
            </span>
            <span className="text-[10px] text-slate-500 block mb-3">
              Detecting WebGL & Propagating SGP4 Orbit Elements
            </span>
            <button
              onClick={() => setUseFallback(true)}
              className="px-3 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            >
              Skip to 2D Fallback View
            </button>
          </div>
        </div>
      )}

      <div ref={containerRef} className="w-full h-[520px]" />

      {/* Compliant Cesium Attribution Container */}
      <div
        ref={creditContainerRef}
        aria-label="Cesium Attribution"
        className="absolute bottom-1 right-2 z-10 text-[10px] text-slate-500 bg-slate-950/80 px-2 py-0.5 rounded pointer-events-auto"
      />

      {/* Decorative gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, transparent 55%, rgba(5,8,22,0.45) 100%)',
        }}
      />

      {/* Live tracking badge with fallback toggle */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-950/80 border border-slate-800 backdrop-blur-sm">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: '#00FF99', boxShadow: '0 0 6px #00FF99' }}
          />
          <span className="text-[10px] font-bold tracking-widest text-slate-300 font-mono">
            3D ORBITAL SIMULATION
          </span>
        </div>
        <button
          onClick={() => setUseFallback(true)}
          className="px-2 py-1 rounded bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-mono transition-colors"
          title="Switch to 2D Table View"
        >
          2D View
        </button>
      </div>

      <div className="absolute top-3 right-3 z-10">
        <span className="text-[11px] font-mono font-bold text-cyan-400 bg-slate-950/80 px-2.5 py-1 rounded border border-cyan-500/30">
          {satellites.length + (phoneSatellite ? 1 : 0)} OBJECTS TRACKED
        </span>
      </div>
    </motion.div>
  );
});

CesiumGlobe.displayName = 'CesiumGlobe';

export default CesiumGlobe;

function getCategoryColor(Cesium: typeof CesiumModule, category: string): CesiumModule.Color {
  switch (category) {
    case 'Communication':
      return Cesium.Color.fromCssColorString('#00AEEF');
    case 'Debris':
      return Cesium.Color.fromCssColorString('#FF4D4D').withAlpha(0.65);
    case 'ISS':
      return Cesium.Color.fromCssColorString('#FFFFFF');
    case 'Weather':
      return Cesium.Color.fromCssColorString('#EAB308');
    case 'Military':
      return Cesium.Color.fromCssColorString('#F97316');
    case 'GPS':
      return Cesium.Color.fromCssColorString('#10B981');
    case 'Scientific':
      return Cesium.Color.fromCssColorString('#A855F7');
    case 'Phone Satellite':
      return Cesium.Color.fromCssColorString(PHONE_SATELLITE_IDENTITY.color);
    default:
      return Cesium.Color.fromCssColorString('#94A3B8');
  }
}
