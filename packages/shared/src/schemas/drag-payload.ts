import { z } from 'zod';

/**
 * Drag payload schema for Arcadery's Zustand-mediated cross-tree drag protocol
 * (DRAG-03). Phase 7 defines and exports the contract; Phase 9 wires the
 * runtime. Validated at the cross-tree boundary so the chat panel and the
 * editor canvas can't accidentally consume each other's malformed payloads.
 *
 * Discriminator: `kind` (chosen over `type` to avoid colliding with
 * `SceneElement['type']` in autocomplete) — see Decision A3 in 07-RESEARCH.md.
 *
 * URL fields are intentionally permissive (`z.string()`, NOT `z.string().url()`)
 * — AI-generated images often arrive as `blob:` or `data:` URLs and we don't
 * want to re-reject them at drag time. Upstream upload paths validate URLs.
 * See Pitfall 5 / Decision A5 in 07-RESEARCH.md.
 */

export const AssetDragPayloadSchema = z.object({
  kind: z.literal('asset'),
  assetId: z.string(),
  url: z.string(),
  name: z.string(),
  // Optional animation metadata (mirrors AssetData.frameMetadata shape).
  frameUrls: z.array(z.string()).optional(),
  frameRate: z.number().optional(),
  aspectRatio: z.number().optional(),
});

export const ElementDragPayloadSchema = z.object({
  kind: z.literal('element'),
  elementId: z.string(),
  // Brief summary so the chat chip can render without re-fetching.
  elementType: z.string(),
  elementName: z.string(),
  thumbnailUrl: z.string().optional(),
});

export const DragPayloadSchema = z.discriminatedUnion('kind', [
  AssetDragPayloadSchema,
  ElementDragPayloadSchema,
]);

export type AssetDragPayload = z.infer<typeof AssetDragPayloadSchema>;
export type ElementDragPayload = z.infer<typeof ElementDragPayloadSchema>;
export type DragPayload = z.infer<typeof DragPayloadSchema>;
