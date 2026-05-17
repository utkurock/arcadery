'use client';

import { useEffect } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { isFormElementFocused } from './utils';

/**
 * Phase 8 SELECT-03 / SELECT-05 — selection-aware keyboard shortcuts.
 *
 * Owns:
 *   - Esc-in-edit-mode → clearSelection
 *   - Cmd+A / Ctrl+A   → setSelectedIds(allVisibleIds)
 *   - Arrow keys       → nudgeSelection(±1)
 *   - Shift+Arrow      → nudgeSelection(±10)
 *
 * Does NOT own (left to use-keyboard-shortcuts.ts):
 *   - W/E/R (transform mode)
 *   - Delete/Backspace (multi-aware iteration on selectedIds)
 *   - Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (undo/redo)
 *   - Esc-in-play-mode (mode toggle)
 *
 * Focus guard: bails when document.activeElement is an input/textarea/select/
 * contentEditable so native browser shortcuts (Cmd+A in chat textarea, Esc to
 * cancel inline text edit) are never stolen. Helper imported from utils.ts
 * (Wave 0); use-keyboard-shortcuts.ts also adopts the same helper as of Plan 04.
 *
 * Stale-closure rule (Phase 2 02-01 locked): handler reads via
 * useEditorStore.getState(), NOT via selector subscription, so rapidly-pressed
 * arrows always see the freshest selectedIds.
 */
export function useSelectionKeyboard() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Focus guard — never steal from form inputs / chat / property panel.
      if (isFormElementFocused(document.activeElement)) return;

      const state = useEditorStore.getState();
      if (state.mode !== 'edit') return;

      // Esc — clear selection
      if (e.key === 'Escape') {
        e.preventDefault();
        state.clearSelection();
        return;
      }

      // Cmd+A / Ctrl+A — select all visible elements
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const allVisibleIds = Object.keys(state.scene.elements).filter(
          (id) => state.scene.elements[id]?.visible !== false,
        );
        state.setSelectedIds(allVisibleIds);
        return;
      }

      // Arrow nudge
      const step = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          state.nudgeSelection(0, step);
          return;
        case 'ArrowDown':
          e.preventDefault();
          state.nudgeSelection(0, -step);
          return;
        case 'ArrowLeft':
          e.preventDefault();
          state.nudgeSelection(-step, 0);
          return;
        case 'ArrowRight':
          e.preventDefault();
          state.nudgeSelection(step, 0);
          return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
