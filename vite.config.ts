import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Vitest picks this up too. The API-handler tests import the full Shelby SDK
  // lazily inside request handlers; the first cold import alone takes >5s on
  // some machines, so the default 5s per-test timeout flakes.
  test: {
    testTimeout: 20_000,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress Privy's misplaced __PURE__ annotation warnings
        if (warning.code === 'INVALID_ANNOTATION') return
        if (warning.message?.includes('/*#__PURE__*/')) return
        if (warning.code === 'UNRESOLVED_IMPORT' && warning.message?.includes('react-aria')) return
        warn(warning)
      },
    },
  },
  define: { global: 'globalThis' },
})
