import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useEditorStore } from '../../stores/editor-store';
import { MarqueeDom } from '../marquee-dom';
import { createEmptyScene, createBoxElement } from '@arcadery/shared';

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

describe('Phase 8 SELECT-03 (B5 fix) — MarqueeDom renders without R3F context', () => {
  it('renders without throwing (no useThree dependency)', () => {
    expect(() => render(<MarqueeDom />)).not.toThrow();
  });

  it('empty-scene guard: pointerdown is a no-op when 0 elements exist', () => {
    const { container } = render(<MarqueeDom />);
    const overlay = container.firstChild as HTMLElement;
    fireEvent.pointerDown(overlay, { pointerId: 1, clientX: 10, clientY: 10 });
    expect(useEditorStore.getState().marqueeRect).toBeNull();
  });

  it('drag <6px below threshold: pointerup triggers clearSelection (empty-canvas deselect)', () => {
    const a = createBoxElement();
    useEditorStore.getState().addElement(a);
    useEditorStore.getState().setSelectedIds([a.id]);

    const { container } = render(<MarqueeDom />);
    const overlay = container.firstChild as HTMLElement;
    fireEvent.pointerDown(overlay, { pointerId: 1, clientX: 100, clientY: 100 });
    // Move only 2px — under threshold.
    fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 102, clientY: 100 });
    fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 102, clientY: 100 });

    expect(useEditorStore.getState().selectedIds).toEqual([]);
  });
});
