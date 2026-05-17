import { describe, it, expect } from 'vitest';
import { isFormElementFocused } from '../utils';

describe('isFormElementFocused', () => {
  it('returns false for null', () => {
    expect(isFormElementFocused(null)).toBe(false);
  });
  it('returns false for a plain div', () => {
    const el = document.createElement('div');
    expect(isFormElementFocused(el)).toBe(false);
  });
  it('returns true for HTMLInputElement', () => {
    const el = document.createElement('input');
    expect(isFormElementFocused(el)).toBe(true);
  });
  it('returns true for HTMLTextAreaElement', () => {
    const el = document.createElement('textarea');
    expect(isFormElementFocused(el)).toBe(true);
  });
  it('returns true for HTMLSelectElement', () => {
    const el = document.createElement('select');
    expect(isFormElementFocused(el)).toBe(true);
  });
  it('returns true for a contentEditable element', () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    expect(isFormElementFocused(el)).toBe(true);
  });
});
