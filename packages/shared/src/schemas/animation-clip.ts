import { z } from 'zod';

/**
 * Named animation clip for clip-aware sprite playback (SHARED-01, v1.1).
 *
 * Decision A1 (per 07-RESEARCH.md Assumptions Log): clips are identified by
 * `name` (string). There is no separate stable `id` field. If renames break
 * downstream references in a future phase, an optional `id` can be added
 * additively without affecting v1.1 records.
 */
export const SpriteAnimationClipSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe('Clip identifier, e.g. "idle", "run", "jump"'),
  /**
   * Per-frame image URLs played in order. min(1) is intentional: a single-frame
   * "static pose" clip is a legitimate use case (e.g. a `idle` clip that just
   * holds one frame). Compare to the legacy `frameUrls` field on
   * SpriteElementSchema which uses min(2) — that constraint historically
   * meant "2+ frames = animated, 1 frame should use `src` instead". Inside the
   * new clip schema both constraints are unified under "at least one frame".
   * Do NOT tighten this to min(2) — Phase 12 ANIM-01 will use single-frame
   * clips for static poses.
   */
  frameUrls: z
    .array(z.string())
    .min(1)
    .max(64)
    .describe(
      'Per-frame image URLs played in order (>=1; single-frame static-pose clips allowed)',
    ),
  frameRate: z
    .number()
    .min(1)
    .max(60)
    .describe('Frames per second for playback'),
  loopMode: z
    .enum(['loop', 'once', 'pingpong'])
    .describe('How the clip cycles when playback reaches the end'),
});

export type SpriteAnimationClip = z.infer<typeof SpriteAnimationClipSchema>;
