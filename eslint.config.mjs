import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import react from 'eslint-plugin-react';
import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';

/**
 * Shared flat ESLint config for the whole Turborepo. Each package runs
 * `eslint src/` from its own dir; ESLint walks up and discovers this file.
 *
 * Philosophy: type-check (tsc) is the hard correctness gate. ESLint here
 * catches obvious foot-guns. Stylistic / opinionated rules are downgraded to
 * `warn` so `pnpm lint` stays green and surfaces issues without a red wall.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/.claude/**',
      '**/coverage/**',
      'supabase/**',
      '**/*.config.{js,mjs,ts}',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, ...globals.es2023 },
    },
    plugins: { 'react-hooks': reactHooks, react, '@next/next': nextPlugin },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // react-three-fiber renders custom intrinsics with three.js props that
      // this rule flags; the codebase disables it inline, so it must exist.
      'react/no-unknown-property': 'off',
      // editor package components carry inline @next/next disable directives
      // (they render inside the Next app); register the plugin so those
      // directives resolve. Full next rules are scoped to apps/web below.
      '@next/next/no-img-element': 'off',
      // Pragmatic downgrades — informative, not blocking.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
    },
  },
  // Next.js app: add core-web-vitals rules. The @next/next plugin is already
  // registered in the base block above (so editor's inline disables resolve);
  // here we just turn on the recommended ruleset for app code.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // App-router only project — the pages-dir link rule is irrelevant and
      // logs a noisy warning when linting from the repo root.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  // Test files: relax further. Vitest injects these globals (globals: true).
  {
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
