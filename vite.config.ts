import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'src/renderer',  // 指向包含 HTML 的目录
  base: './',
  build: {
    outDir: '../../dist/renderer',  // 修正输出路径
    emptyOutDir: true,
    sourcemap: true,  // 添加 sourcemap 便于调试
  },
  server: {
    port: 3000,
  },
  publicDir: 'public',
  resolve: {
    alias: {
      '@': resolve('src/renderer'),
      '@shared': resolve('src/shared'),
      '@main': resolve('src/main'),
      '@preload': resolve('src/preload'),
    },
  },
});
