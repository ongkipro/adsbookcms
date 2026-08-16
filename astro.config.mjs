import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  server: {
    port: 4321,
    host: true,
  },
  adapter: cloudflare({
    imageService: 'passthrough',
    sessionKVBindingName: 'SESSION',
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: [
        'astro',
        '@astrojs/cloudflare',
        'astro-seo',
      ],
    },
    server: {
      host: true,
      watch: {
        ignored: ['**/.wrangler/**'],
      },
    },
  },
});
