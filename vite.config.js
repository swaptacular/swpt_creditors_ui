import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import commonjs from '@rollup/plugin-commonjs';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  build: {
    target: ['es2020'],
    sourcemap: true,
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`
      },
      plugins: [commonjs()],
    }
  },
  server: {
    port: 5000
  },
  plugins: [
    svelte(),
    viteCommonjs(),
  ]
})
