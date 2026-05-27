 
'use client';

import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Clone } from '@react-three/drei';
import * as THREE from 'three';

interface ModelObjectProps {
  src: string;
  position?: [number, number, number];
  scale?: [number, number, number];
  rotation?: [number, number, number];
  castShadow?: boolean;
  receiveShadow?: boolean;
  animation?: string;
  animationSpeed?: number;
  animationLoop?: boolean;
  autoRotate?: boolean;
  onClick?: () => void;
  onLoaded?: () => void;
}

export function ModelObject({
  src,
  position = [0, 0, 0],
  scale = [1, 1, 1],
  rotation = [0, 0, 0],
  castShadow = true,
  receiveShadow = true,
  animation,
  animationSpeed = 1,
  animationLoop = true,
  autoRotate = false,
  onClick,
  onLoaded,
}: ModelObjectProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(src);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  useEffect(() => {
    if (animations.length === 0 || !animation) {
      // Stop any active mixer if user picked rest pose
      mixerRef.current?.stopAllAction();
      return;
    }

    const mixer = new THREE.AnimationMixer(scene);
    mixerRef.current = mixer;

    const clip = animations.find((a) => a.name === animation);
    if (clip) {
      const action = mixer.clipAction(clip);
      action.timeScale = animationSpeed;
      action.setLoop(
        animationLoop ? THREE.LoopRepeat : THREE.LoopOnce,
        animationLoop ? Infinity : 1,
      );
      action.clampWhenFinished = !animationLoop;
      action.play();
    }

    return () => {
      mixer.stopAllAction();
    };
  }, [scene, animations, animation, animationSpeed, animationLoop]);

  useEffect(() => {
    onLoaded?.();
  }, [onLoaded]);

  useFrame((_, delta) => {
    mixerRef.current?.update(delta);

    if (autoRotate && groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5;
    }
  });

  // Apply shadows recursively
  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = castShadow;
        child.receiveShadow = receiveShadow;
      }
    });
  }, [scene, castShadow, receiveShadow]);

  return (
    <group ref={groupRef} position={position} scale={scale} rotation={rotation} onClick={onClick}>
      <Clone object={scene} />
    </group>
  );
}

// Preload helper
export function preloadModel(src: string) {
  useGLTF.preload(src);
}
