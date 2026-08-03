import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress Privy's misplaced __PURE__ annotation warnings
        if (warning.code === 'INVALID_ANNOTATION') return
        if (warning.message?.includes('/*#__PURE__*/')) return
        warn(warning)
      },
    },
  },
  define: { global: 'globalThis' },
})
