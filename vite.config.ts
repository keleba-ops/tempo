import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Content-Security-Policy for the built (static) site; GitHub Pages can't set headers, so it ships as a meta tag.
function cspPlugin(): Plugin {
  const api = process.env.VITE_API_URL ? new URL(process.env.VITE_API_URL).origin : '';
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${api}`.trim(),
    'frame-src https://www.google.com https://maps.google.com',
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'tempo-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }],
  };
}

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), cspPlugin()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    host: true,
  },
});
