 
'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import { Suspense } from 'react';
import * as THREE from 'three';

interface GameCanvasProps {
  children: React.ReactNode;
  cameraType?: '2d' | '3d';
  backgroundColor?: string;
  showGrid?: boolean;
  showHelpers?: boolean;
  onCreated?: (state: any) => void;
}

export function GameCanvas({
  children,
  cameraType = '2d',
  backgroundColor = '#17181e',
  showGrid = true,
  showHelpers = false,
  onCreated,
}: GameCanvasProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      style={{ background: backgroundColor }}
      onCreated={onCreated}
    >
      <Suspense fallback={null}>
        {cameraType === '3d' ? (
          <>
            <PerspectiveCamera makeDefault position={[0, 5, 10]} fov={60} />
            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.05}
              minDistance={2}
              maxDistance={50}
              maxPolarAngle={Math.PI / 2.1}
            />
          </>
        ) : (
          <OrthographicCamera
            makeDefault
            position={[0, 0, 100]}
            zoom={50}
            near={0.1}
            far={1000}
          />
        )}

        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />

        {showGrid && (
          <Grid
            args={[100, 100]}
            position={[0, -0.01, 0]}
            cellSize={1}
            cellThickness={0.5}
            cellColor="#333544"
            sectionSize={5}
            sectionThickness={1}
            sectionColor="#444666"
            fadeDistance={50}
            infiniteGrid
          />
        )}

        {cameraType === '3d' && <Environment preset="city" />}

        {children}
      </Suspense>
    </Canvas>
  );
}
