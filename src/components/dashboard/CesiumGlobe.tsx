import { useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { satellites } from '../../data/mockData';

interface CesiumGlobeProps {
  onSelectObject?: (sat: typeof satellites[0] | null) => void;
  filters?: Record<string, boolean>;
}

export default function CesiumGlobe({ onSelectObject, filters }: CesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const entitiesRef = useRef<any[]>([]);

  const filteredSatellites = useMemo(() => {
    if (!filters) return satellites;
    return satellites.filter((sat) => {
      if (sat.type === 'Communication' && !filters['Communication']) return false;
      if (sat.type === 'Debris' && !filters['Debris']) return false;
      if (sat.type === 'ISS' && !filters['ISS']) return false;
      if (sat.type === 'Weather' && !filters['Weather']) return false;
      if (sat.type === 'Military' && !filters['Military']) return false;
      if (sat.type === 'GPS' && !filters['GPS']) return false;
      if (sat.type === 'Scientific' && !filters['Scientific']) return false;
      return true;
    });
  }, [filters]);

  useEffect(() => {
    let viewer: any = null;
    let animFrameId: number;

    const initCesium = async () => {
      const Cesium = await import('cesium');
      await import('cesium/Build/Cesium/Widgets/widgets.css');

      if (!containerRef.current) return;

      // Set token if available
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

      viewerRef.current = viewer;

      // Set dark style
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#050816');
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a1628');
      viewer.scene.globe.showGroundAtmosphere = true;
      viewer.scene.globe.enableLighting = true;

      // Set camera position
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(20, 20, 20000000),
      });

      // Auto-rotate
      const rotate = () => {
        if (viewer && !viewer.isDestroyed()) {
          viewer.scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, 0.0003);
          animFrameId = requestAnimationFrame(rotate);
        }
      };
      animFrameId = requestAnimationFrame(rotate);

      // Add satellites
      addEntities(Cesium, viewer);

      // Click handler
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((movement: any) => {
        const picked = viewer.scene.pick(movement.position);
        if (Cesium.defined(picked) && picked.id) {
          const sat = satellites.find((s) => s.id === picked.id.id);
          if (sat && onSelectObject) {
            onSelectObject(sat);
          }
        } else if (onSelectObject) {
          onSelectObject(null);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    };

    const addEntities = (Cesium: any, viewer: any) => {
      // Clear existing
      viewer.entities.removeAll();
      entitiesRef.current = [];

      filteredSatellites.forEach((sat) => {
        const color = getColor(Cesium, sat.type);
        const size = sat.type === 'Debris' ? 4 : sat.type === 'ISS' ? 12 : 6;

        // Satellite point
        const entity = viewer.entities.add({
          id: sat.id,
          name: sat.name,
          position: Cesium.Cartesian3.fromDegrees(
            sat.lon,
            sat.lat,
            sat.altitude * 1000
          ),
          point: {
            pixelSize: size,
            color: color,
            outlineColor: Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.3),
            outlineWidth: 1,
            scaleByDistance: new Cesium.NearFarScalar(1.5e7, 1.5, 4e7, 0.5),
          },
          label: {
            text: sat.name,
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

        // Orbit path (simplified circle)
        if (sat.type !== 'Debris') {
          const positions: any[] = [];
          for (let angle = 0; angle <= 360; angle += 3) {
            const rad = (angle * Math.PI) / 180;
            const orbitLon = sat.lon + angle;
            const orbitLat = sat.inclination * Math.sin(rad) * 0.8;
            positions.push(
              Cesium.Cartesian3.fromDegrees(orbitLon, orbitLat, sat.altitude * 1000)
            );
          }

          viewer.entities.add({
            polyline: {
              positions: positions,
              width: 1,
              material: new Cesium.PolylineDashMaterialProperty({
                color: color.withAlpha(0.3),
                dashLength: 16.0,
              }),
            },
          });
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
  }, [filteredSatellites]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.3 }}
      className="relative rounded-xl overflow-hidden"
      style={{
        border: '1px solid rgba(0, 174, 239, 0.2)',
        boxShadow: '0 0 40px rgba(0, 174, 239, 0.1), inset 0 0 40px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Globe container */}
      <div ref={containerRef} className="w-full h-[500px]" />

      {/* Overlay gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, transparent 40%, rgba(5,8,22,0.6) 100%)',
        }}
      />

      {/* Corner decorations */}
      <div className="absolute top-3 left-3 pointer-events-none">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: '#00FF99', boxShadow: '0 0 6px #00FF99' }} />
          <span className="text-[10px] font-space tracking-widest" style={{ color: '#94A3B8' }}>
            LIVE TRACKING
          </span>
        </div>
      </div>

      <div className="absolute top-3 right-3 pointer-events-none">
        <span className="text-[10px] font-orbitron" style={{ color: '#00AEEF' }}>
          {filteredSatellites.length} OBJECTS
        </span>
      </div>
    </motion.div>
  );
}

function getColor(Cesium: any, type: string) {
  switch (type) {
    case 'Communication': return Cesium.Color.fromCssColorString('#00AEEF');
    case 'Weather': return Cesium.Color.fromCssColorString('#FFC107');
    case 'Military': return Cesium.Color.fromCssColorString('#FF4D4D');
    case 'GPS': return Cesium.Color.fromCssColorString('#00FF99');
    case 'ISS': return Cesium.Color.fromCssColorString('#FFFFFF');
    case 'Scientific': return Cesium.Color.fromCssColorString('#9B59B6');
    case 'Debris': return Cesium.Color.fromCssColorString('#FF4D4D').withAlpha(0.6);
    default: return Cesium.Color.fromCssColorString('#94A3B8');
  }
}
