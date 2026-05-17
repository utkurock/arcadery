import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // jsdom: required for hooks/utils.test.ts (document.createElement) and
    // future @testing-library/react smoke tests in Wave 3.
    environment: 'jsdom',
    // Include .tsx alongside .ts so R3F integration tests
    // (raycast-proxy.test.tsx, selection-manager.test.tsx,
    // use-canvas-shortcuts.test.tsx) are discovered.
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
  },
});
