'use client';

import { useEditorStore } from '../stores/editor-store';

/**
 * Phase 8 SELECT-03 — Top-center selection-count HUD.
 *
 * Mounts only when selectedIds.length >= 2 (UI-SPEC line 287) AND in edit mode.
 * Mirrors the existing paint-mode HUD position/style in editor-viewport.tsx
 * (lines 58-69), differing only in copy and pointer-events.
 *
 * Visual specs locked by UI-SPEC line 261-273:
 *   - top: 16px, left: 50%, translateX(-50%)
 *   - bg: #8b7ec8/90 + backdrop-blur
 *   - text: white text-xs (12px) font-semibold (600)
 *   - padding: px-4 py-2
 *   - radius: rounded-lg (8px)
 *   - shadow: shadow-lg
 *   - z-index: 30 (above marquee z-20, below toolbars z-40+)
 *   - pointer-events: none (informational only)
 *   - role="status" aria-live="polite"
 */
export function SelectionHud() {
  const count = useEditorStore((s) => s.selectedIds.length);
  const isEditMode = useEditorStore((s) => s.mode === 'edit');

  if (count < 2 || !isEditMode) return null;

  return (
    <div
      className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg bg-[#8b7ec8]/90 backdrop-blur text-white text-xs font-semibold flex items-center gap-2 shadow-lg pointer-events-none select-none"
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true">●</span>
      <span>{count} selected</span>
    </div>
  );
}
