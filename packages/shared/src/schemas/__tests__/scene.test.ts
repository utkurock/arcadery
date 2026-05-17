import { describe, it, expect } from 'vitest';
import { GameSceneSchema, SceneElementSchema } from '../scene';
import { SpriteElementSchema } from '../elements/sprite';
import { createEmptyScene } from '../../utils/scene';
import { createBoxElement, createSpriteElement } from '../../utils/elements';

describe('GameSceneSchema', () => {
  it('validates a valid scene with flat element map (SCEN-01)', () => {
    const scene = createEmptyScene();
    const box = createBoxElement();
    scene.elements[box.id] = box;
    const result = GameSceneSchema.safeParse(scene);
    expect(result.success).toBe(true);
  });

  it('supports hybrid 2D sprites and 3D objects (SCEN-02)', () => {
    const scene = createEmptyScene();
    const box = createBoxElement();
    const sprite = createSpriteElement({ src: '/test.png' });
    scene.elements[box.id] = box;
    scene.elements[sprite.id] = sprite;
    const result = GameSceneSchema.safeParse(scene);
    expect(result.success).toBe(true);
  });

  it('roundtrip serialize/deserialize without data loss (SCEN-03)', () => {
    const scene = createEmptyScene('Test Scene');
    const box = createBoxElement({ name: 'TestBox' });
    scene.elements[box.id] = box;
    const serialized = JSON.stringify(scene);
    const deserialized = JSON.parse(serialized);
    const validated = GameSceneSchema.parse(deserialized);
    expect(JSON.stringify(validated)).toBe(serialized);
  });

  it('requires schemaVersion: 1 (SCEN-04)', () => {
    const scene = createEmptyScene();
    expect(GameSceneSchema.safeParse(scene).success).toBe(true);
    expect(GameSceneSchema.safeParse({ ...scene, schemaVersion: 2 }).success).toBe(false);
    const { schemaVersion, ...noVersion } = scene;
    expect(GameSceneSchema.safeParse(noVersion).success).toBe(false);
  });

  it('rejects malformed input (SCEN-04)', () => {
    expect(GameSceneSchema.safeParse({}).success).toBe(false);
    expect(GameSceneSchema.safeParse({ schemaVersion: 1 }).success).toBe(false);
    expect(GameSceneSchema.safeParse('not an object').success).toBe(false);
  });

  it('rejects element with unknown type', () => {
    const scene = createEmptyScene();
    scene.elements['bad'] = { id: 'bad', type: 'unknown', name: 'Bad' } as any;
    expect(GameSceneSchema.safeParse(scene).success).toBe(false);
  });
});

describe('SceneElementSchema', () => {
  it('validates box element', () => {
    const box = createBoxElement();
    expect(SceneElementSchema.safeParse(box).success).toBe(true);
  });

  it('validates sprite element', () => {
    const sprite = createSpriteElement({ src: '/test.png' });
    expect(SceneElementSchema.safeParse(sprite).success).toBe(true);
  });

  it('rejects element missing id', () => {
    const { id, ...noId } = createBoxElement();
    expect(SceneElementSchema.safeParse(noId).success).toBe(false);
  });
});

