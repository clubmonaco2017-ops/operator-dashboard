import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/security/**/*.spec.{ts,tsx}'],
    environment: 'node',
    testTimeout: 15000,
    setupFiles: ['tests/security/setup.ts'],
  },
});
