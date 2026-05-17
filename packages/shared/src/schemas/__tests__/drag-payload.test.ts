import { describe, it, expect } from 'vitest';
import {
  AssetDragPayloadSchema,
  ElementDragPayloadSchema,
  DragPayloadSchema,
} from '../drag-payload';
import { DRAG_MIME, type DragMime } from '../../constants';

describe('DRAG_MIME constants (SHARED-03)', () => {
  it('exports the asset and element MIME strings', () => {
    expect(DRAG_MIME.ASSET).toBe('application/arcadery-asset');
    expect(DRAG_MIME.ELEMENT).toBe('application/arcadery-element');
  });
  it('narrows DragMime to the two literal strings (compile-time check)', () => {
    const a: DragMime = DRAG_MIME.ASSET;
    const b: DragMime = DRAG_MIME.ELEMENT;
    expect([a, b]).toHaveLength(2);
  });
});

describe('AssetDragPayloadSchema (SHARED-03)', () => {
  it('accepts minimal asset payload', () => {
    expect(
      AssetDragPayloadSchema.safeParse({
        kind: 'asset',
        assetId: 'a-1',
        url: 'https://example.com/a.png',
        name: 'A',
      }).success,
    ).toBe(true);
  });
  it('accepts asset payload with optional animation fields', () => {
    expect(
      AssetDragPayloadSchema.safeParse({
        kind: 'asset',
        assetId: 'a-1',
        url: 'https://example.com/a.png',
        name: 'A',
        frameUrls: ['/f1.png', '/f2.png'],
        frameRate: 8,
        aspectRatio: 1.5,
      }).success,
    ).toBe(true);
  });
  it('accepts blob: URLs (Pitfall 5)', () => {
    expect(
      AssetDragPayloadSchema.safeParse({
        kind: 'asset',
        assetId: 'a-1',
        url: 'blob:https://example.com/abc-123',
        name: 'A',
      }).success,
    ).toBe(true);
  });
  it('accepts data: URLs (Pitfall 5)', () => {
    expect(
      AssetDragPayloadSchema.safeParse({
        kind: 'asset',
        assetId: 'a-1',
        url: 'data:image/png;base64,iVBOR...',
        name: 'A',
      }).success,
    ).toBe(true);
  });
  it('rejects wrong kind discriminator', () => {
    expect(
      AssetDragPayloadSchema.safeParse({
        kind: 'element',
        assetId: 'a-1',
        url: '/a.png',
        name: 'A',
      }).success,
    ).toBe(false);
  });
});

describe('ElementDragPayloadSchema (SHARED-03)', () => {
  it('accepts minimal element payload', () => {
    expect(
      ElementDragPayloadSchema.safeParse({
        kind: 'element',
        elementId: 'e-1',
        elementType: 'sprite',
        elementName: 'Hero',
      }).success,
    ).toBe(true);
  });
  it('accepts element payload with thumbnailUrl', () => {
    expect(
      ElementDragPayloadSchema.safeParse({
        kind: 'element',
        elementId: 'e-1',
        elementType: 'sprite',
        elementName: 'Hero',
        thumbnailUrl: 'blob:https://example.com/thumb',
      }).success,
    ).toBe(true);
  });
});

describe('DragPayloadSchema discriminated union (SHARED-03)', () => {
  it('routes kind:asset to AssetDragPayloadSchema', () => {
    const result = DragPayloadSchema.safeParse({
      kind: 'asset',
      assetId: 'a-1',
      url: '/a.png',
      name: 'A',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe('asset');
  });
  it('routes kind:element to ElementDragPayloadSchema', () => {
    const result = DragPayloadSchema.safeParse({
      kind: 'element',
      elementId: 'e-1',
      elementType: 'box',
      elementName: 'B',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe('element');
  });
  it('rejects unknown kind', () => {
    expect(
      DragPayloadSchema.safeParse({
        kind: 'mystery',
        foo: 'bar',
      }).success,
    ).toBe(false);
  });
  it('rejects payload missing kind', () => {
    expect(
      DragPayloadSchema.safeParse({
        assetId: 'a-1',
        url: '/a.png',
        name: 'A',
      }).success,
    ).toBe(false);
  });
});
