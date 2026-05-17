// Minimal `react-dom` types so the editor package's `createPortal` import
// typechecks. The editor doesn't declare `@types/react-dom` itself (it would
// be redundant — the workspace consumer always has it), but TypeScript can't
// see those types when resolving via pnpm's virtual store. We only need the
// createPortal signature; the rest of react-dom isn't imported from editor.
declare module 'react-dom' {
  import type { ReactNode, ReactPortal } from 'react';
  export function createPortal(
    children: ReactNode,
    container: Element | DocumentFragment,
    key?: string | null,
  ): ReactPortal;
}
