import { describe, it, expect } from 'vitest';
import { SpriteAnimationClipSchema } from '../animation-clip';

describe('SpriteAnimationClipSchema (SHARED-01)', () => {
  it('accepts a valid clip', () => {
    expect(
      SpriteAnimationClipSchema.safeParse({
        name: 'idle',
        frameUrls: ['/a.png', '/b.png'],
        frameRate: 8,
        loopMode: 'loop',
      }).success,
    ).toBe(true);
  });

  it('accepts a single-frame static-pose clip (min(1) is intentional)', () => {
    expect(
      SpriteAnimationClipSchema.safeParse({
        name: 'idle',
        frameUrls: ['/a.png'],
        frameRate: 8,
        loopMode: 'loop',
      }).success,
    ).toBe(true);
  });

  it('rejects empty name', () => {
    expect(
      SpriteAnimationClipSchema.safeParse({
        name: '',
        frameUrls: ['/a.png'],
        frameRate: 8,
        loopMode: 'loop',
      }).success,
    ).toBe(false);
  });

  it('rejects empty frameUrls', () => {
    expect(
      SpriteAnimationClipSchema.safeParse({
        name: 'idle',
        frameUrls: [],
        frameRate: 8,
        loopMode: 'loop',
      }).success,
    ).toBe(false);
  });

  it('rejects more than 64 frameUrls', () => {
    const tooMany = Array.from({ length: 65 }, (_, i) => `/f${i}.png`);
    expect(
      SpriteAnimationClipSchema.safeParse({
        name: 'idle',
        frameUrls: tooMany,
        frameRate: 8,
        loopMode: 'loop',
      }).success,
    ).toBe(false);
  });

  it('rejects frameRate < 1', () => {
    expect(
      SpriteAnimationClipSchema.safeParse({
        name: 'idle',
        frameUrls: ['/a.png'],
        frameRate: 0,
        loopMode: 'loop',
      }).success,
    ).toBe(false);
  });

  it('rejects frameRate > 60', () => {
    expect(
      SpriteAnimationClipSchema.safeParse({
        name: 'idle',
        frameUrls: ['/a.png'],
        frameRate: 999,
        loopMode: 'loop',
      }).success,
    ).toBe(false);
  });

  it('rejects unknown loopMode', () => {
    expect(
      SpriteAnimationClipSchema.safeParse({
        name: 'idle',
        frameUrls: ['/a.png'],
        frameRate: 8,
        loopMode: 'reverse',
      }).success,
    ).toBe(false);
  });

  it('accepts each valid loopMode', () => {
    for (const loopMode of ['loop', 'once', 'pingpong'] as const) {
      expect(
        SpriteAnimationClipSchema.safeParse({
          name: 'idle',
          frameUrls: ['/a.png'],
          frameRate: 8,
          loopMode,
        }).success,
      ).toBe(true);
    }
  });
});
