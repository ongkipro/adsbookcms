import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  build: {
    // The single global stylesheet was render-blocking for ~810 ms on a
    // throttled mobile connection. Astro's default only inlines sheets under
    // 4 KB. Ad traffic lands on a page and converts or leaves, so it almost
    // never benefits from a separately cached stylesheet - paying a few KB
    // gzip per document to delete a blocking round trip is the better trade.
    inlineStylesheets: 'always',
  },
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
        '@iconify/utils',
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
