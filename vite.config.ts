import { defineConfig } from 'vitest/config';

export default defineConfig({
  // React-style aliases so JSX works through preact/compat.
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  build: {
    target: 'es2022',
    // pdf-lib is only ever needed at export time; keep it out of the entry chunk.
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes('pdf-lib') || id.includes('@pdf-lib') ? 'pdf' : undefined,
      },
    },
  },
  server: {
    host: true,
    port: 5199,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
