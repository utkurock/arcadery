import { z } from 'zod';
import { Vec3Schema } from './primitives';
import { BoxElementSchema } from './elements/box';
import { SphereElementSchema } from './elements/sphere';
import { PlaneElementSchema } from './elements/plane';
import { SpriteElementSchema } from './elements/sprite';
import { ModelElementSchema } from './elements/model';
import { TextElementSchema } from './elements/text';
import { LightElementSchema } from './elements/light';
import { TilemapElementSchema } from './elements/tilemap';
import { GameEconomyConfigSchema } from './economy';
import { GameStateConfigSchema } from './behaviors';

// Re-export BaseElementSchema for downstream use
export { BaseElementSchema } from './base-element';

// Discriminated union of all element types
export const SceneElementSchema = z.discriminatedUnion('type', [
  BoxElementSchema,
  SphereElementSchema,
  PlaneElementSchema,
  SpriteElementSchema,
  ModelElementSchema,
  TextElementSchema,
  LightElementSchema,
  TilemapElementSchema,
]);

export type SceneElement = z.infer<typeof SceneElementSchema>;
export type ElementType = SceneElement['type'];

// Layer schema
const GameLayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  zIndex: z.number().default(0),
});

// Scene settings
export const SceneSettingsSchema = z.object({
  backgroundColor: z.string().default('#17181e'),
  ambientLightIntensity: z.number().default(0.4),
  gravity: Vec3Schema.default({ x: 0, y: -9.81, z: 0 }),
  cameraType: z.enum(['2d', '3d']).default('3d'),
  renderEngine: z.enum(['three', 'phaser']).default('three'),
});

export type SceneSettings = z.infer<typeof SceneSettingsSchema>;

// Main scene schema. Wrapped with .superRefine for SHARED-02 scene-level
// cross-validation (orphan currentClip references on sprite elements).
//
// The cross-validation lives HERE — not on SpriteElementSchema — because
// SceneElementSchema (above) is a z.discriminatedUnion whose options must be
// plain ZodObject. Wrapping SpriteElementSchema in .superRefine would produce
// a ZodEffects and break the union (TypeScript: option type mismatch; runtime:
// discriminatedUnion.create() throws because ZodEffects has no .shape).
// See 07-PLAN-CHECK.md F1 for the full rationale.
export const GameSceneSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string(),
    name: z.string(),
    elements: z.record(z.string(), SceneElementSchema),
    layers: z.array(GameLayerSchema),
    settings: SceneSettingsSchema,
    economy: GameEconomyConfigSchema.optional(),
    /** Optional play-mode config. When present, the scene is a playable game. */
    gameState: GameStateConfigSchema.optional(),
  })
  .superRefine((scene, ctx) => {
    // SHARED-02: orphan currentClip cross-validation. For every sprite element
    // where both clips and currentClip are present, currentClip MUST match
    // clips[].name. Error path includes the element id so diagnostics point at
    // the exact offending sprite (e.g. ['elements', 'sprite-abc', 'currentClip']).
    for (const [elementId, element] of Object.entries(scene.elements)) {
      if (element.type !== 'sprite') continue;
      if (!element.clips || !element.currentClip) continue;
      const matched = element.clips.some((c) => c.name === element.currentClip);
      if (!matched) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['elements', elementId, 'currentClip'],
          message: `Sprite element "${elementId}": currentClip "${element.currentClip}" does not match any clip name in clips[]`,
        });
      }
    }
  });

export type GameScene = z.infer<typeof GameSceneSchema>;
