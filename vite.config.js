import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// npm run build        → dist/ (일반 배포용, Vercel 등)
// npm run build:single → dist-single/index.html 한 파일 (USB·메신저로 나눠줄 때)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
}));
