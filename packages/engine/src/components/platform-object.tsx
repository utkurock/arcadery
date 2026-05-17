/* eslint-disable react/no-unknown-property */
'use client';

import * as THREE from 'three';

interface PlatformObjectProps {
  position?: [number, number, number];
  size?: [number, number, number];
  color?: string;
  receiveShadow?: boolean;
  isGround?: boolean;
}

export function PlatformObject({
  position = [0, 0, 0],
  size = [4, 0.5, 1],
  color = '#4a4a5a',
  receiveShadow = true,
  isGround = false,
}: PlatformObjectProps) {
  return (
    <mesh position={position} receiveShadow={receiveShadow} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={isGround ? 0.9 : 0.7}
        metalness={isGround ? 0 : 0.1}
      />
    </mesh>
  );
}
