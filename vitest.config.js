import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      enabled: true,
      reporter: ['text', 'json', 'html'],
      provider: 'v8',
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
      exclude: [
        'benchmarks/**',
        'examples/**',
        'scripts/**',
        'bin/**',
        '**/*.config.*',
        '**/.eslintrc.*',
        'src/similarity-match-worker.js',
      ],
    },
  },
});
