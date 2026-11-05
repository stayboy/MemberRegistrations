import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  reactHooks.configs.flat.recommended,
  {
    files: ['public/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: [
      'vite.config.ts',
      'vitest.config.ts',
      'playwright.config.ts',
      'e2e/**/*.ts',
      'eslint.config.js',
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
