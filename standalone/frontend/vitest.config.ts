import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** Copied from agentHub_frontend/vitest.config.ts — unchanged. */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // unit tests only — e2e/*.spec.ts are Playwright specs
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
