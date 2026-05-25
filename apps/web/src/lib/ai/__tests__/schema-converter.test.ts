import { describe, it, expect } from 'vitest';
import {
  modifyElementToolSchema,
  generateSceneToolSchema,
} from '../schema-converter';

function hasKey(obj: unknown, key: string): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  if (key in obj) return true;
  return Object.values(obj).some((v) => hasKey(v, key));
}

describe('modifyElementToolSchema', () => {
  it('is an object-rooted tool schema', () => {
    expect(modifyElementToolSchema).toBeDefined();
    expect(modifyElementToolSchema['type']).toBe('object');
  });

  it('wraps the element under an `element` property', () => {
    const props = modifyElementToolSchema['properties'] as Record<string, unknown>;
    expect(props['element']).toBeDefined();
    expect(modifyElementToolSchema['required']).toEqual(['element']);
  });

  it('does NOT contain $ref keys (all references inlined)', () => {
    expect(hasKey(modifyElementToolSchema, '$ref')).toBe(false);
  });

  it('contains anyOf for discriminated union representation', () => {
    expect(hasKey(modifyElementToolSchema, 'anyOf')).toBe(true);
  });
});

describe('generateSceneToolSchema', () => {
  it('contains elements and description properties', () => {
    const schema = generateSceneToolSchema as Record<string, unknown>;
    const props = schema['properties'] as Record<string, unknown> | undefined;
    expect(props).toBeDefined();
    expect(props!['elements']).toBeDefined();
    expect(props!['description']).toBeDefined();
  });

  it('does NOT contain $schema key at top level', () => {
    const schema = generateSceneToolSchema as Record<string, unknown>;
    expect('$schema' in schema).toBe(false);
  });
});
