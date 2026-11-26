import { resolve } from 'node:path';
import { defineConfig, normalizePath } from 'vite';
import react from '@vitejs/plugin-react';
import { cameraTwinPlugin } from './vite-plugins/camera-twin';
import { rssiPlugin } from './vite-plugins/rssi';

let scanHost: string | undefined;
try {
  const origin = new URL(process.env.WDT_CAMERA_SCAN_ORIGIN ?? '');
  if (origin.protocol === 'https:') scanHost = origin.hostname;
} catch { /* A public HTTPS URL is optional for local scans. */ }
const allowedHosts = ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', ...(scanHost ? [scanHost] : [])];

export default defineConfig({
  plugins: [react(), rssiPlugin(), cameraTwinPlugin()],
  build: {
    rolldownOptions: {
      input: {
        wifi: resolve(import.meta.dirname, 'index.html'),
        indoor: resolve(import.meta.dirname, 'indoor-twin/index.html'),
        camera: resolve(import.meta.dirname, 'camera-twin/index.html'),
        roomScan: resolve(import.meta.dirname, 'camera-twin/scan/index.html'),
      },
    },
  },
  preview: { allowedHosts },
  server: {
    allowedHosts,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', `${normalizePath(resolve(import.meta.dirname, '.wdt-data'))}/**`] },
  },
});
