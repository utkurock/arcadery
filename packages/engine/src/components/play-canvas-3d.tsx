/* eslint-disable react/no-unknown-property */
'use client';

/**
 * PlayCanvas3D — the playable 3D counterpart of PhaserCanvas.
 *
 * Renders a "three" scene's elements as meshes, runs BehaviorRuntime3D, and
 * each frame: ticks the sim, writes runtime positions onto the meshes, and
 * follows the player with a fixed-offset chase camera. Meaningful state
 * changes (score/health/status/paused) are pushed up via onGameStateChange so
 * the existing play HUD / win-lose overlays work unchanged.
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Environment } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GameScene, SceneElement } from '@arcadery/shared';
import { BehaviorRuntime3D, type RuntimeState3D } from '../runtime/behavior-runtime-3d';
import { SpriteObject } from './sprite-object';
import { ModelObject } from './model-object';

interface PlayCanvas3DProps {
  scene: GameScene;
  backgroundColor?: string;
  onGameStateChange?: (s: RuntimeState3D) => void;
}

function vec3(p?: { x: number; y: number; z: number }): [number, number, number] {
  return [p?.x ?? 0, p?.y ?? 0, p?.z ?? 0];
}

/** Render the visual geometry for one element (transform handled by the parent group). */
function ElementMesh({ el }: { el: SceneElement }) {
  const color = (el as { material?: { color?: string } }).material?.color ?? '#9aa0b5';
  const opacity = (el as { material?: { opacity?: number } }).material?.opacity ?? 1;
  const transparent = opacity < 1;

  switch (el.type) {
    case 'box': {
      const s = el.size ?? { x: 1, y: 1, z: 1 };
      return (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[s.x, s.y, s.z]} />
          <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
        </mesh>
      );
    }
    case 'sphere':
      return (
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[el.radius ?? 0.5, 32, 24]} />
          <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
        </mesh>
      );
    case 'plane':
      return (
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[el.width ?? 10, el.height ?? 10]} />
          <meshStandardMaterial
            color={color}
            transparent={transparent}
            opacity={opacity}
            side={THREE.DoubleSide}
          />
        </mesh>
      );
    case 'sprite':
      return el.src ? (
        <SpriteObject src={el.src} billboard opacity={opacity} scale={[el.width ?? 1, el.height ?? 1, 1]} />
      ) : (
        <mesh>
          <boxGeometry args={[el.width ?? 1, el.height ?? 1, 0.2]} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
    case 'model':
      return el.src ? <ModelObject src={el.src} /> : null;
    default:
      return null;
  }
}

function PlayScene({
  scene,
  onGameStateChange,
}: {
  scene: GameScene;
  onGameStateChange?: (s: RuntimeState3D) => void;
}) {
  const camera = useThree((s) => s.camera);
  const groupRefs = useRef<Map<string, THREE.Group>>(new Map());
  const cameraReady = useRef(false);

  const runtime = useMemo(() => new BehaviorRuntime3D(scene), [scene]);

  // Physics-relevant elements (lights/text are rendered separately / skipped).
  const renderable = useMemo(
    () =>
      Object.entries(scene.elements).filter(
        ([, el]) => el.type !== 'light' && el.type !== 'text' && el.visible !== false,
      ),
    [scene.elements],
  );

  useEffect(() => {
    runtime.start();

    // Esc toggles pause.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') runtime.togglePause();
    };
    window.addEventListener('keydown', onKey);

    // Throttle React updates: only propagate when the HUD-visible fields move.
    let last = { status: '', score: NaN, health: NaN, paused: false };
    const unsub = runtime.onStateChange((s) => {
      if (
        s.status !== last.status ||
        s.score !== last.score ||
        s.health !== last.health ||
        s.paused !== last.paused
      ) {
        last = { status: s.status, score: s.score, health: s.health, paused: s.paused };
        onGameStateChange?.(s);
      }
    });
    // Emit initial state so the HUD shows starting score/health immediately.
    onGameStateChange?.(runtime.getState());

    return () => {
      window.removeEventListener('keydown', onKey);
      unsub();
      runtime.stop();
    };
  }, [runtime, onGameStateChange]);

  useFrame((_state, delta) => {
    runtime.tick(delta);
    const rs = runtime.getState();

    for (const [id, pos] of Object.entries(rs.positions)) {
      const g = groupRefs.current.get(id);
      if (!g) continue;
      g.position.set(pos.x, pos.y, pos.z);
      g.visible = pos.alive;
    }

    // Fixed-offset chase camera behind + above the player.
    const cam = runtime.getCameraConfig();
    if (cam) {
      const p = rs.positions[cam.followId];
      if (p) {
        const desired = new THREE.Vector3(p.x, p.y + cam.height, p.z + cam.distance);
        if (!cameraReady.current) {
          camera.position.copy(desired);
          cameraReady.current = true;
        } else {
          camera.position.lerp(desired, 0.12);
        }
        camera.lookAt(p.x, p.y + 1, p.z);
      }
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 8, 14]} fov={60} near={0.1} far={2000} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[12, 18, 8]} intensity={1.1} castShadow shadow-mapSize={[2048, 2048]} />

      {renderable.map(([id, el]) => (
        <group
          key={id}
          ref={(g) => {
            if (g) groupRefs.current.set(id, g);
            else groupRefs.current.delete(id);
          }}
          position={vec3(el.transform.position)}
          rotation={vec3(el.transform.rotation)}
          scale={vec3(el.transform.scale)}
        >
          <ElementMesh el={el} />
        </group>
      ))}

      <Environment preset="city" />
    </>
  );
}

export function PlayCanvas3D({ scene, backgroundColor = '#0b0c14', onGameStateChange }: PlayCanvas3DProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      style={{ background: backgroundColor, width: '100%', height: '100%' }}
    >
      <Suspense fallback={null}>
        <PlayScene scene={scene} onGameStateChange={onGameStateChange} />
      </Suspense>
    </Canvas>
  );
}
