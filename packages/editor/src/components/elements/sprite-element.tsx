/* eslint-disable react/no-unknown-property */
'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { useLoader, useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { useEditorStore } from '../../stores/editor-store';

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
  const material = useMemo(() => {
    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
    }
    return null;
  }, [texture]);
  void material;

  // Phase 8: ring color swap — selection wins, hover renders only when not selected.
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

  const {
    transform,
    width,
    height,
    src,
    tint,
    frameUrls,
    frameRate,
    loopMode,
    clips,
    currentClip,
  } = element;

  // Clip-aware playback: when an active clip is named AND its definition
  // exists on this sprite, prefer its frames/fps/loop over the top-level
  // legacy fields. Falls back to the top-level fields when no clip is
  // selected — preserves backwards compatibility with single-animation
  // sprites that pre-date the clips[] system.
  const activeClip = clips?.find((c) => c.name === currentClip) ?? null;
  const playFrameUrls = activeClip?.frameUrls ?? frameUrls;
  const playFrameRate = activeClip?.frameRate ?? frameRate ?? 8;
  const playLoopMode = activeClip?.loopMode ?? loopMode ?? 'loop';

  const isAnimated =
    Array.isArray(playFrameUrls) && playFrameUrls.length >= 2;

  return (
    <Billboard
      position={[transform.position.x, transform.position.y, transform.position.z]}
    >
      <group
        rotation={[transform.rotation.x, transform.rotation.y, transform.rotation.z]}
        scale={[transform.scale.x, transform.scale.y, transform.scale.z]}
      >
        {isAnimated ? (
          <AnimatedSprite
            // Keying on the active clip name forces a clean remount of
            // <AnimatedSprite> whenever the user switches clips. Without this
            // the internal frame index / timer would carry over between
            // clips and you'd see a half-second of mismatched frames before
            // it converges.
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
      </group>
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
  // Note: <Selectable> wrap is applied by scene-renderer.tsx via ELEMENT_REGISTRY routing — DO NOT import Selectable here.
  return (
    <Suspense fallback={null}>
      <SpriteInner id={id} isSelected={isSelected} isHovered={isHovered} />
    </Suspense>
  );
}
