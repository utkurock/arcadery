import { describe, it, expect } from 'vitest';
import {
  modifyElementJsonSchema,
  generateSceneJsonSchema,
} from '../schema-converter';

function hasKey(obj: unknown, key: string): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  if (key in obj) return true;
  return Object.values(obj).some((v) => hasKey(v, key));
}

describe('modifyElementJsonSchema', () => {
  it('is a valid non-null object', () => {
    expect(modifyElementJsonSchema).toBeDefined();
    expect(typeof modifyElementJsonSchema).toBe('object');
    expect(modifyElementJsonSchema).not.toBeNull();
  });

  it('does NOT contain $ref keys (all references inlined)', () => {
    expect(hasKey(modifyElementJsonSchema, '$ref')).toBe(false);
  });

  it('contains anyOf for discriminated union representation', () => {
    expect(hasKey(modifyElementJsonSchema, 'anyOf')).toBe(true);
  });
});

describe('generateSceneJsonSchema', () => {
  it('contains elements and description properties', () => {
    const schema = generateSceneJsonSchema as Record<string, unknown>;
    const props = schema['properties'] as Record<string, unknown> | undefined;
    expect(props).toBeDefined();
    expect(props!['elements']).toBeDefined();
    expect(props!['description']).toBeDefined();
  });

  it('does NOT contain $schema key at top level', () => {
    const schema = generateSceneJsonSchema as Record<string, unknown>;
    expect('$schema' in schema).toBe(false);
  });
});
