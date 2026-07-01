import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'app/src/**/*.test.ts',
      'supabase/functions/_shared/**/*.test.ts',
    ],
  },
});
