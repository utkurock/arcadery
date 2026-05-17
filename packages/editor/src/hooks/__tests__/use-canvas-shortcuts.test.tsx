import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEditorStore } from '../../stores/editor-store';
import { useSelectionKeyboard } from '../use-selection-keyboard';
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

afterEach(() => {
  // Clean up any focused elements from the test
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) {
    active.blur();
    active.remove();
  }
});

function fireKey(opts: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}) {
  const ev = new KeyboardEvent('keydown', {
    key: opts.key,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(ev);
}

function focusInput(): HTMLInputElement {
  const input = document.createElement('input');
  document.body.appendChild(input);
  input.focus();
  return input;
}

function focusTextarea(): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  document.body.appendChild(ta);
  ta.focus();
  return ta;
}

function focusContentEditable(): HTMLDivElement {
  const div = document.createElement('div');
  div.contentEditable = 'true';
  div.tabIndex = 0;
  document.body.appendChild(div);
  div.focus();
  return div;
}

describe('Phase 8 — SELECT-03 / SELECT-05 focus guard', () => {
  it('focus guard: Esc does NOT clear selection when an input is focused', () => {
    renderHook(() => useSelectionKeyboard());
    const a = createBoxElement();
    useEditorStore.getState().addElement(a);
    useEditorStore.getState().setSelectedIds([a.id]);
    focusInput();

    fireKey({ key: 'Escape' });

    // Selection NOT cleared because input has focus.
    expect(useEditorStore.getState().selectedIds).toEqual([a.id]);
  });

  it('focus guard: Cmd+A does NOT select-all when a textarea is focused', () => {
    renderHook(() => useSelectionKeyboard());
    const a = createBoxElement();
    useEditorStore.getState().addElement(a);
    focusTextarea();

    fireKey({ key: 'a', metaKey: true });

    // selectedIds NOT populated.
    expect(useEditorStore.getState().selectedIds).toEqual([]);
  });

  it('focus guard: Arrow keys do NOT nudge when a contentEditable is focused', () => {
    renderHook(() => useSelectionKeyboard());
    const a = createBoxElement();
    useEditorStore.getState().addElement(a);
    useEditorStore.getState().setSelectedIds([a.id]);
    const initialY = useEditorStore.getState().scene.elements[a.id].transform.position.y;
    focusContentEditable();

    fireKey({ key: 'ArrowUp' });

    // Position UNCHANGED.
    const finalY = useEditorStore.getState().scene.elements[a.id].transform.position.y;
    expect(finalY).toBe(initialY);
  });

  it('Esc clears selection when canvas (not a form) has focus', () => {
    renderHook(() => useSelectionKeyboard());
    const a = createBoxElement();
    useEditorStore.getState().addElement(a);
    useEditorStore.getState().setSelectedIds([a.id]);
    // No focus on input — body has focus

    fireKey({ key: 'Escape' });

    expect(useEditorStore.getState().selectedIds).toEqual([]);
  });

  it('Cmd+A selects all visible elements when canvas has focus', () => {
    renderHook(() => useSelectionKeyboard());
    const a = createBoxElement({ name: 'A' });
    const b = createBoxElement({ name: 'B' });
    useEditorStore.getState().addElement(a);
    useEditorStore.getState().addElement(b);

    fireKey({ key: 'a', metaKey: true });

    expect(useEditorStore.getState().selectedIds.length).toBe(2);
    expect(useEditorStore.getState().selectedIds).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it('Arrow nudges selection by 1 unit; Shift+Arrow by 10 units', () => {
    renderHook(() => useSelectionKeyboard());
    const a = createBoxElement();
    useEditorStore.getState().addElement(a);
    useEditorStore.getState().setSelectedIds([a.id]);
    const startY = useEditorStore.getState().scene.elements[a.id].transform.position.y;

    fireKey({ key: 'ArrowUp' });
    const afterArrow = useEditorStore.getState().scene.elements[a.id].transform.position.y;
    expect(afterArrow - startY).toBe(1);

    fireKey({ key: 'ArrowUp', shiftKey: true });
    const afterShiftArrow = useEditorStore.getState().scene.elements[a.id].transform.position.y;
    expect(afterShiftArrow - afterArrow).toBe(10);
  });
});
