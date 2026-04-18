import { defineConfig } from 'vitest/config';
import path from 'node:path';

// server-only throws when imported in a client bundle. Under vitest we want it
// to be a no-op, so alias it to an empty module.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'server-only': path.resolve(__dirname, 'test/server-only-shim.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
