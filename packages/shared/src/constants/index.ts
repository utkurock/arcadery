/**
 * MIME types for cross-tree drag-and-drop payloads (SHARED-03).
 * Used by Phase 9 drag protocol — library->canvas (ASSET) and
 * canvas->chat (ELEMENT). Frozen via `as const` so callers can't
 * accidentally use raw strings (TypeScript narrows to the literal types).
 */
export const DRAG_MIME = {
  ASSET: 'application/arcadery-asset',
  ELEMENT: 'application/arcadery-element',
} as const;

export type DragMime = (typeof DRAG_MIME)[keyof typeof DRAG_MIME];
