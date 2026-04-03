import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: env.VITE_PORT ? parseInt(env.VITE_PORT, 10) : 5173,
      proxy: {
        '/api': env.VITE_API_URL || 'http://localhost:3000'
      }
    }
  };
});
