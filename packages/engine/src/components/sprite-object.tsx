 
'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';

interface SpriteObjectProps {
  src: string;
  position?: [number, number, number];
  scale?: [number, number, number];
  rotation?: [number, number, number];
  opacity?: number;
  tint?: string;
  billboard?: boolean;
  animated?: boolean;
  frames?: number;
  frameRate?: number;
  onClick?: () => void;
  onPointerOver?: () => void;
  onPointerOut?: () => void;
}

const WHITE = new THREE.Color(0xffffff);

export function SpriteObject({
  src,
  position = [0, 0, 0],
  scale = [1, 1, 1],
  rotation = [0, 0, 0],
  opacity = 1,
  tint,
  billboard = false,
  animated = false,
  frames = 1,
  frameRate = 12,
  onClick,
  onPointerOver,
  onPointerOut,
}: SpriteObjectProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const frameRef = useRef(0);
  const timeRef = useRef(0);

  const texture = useLoader(THREE.TextureLoader, src);

  useEffect(() => {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    if (animated && frames > 1) {
      texture.repeat.set(1 / frames, 1);
    } else {
      texture.repeat.set(1, 1);
      texture.offset.set(0, 0);
    }
    texture.needsUpdate = true;
  }, [texture, animated, frames]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Billboard — copy camera rotation (no allocations)
    if (billboard) {
      meshRef.current.quaternion.copy(state.camera.quaternion);
    }

    // Sprite animation
    if (animated && frames > 1) {
      timeRef.current += delta;
      const interval = 1 / frameRate;
      if (timeRef.current >= interval) {
        timeRef.current = 0;
        frameRef.current = (frameRef.current + 1) % frames;
        texture.offset.x = frameRef.current / frames;
      }
    }
  });

  const color = useMemo(() => (tint ? new THREE.Color(tint) : WHITE), [tint]);

  return (
    <mesh
      ref={meshRef}
      position={position}
      scale={scale}
      rotation={rotation}
      onClick={onClick}
      onPointerOver={(e) => { e.stopPropagation(); onPointerOver?.(); }}
      onPointerOut={() => { onPointerOut?.(); }}
    >
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        map={texture}
        transparent
        opacity={opacity}
        color={color}
        alphaTest={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
