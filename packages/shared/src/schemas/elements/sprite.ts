import { z } from 'zod';
import { BaseElementSchema } from '../base-element';
import { SpriteAnimationClipSchema } from '../animation-clip';

export const SpriteElementSchema = BaseElementSchema.extend({
  type: z.literal('sprite'),
  width: z.number().min(0.1).max(100).describe('Display width in game units (e.g. 1.5)'),
  height: z.number().min(0.1).max(100).describe('Display height in game units (e.g. 1.5)'),

  // Reference back to the asset row that produced this sprite. Optional — set when
  // the sprite was created from a managed asset, so right-click → AI modify works.
  assetId: z.string().uuid().optional(),

  // Direct image source — preferred for AI-generated assets.
  src: z.string().optional().describe('Image URL for a single static texture'),

  // Multi-frame animation. When set, takes precedence over src.
  frameUrls: z
    .array(z.string())
    .min(2)
    .max(64)
    .optional()
    .describe('Per-frame image URLs played in order at frameRate fps'),
  frameRate: z
    .number()
    .min(1)
    .max(60)
    .optional()
    .describe('Frames per second for animation playback (default 8)'),
  loopMode: z
    .enum(['loop', 'pingpong', 'once'])
    .optional()
    .describe('How the animation cycles'),

  // Legacy preset asset-pack reference (still supported for built-in packs).
  assetPack: z.string().optional(),
  assetCategory: z.string().optional(),
  assetIndex: z.number().int().min(0).optional(),

  // Cosmetic
  tint: z.string().optional(),

  // Deprecated, kept so old scenes still validate. Use frameUrls instead.
  frames: z.number().optional(),

  // ---------------------------------------------------------------------------
  // v1.1 (SHARED-02) — appended at the END so v1.0 sprites round-trip
  // byte-identically (Pitfall 3 in 07-RESEARCH.md). Both fields are optional.
  //
  // IMPORTANT: SpriteElementSchema MUST remain a plain ZodObject so it can be
  // an option of SceneElementSchema's z.discriminatedUnion in scene.ts. Do NOT
  // chain `.superRefine` here — orphan-currentClip cross-validation lives on
  // GameSceneSchema instead. See 07-PLAN-CHECK.md F1 for the architectural
  // rationale.
  // ---------------------------------------------------------------------------
  clips: z
    .array(SpriteAnimationClipSchema)
    .optional()
    .describe(
      'Named animation clips for clip-aware playback (v1.1). Cross-validation against currentClip lives on GameSceneSchema, not here, to preserve the SceneElementSchema discriminated union.',
    ),
  currentClip: z
    .string()
    .optional()
    .describe(
      'Name of the active clip. When non-undefined, MUST match a clips[].name on the same sprite. Enforced by GameSceneSchema.superRefine() — see scene.ts.',
    ),
});

export type SpriteElement = z.infer<typeof SpriteElementSchema>;
