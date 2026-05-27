 
'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { useLoader, useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { useEditorStore } from '../../stores/editor-store';

// Transform applied by outer <Selectable>. The sprite mesh renders at local
// origin. Billboard is now a pure rotation modifier — no position prop — so
// the Selectable group's position controls placement and a single source of
// truth feeds both the gizmo and click-drag math.
//
// Sprites use a shared THREE.Cache (enabled at editor mount in
// stores/editor-store.ts so the same URL never decodes twice across multiple
// instances).

function StaticSprite({
  src,
  width,
  height,
  tint,
  isSelected,
  isHovered,
}: {
  src: string;
  width: number;
  height: number;
  tint?: string;
  isSelected?: boolean;
  isHovered?: boolean;
}) {
  const texture = useLoader(THREE.TextureLoader, src);
  return (
    <SpritePlane
      texture={texture}
      width={width}
      height={height}
      tint={tint}
      isSelected={isSelected}
      isHovered={isHovered}
    />
  );
}

function AnimatedSprite({
  frameUrls,
  frameRate,
  loopMode,
  width,
  height,
  tint,
  isSelected,
  isHovered,
}: {
  frameUrls: string[];
  frameRate: number;
  loopMode: 'loop' | 'pingpong' | 'once';
  width: number;
  height: number;
  tint?: string;
  isSelected?: boolean;
  isHovered?: boolean;
}) {
  const textures = useLoader(THREE.TextureLoader, frameUrls) as THREE.Texture[];
  const [frameIndex, setFrameIndex] = useState(0);
  const elapsedRef = useRef(0);
  const directionRef = useRef<1 | -1>(1);
  const finishedRef = useRef(false);

  const interval = 1 / Math.max(1, frameRate);
  const lastFrame = textures.length - 1;

  useFrame((_, delta) => {
    if (finishedRef.current) return;
    elapsedRef.current += delta;
    if (elapsedRef.current < interval) return;
    elapsedRef.current = 0;

    setFrameIndex((prev) => {
      let next = prev + directionRef.current;
      if (loopMode === 'loop') {
        if (next > lastFrame) next = 0;
        if (next < 0) next = lastFrame;
        return next;
      }
      if (loopMode === 'pingpong') {
        if (next > lastFrame) {
          directionRef.current = -1;
          return lastFrame - 1 < 0 ? 0 : lastFrame - 1;
        }
        if (next < 0) {
          directionRef.current = 1;
          return 1 > lastFrame ? lastFrame : 1;
        }
        return next;
      }
      // once
      if (next > lastFrame) {
        finishedRef.current = true;
        return lastFrame;
      }
      return next;
    });
  });

  const texture = textures[Math.max(0, Math.min(lastFrame, frameIndex))];

  return (
    <SpritePlane
      texture={texture}
      width={width}
      height={height}
      tint={tint}
      isSelected={isSelected}
      isHovered={isHovered}
    />
  );
}

function SpritePlane({
  texture,
  width,
  height,
  tint,
  isSelected,
  isHovered,
}: {
  texture: THREE.Texture | null;
  width: number;
  height: number;
  tint?: string;
  isSelected?: boolean;
  isHovered?: boolean;
}) {
  // Apply sRGB + nearest filtering on the shared texture. Because
  // useLoader+THREE.Cache returns the same Texture instance for repeat URLs,
  // assigning these properties here is idempotent across all sprite usages.
  const _material = useMemo(() => {
    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
    }
    return null;
  }, [texture]);
  void _material;

  const showRing = isSelected || isHovered;

  return (
    <>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          map={texture ?? undefined}
          color={tint ?? '#ffffff'}
          transparent
          side={THREE.DoubleSide}
          alphaTest={0.01}
        />
      </mesh>
      {showRing && (
        <mesh>
          <planeGeometry args={[width + 0.1, height + 0.1]} />
          <meshBasicMaterial
            color={isSelected ? '#4f9eff' : 'rgba(255, 255, 255, 0.6)'}
            wireframe
          />
        </mesh>
      )}
    </>
  );
}

function SpriteInner({
  id,
  isSelected,
  isHovered,
}: {
  id: string;
  isSelected?: boolean;
  isHovered?: boolean;
}) {
  const element = useEditorStore((s) => s.scene.elements[id]);
  if (!element || element.type !== 'sprite') return null;
  if (!element.visible) return null;

  const { width, height, src, tint, frameUrls, frameRate, loopMode, clips, currentClip } =
    element;

  // Clip-aware playback (top-level fields are the legacy fallback).
  const activeClip = clips?.find((c) => c.name === currentClip) ?? null;
  const playFrameUrls = activeClip?.frameUrls ?? frameUrls;
  const playFrameRate = activeClip?.frameRate ?? frameRate ?? 8;
  const playLoopMode = activeClip?.loopMode ?? loopMode ?? 'loop';

  const isAnimated =
    Array.isArray(playFrameUrls) && playFrameUrls.length >= 2;

  // Billboard at local origin — Selectable handles position. Children still
  // face the camera, which is the canonical sprite behavior.
  return (
    <Billboard>
      {isAnimated ? (
        <AnimatedSprite
          key={activeClip?.name ?? 'top-level'}
          frameUrls={playFrameUrls!}
          frameRate={playFrameRate}
          loopMode={playLoopMode}
          width={width}
          height={height}
          tint={tint}
          isSelected={isSelected}
          isHovered={isHovered}
        />
      ) : src ? (
        <StaticSprite
          src={src}
          width={width}
          height={height}
          tint={tint}
          isSelected={isSelected}
          isHovered={isHovered}
        />
      ) : (
        <SpritePlane
          texture={null}
          width={width}
          height={height}
          tint={tint ?? '#888888'}
          isSelected={isSelected}
          isHovered={isHovered}
        />
      )}
    </Billboard>
  );
}

export function SpriteElement({
  id,
  isSelected,
  isHovered,
}: {
  id: string;
  isSelected?: boolean;
  isHovered?: boolean;
}) {
  return (
    <Suspense fallback={null}>
      <SpriteInner id={id} isSelected={isSelected} isHovered={isHovered} />
    </Suspense>
  );
}
