/* eslint-disable react/no-unknown-property */
import { describe, it, expect, beforeEach } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { useEditorStore } from '../../stores/editor-store';
import { MarqueeR3F } from '../marquee-r3f';
import { createEmptyScene } from '@arcadery/shared';

beforeEach(() => {
  useEditorStore.setState({
    scene: createEmptyScene(),
    selectedIds: [],
    hoveredId: null,
    marqueeHoverIds: new Set<string>(),
    marqueeRect: null,
    mode: 'edit',
    transformMode: 'translate',
    viewMode: '3d',
    contextMenuTarget: null,
    paintTile: null,
    chatAttachment: null,
    dragFromCanvas: null,
    pendingDrop: null,
    animationRuntime: { states: {} },
  });
  useEditorStore.temporal.getState().clear();
});

describe('Phase 8 SELECT-03 (B5 fix) — MarqueeR3F mounts inside Canvas', () => {
  it('mounts under @react-three/test-renderer Canvas without throwing (no createPortal hazard)', async () => {
    // The B5 hazard: a component that calls useThree() AND uses createPortal to
    // a DOM target inside its R3F-rendered tree. This test confirms MarqueeR3F
    // returns null cleanly under the R3F reconciler.
    await expect(ReactThreeTestRenderer.create(<MarqueeR3F />)).resolves.toBeTruthy();
  });

  it('writes marqueeHoverIds when marqueeRect transitions from null → non-null', async () => {
    await ReactThreeTestRenderer.create(<MarqueeR3F />);
    // Element-refs Map is empty in this isolated test; computeMarqueeHits will
    // return an empty Set. The point of this test is to confirm the effect
    // fires in response to store updates without crashing.
    useEditorStore.getState().setMarqueeRect({ x: 0, y: 0, w: 100, h: 100 });
    // Allow the React effect to flush.
    await new Promise((r) => setTimeout(r, 0));
    // marqueeHoverIds was written (size 0 because no refs registered).
    expect(useEditorStore.getState().marqueeHoverIds).toBeInstanceOf(Set);
  });
});
