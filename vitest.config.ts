import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Autotrack drives real DOM events, so it needs a document.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
