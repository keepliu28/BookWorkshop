import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // 确保打包后的路径是相对路径
  server: {
    port: 5173,
    strictPort: true
  }
})