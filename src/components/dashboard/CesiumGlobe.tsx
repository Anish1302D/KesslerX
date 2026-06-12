import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { motion } from 'framer-motion';
import * as satellite from 'satellite.js';

interface CesiumGlobeProps {
  satellites: any[];
  onSelectObject?: (sat: any | null) => void;
  filters?: Record<string, boolean>;
}

export interface CesiumGlobeRef {
  zoomIn: () => void;
  zoomOut: () => void;
  zenithView: () => void;
  toggleAutoRotate: () => void;
}

const CesiumGlobe = forwardRef<CesiumGlobeRef, CesiumGlobeProps>(({ satellites, onSelectObject, filters }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const entitiesRef = useRef<any[]>([]);
  const autoRotateEnabledRef = useRef<boolean>(true);

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
      const Cesium = (window as any).Cesium;
      if (viewerRef.current && !viewerRef.current.isDestroyed() && Cesium) {
        viewerRef.current.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(20, 20, 20000000),
          duration: 1.5,
        });
      }
    },
    toggleAutoRotate: () => {
      autoRotateEnabledRef.current = !autoRotateEnabledRef.current;
    }
  }));

  useEffect(() => {
    let viewer: any = null;
    let animFrameId: number;

    const initCesium = async () => {
      const Cesium = await import('cesium');
      await import('cesium/Build/Cesium/Widgets/widgets.css');

      if (!containerRef.current) return;

      const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
      if (token) {
        Cesium.Ion.defaultAccessToken = token;
      }

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
        creditContainer: document.createElement('div'),
        skyBox: false,
        skyAtmosphere: new Cesium.SkyAtmosphere(),
        contextOptions: {
          webgl: {
            alpha: true,
          },
        },
      });

      (window as any).Cesium = Cesium;
      viewerRef.current = viewer;

      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#050816');
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a1628');
      viewer.scene.globe.showGroundAtmosphere = true;
      viewer.scene.globe.enableLighting = true;

      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(20, 20, 20000000),
      });

      const rotate = () => {
        if (viewer && !viewer.isDestroyed() && autoRotateEnabledRef.current) {
          viewer.scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, 0.001);
        }
        animFrameId = requestAnimationFrame(rotate);
      };
      animFrameId = requestAnimationFrame(rotate);

      addEntities(Cesium, viewer);

      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((movement: any) => {
        const picked = viewer.scene.pick(movement.position);
        if (Cesium.defined(picked) && picked.id) {
          const sat = satellites.find((s) => s.NORAD_CAT_ID.toString() === picked.id.id);
          if (sat && onSelectObject) {
            onSelectObject(sat);
          }
        } else if (onSelectObject) {
          onSelectObject(null);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    };

    const addEntities = (Cesium: any, viewer: any) => {
      viewer.entities.removeAll();
      entitiesRef.current = [];

      satellites.forEach((sat) => {
        if (!sat.TLE_LINE1 || !sat.TLE_LINE2) return;

        try {
          const satrec = satellite.twoline2satrec(sat.TLE_LINE1, sat.TLE_LINE2);
          const positionAndVelocity = satellite.propagate(satrec, new Date());
          const positionEci = positionAndVelocity.position;
          
          if (!positionEci || typeof positionEci === 'boolean') return;
          
          const gmst = satellite.gstime(new Date());
          const positionGd = satellite.eciToGeodetic(positionEci as satellite.EciVec3<number>, gmst);
          
          const longitude = satellite.degreesLong(positionGd.longitude);
          const latitude  = satellite.degreesLat(positionGd.latitude);
          const height    = positionGd.height; // in km

          const color = getColor(Cesium, sat.OBJECT_TYPE);
          const size = sat.OBJECT_TYPE === 'DEBRIS' ? 4 : 6;
          const name = sat.OBJECT_NAME || `Unknown (${sat.NORAD_CAT_ID})`;

          const entity = viewer.entities.add({
            id: sat.NORAD_CAT_ID.toString(),
            name: name,
            position: Cesium.Cartesian3.fromDegrees(longitude, latitude, height * 1000),
            point: {
              pixelSize: size,
              color: color,
              outlineColor: Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.3),
              outlineWidth: 1,
              scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1.5, 4e7, 0.5),
            },
            label: {
              text: name,
              font: '11px "Space Grotesk"',
              fillColor: Cesium.Color.WHITE.withAlpha(0.8),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -12),
              scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1, 3e7, 0),
              translucencyByDistance: new Cesium.NearFarScalar(1.5e7, 1, 3e7, 0),
            },
          });

          entitiesRef.current.push(entity);
        } catch (e) {
          // Ignore invalid TLEs
        }
      });
    };

    initCesium();

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satellites]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.3 }}
      className="relative rounded-xl overflow-hidden"
      style={{
        border: '1px solid rgba(0, 174, 239, 0.12)',
        boxShadow: '0 0 30px rgba(0, 174, 239, 0.06)',
      }}
    >
      <div ref={containerRef} className="w-full h-[500px]" />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, transparent 50%, rgba(5,8,22,0.4) 100%)',
        }}
      />

      <div className="absolute top-3 left-3 pointer-events-none">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#00FF99', boxShadow: '0 0 6px #00FF99' }} />
          <span className="text-[10px] font-bold tracking-widest text-slate-400">
            LIVE TRACKING
          </span>
        </div>
      </div>

      <div className="absolute top-3 right-3 pointer-events-none">
        <span className="text-[10px] font-bold text-primary">
          {satellites.length} OBJECTS
        </span>
      </div>
    </motion.div>
  );
});

export default CesiumGlobe;

function getColor(Cesium: any, type: string) {
  switch (type?.toUpperCase()) {
    case 'PAYLOAD': return Cesium.Color.fromCssColorString('#00AEEF');
    case 'ROCKET BODY': return Cesium.Color.fromCssColorString('#FFC107');
    case 'DEBRIS': return Cesium.Color.fromCssColorString('#FF4D4D').withAlpha(0.6);
    default: return Cesium.Color.fromCssColorString('#94A3B8');
  }
}
