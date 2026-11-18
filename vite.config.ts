import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { rssiPlugin } from './vite-plugins/rssi';

export default defineConfig({
  plugins: [react(), rssiPlugin()],
  // Allow sharing the dev server through an ngrok tunnel for remote demos.
  server: { allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app'] },
});
