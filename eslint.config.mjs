import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  // Formatting is Prettier's job; this turns off the stylistic rules that would fight it.
  prettier,
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    '.next-*/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Read-only source material and generated files:
    'reference/**',
    'test-results/**',
    'playwright-report/**',
    'blob-report/**',
  ]),
]);

export default eslintConfig;
