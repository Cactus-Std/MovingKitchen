import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ['onnxruntime-web-use-extern-wasm'] },
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
});
