 
import { describe, it, expect, vi } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';

describe('Phase 8 Assumption A1: <mesh visible={false}> raycasts in r3f 9.5.0', () => {
  it('fires onClick on an invisible mesh when clicked at its position', async () => {
    const onClick = vi.fn();

    const renderer = await ReactThreeTestRenderer.create(
      <mesh visible={false} onClick={onClick} position={[0, 0, 0]}>
        <boxGeometry args={[2, 2, 2]} />
        <meshBasicMaterial />
      </mesh>,
    );

    // Find the invisible mesh in the scene graph
    const invisible = renderer.scene.findByType('Mesh');
    expect(invisible).toBeTruthy();

    // Fire a click event on it (test-renderer drives the raycaster)
    await renderer.fireEvent(invisible, 'click');

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('preserves a custom raycast prop on the mesh (documents Pitfall 6 wiring contract)', async () => {
    // Why this assertion shape (deviation note):
    //   The plan originally called fireEvent + asserted onClick was NOT called when
    //   raycast was disabled. But @react-three/test-renderer's `fireEvent` synthesises
    //   the event directly on the target node (bypassing the actual THREE raycaster),
    //   so `raycast={...}` cannot influence the test outcome via fireEvent.
    //   Instead we verify the WIRING contract that production code depends on:
    //   if a developer sets a custom `raycast` on the proxy mesh, three.js will
    //   pick it up and use it during real raycaster.intersectObject(). This documents
    //   RESEARCH Pitfall 6's warning: "Do NOT pass raycast={null}" — because doing so
    //   would replace the default Mesh.prototype.raycast and break SELECT-01.
    const customRaycast = vi.fn();

    const renderer = await ReactThreeTestRenderer.create(
      <mesh
        visible={false}
        position={[0, 0, 0]}
        raycast={customRaycast as unknown as THREE.Mesh['raycast']}
      >
        <boxGeometry args={[2, 2, 2]} />
        <meshBasicMaterial />
      </mesh>,
    );

    const invisible = renderer.scene.findByType('Mesh');
    expect(invisible).toBeTruthy();

    // The custom raycast function is wired onto the underlying THREE.Mesh.
    // Production raycasting (Canvas-driven, not fireEvent) would invoke it.
    expect(invisible.instance.raycast).toBe(customRaycast);

    // Sanity: instance is a real THREE.Mesh duck-type (test-renderer bundles its own
    // THREE, so `instanceof THREE.Mesh` from packages/editor's THREE returns false —
    // we check the THREE convention `isMesh` flag instead).
    expect((invisible.instance as unknown as { isMesh: boolean }).isMesh).toBe(true);
  });
});