describe('SpriteElementSchema (SHARED-02 backward compat & v1.1 acceptance)', () => {
  it('round-trips v1.0 sprite with only legacy frameUrls unchanged', () => {
    const v1Sprite = createSpriteElement({
      src: '/test.png',
      frameUrls: ['/f1.png', '/f2.png'],
      frameRate: 8,
      loopMode: 'loop',
    });
    const serialized = JSON.stringify(v1Sprite);
    const parsed = SpriteElementSchema.parse(JSON.parse(serialized));
    expect(JSON.stringify(parsed)).toBe(serialized);
    expect(parsed.clips).toBeUndefined();
    expect(parsed.currentClip).toBeUndefined();
  });

  it('factory contract: createSpriteElement({ src }) injects NEITHER clips NOR currentClip (defends [01-01])', () => {
    // Per F3: this assertion is the canary that catches Zod defaults
    // accidentally being added to the new optional fields.
    const sprite = createSpriteElement({ src: '/cat.png' });
    expect('clips' in sprite).toBe(false);
    expect('currentClip' in sprite).toBe(false);
    // Round-trip MUST be byte-identical: parse(serialize(x)) === x.
    const parsed = SpriteElementSchema.parse(sprite);
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(sprite));
    // Belt-and-suspenders: the parsed object also has neither key materialized.
    expect('clips' in parsed).toBe(false);
    expect('currentClip' in parsed).toBe(false);
  });

  it('validates v1.1 sprite with clips + currentClip', () => {
    const v1_1 = createSpriteElement({
      src: '/test.png',
      clips: [
        { name: 'idle', frameUrls: ['/i1.png', '/i2.png'], frameRate: 6, loopMode: 'loop' },
      ],
      currentClip: 'idle',
    });
    expect(SpriteElementSchema.safeParse(v1_1).success).toBe(true);
  });

  it('accepts sprite with clips and absent currentClip', () => {
    const sprite = createSpriteElement({
      src: '/test.png',
      clips: [
        { name: 'idle', frameUrls: ['/i1.png'], frameRate: 6, loopMode: 'loop' },
      ],
    });
    expect(SpriteElementSchema.safeParse(sprite).success).toBe(true);
  });

  it('accepts sprite with currentClip and no clips (legacy/forward-compat)', () => {
    const sprite = createSpriteElement({ src: '/test.png', currentClip: 'idle' });
    expect(SpriteElementSchema.safeParse(sprite).success).toBe(true);
  });

  it('SpriteElementSchema does NOT cross-validate orphan currentClip on its own (cross-validation is scene-level)', () => {
    // Important: the orphan check lives on GameSceneSchema, not here.
    // SpriteElementSchema accepts an orphan in isolation by design — this
    // keeps the schema a plain ZodObject so SceneElementSchema's
    // discriminatedUnion still works.
    const sprite = createSpriteElement({
      src: '/test.png',
      clips: [
        { name: 'idle', frameUrls: ['/i1.png'], frameRate: 6, loopMode: 'loop' },
      ],
      currentClip: 'run',
    });
    expect(SpriteElementSchema.safeParse(sprite).success).toBe(true);
  });
});

describe('GameSceneSchema (SHARED-02 scene-level orphan-currentClip cross-validation)', () => {
  // Helper to wrap a single sprite into a minimal-but-valid scene.
  const makeSceneWithSprite = (
    id: string,
    sprite: ReturnType<typeof createSpriteElement>,
  ) => ({
    schemaVersion: 1 as const,
    id: 'scene-1',
    name: 'test',
    elements: { [id]: { ...sprite, id } },
    layers: [],
    settings: {}, // SceneSettingsSchema fields all have .default()
    // economy and gameState are optional and omitted
  });

  it('rejects a scene whose sprite has an orphan currentClip; error path includes the element id', () => {
    const sprite = createSpriteElement({
      src: '/test.png',
      clips: [
        { name: 'idle', frameUrls: ['/i1.png'], frameRate: 6, loopMode: 'loop' },
      ],
      currentClip: 'run',
    });
    const elementId = 'sprite-orphan-1';
    const scene = makeSceneWithSprite(elementId, sprite);

    const result = GameSceneSchema.safeParse(scene);
    expect(result.success).toBe(false);
    if (!result.success) {
      const orphanIssue = result.error.issues.find(
        (i) => i.path.includes('currentClip') && i.path.includes(elementId),
      );
      expect(orphanIssue).toBeDefined();
      // Error message mentions the offending name AND the element id (richer
      // diagnostics than a sprite-level refine could produce).
      expect(orphanIssue!.message).toContain('run');
      expect(orphanIssue!.message).toContain(elementId);
    }
  });

  it('accepts a scene whose sprite has matching currentClip and clips[].name', () => {
    const sprite = createSpriteElement({
      src: '/test.png',
      clips: [
        { name: 'idle', frameUrls: ['/i1.png'], frameRate: 6, loopMode: 'loop' },
      ],
      currentClip: 'idle',
    });
    const scene = makeSceneWithSprite('sprite-ok-1', sprite);
    expect(GameSceneSchema.safeParse(scene).success).toBe(true);
  });

  it('accepts a scene whose sprite has clips but no currentClip', () => {
    const sprite = createSpriteElement({
      src: '/test.png',
      clips: [
        { name: 'idle', frameUrls: ['/i1.png'], frameRate: 6, loopMode: 'loop' },
      ],
    });
    const scene = makeSceneWithSprite('sprite-clips-only', sprite);
    expect(GameSceneSchema.safeParse(scene).success).toBe(true);
  });

  it('accepts a v1.0 scene whose sprite has neither clips nor currentClip', () => {
    const sprite = createSpriteElement({ src: '/test.png' });
    const scene = makeSceneWithSprite('sprite-v1', sprite);
    expect(GameSceneSchema.safeParse(scene).success).toBe(true);
  });
});
