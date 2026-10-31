import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  // API firemnej knižnice beží vo Workeri (`pnpm --filter @bridge/worker dev`, ADR 0015); bez neho sa knižnica skryje
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: {
    // three.js (≈ 570 kB) sa načíta lenivo so záložkou 3D a ďalej sa deliť nedá (ADR 0009)
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'zod', test: /node_modules[\\/]zod[\\/]/ },
          ],
        },
      },
    },
  },
});
