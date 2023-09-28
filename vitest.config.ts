import { defineConfig } from 'vitest/config';

// https://vitejs.dev/config/
export default defineConfig(() => ({
  name: '@typemail/smtp',
  test: {
    globals: true,
  },
}));
