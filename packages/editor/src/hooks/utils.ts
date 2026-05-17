/**
 * Focus-guard helper shared by canvas-keyboard hooks.
 *
 * Returns true when the user is focused on an editable form element so
 * canvas shortcuts (Esc, Cmd+A, Arrows, Delete) can bail and let native
 * browser behavior win (e.g. Cmd+A inside the chat textarea selects text,
 * not all canvas elements).
 *
 * Source pattern: extracted verbatim from the original
 * use-keyboard-shortcuts.ts (lines 13-23). Phase 8 centralizes it so the
 * new use-selection-keyboard hook and the existing hook share one
 * definition (per RESEARCH.md Q4 decision).
 */
export function isFormElementFocused(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    // `isContentEditable` is the readonly resolved value (handles inherit + nesting)
    // — supported by all modern browsers but returns `undefined` in jsdom.
    // `contentEditable` is the writable attribute string ("true" | "false" | "inherit" | "plaintext-only")
    // — supported by jsdom too. Checking BOTH covers production AND tests.
    target.isContentEditable === true ||
    target.contentEditable === 'true' ||
    target.contentEditable === 'plaintext-only'
  );
}
