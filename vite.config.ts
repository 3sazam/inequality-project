import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Split heavy vendor libraries into their own chunks so the browser can
    // cache them across deploys. Without this everything React-related ends
    // up in one ~1.2MB main bundle that gets re-downloaded on every release.
    rollupOptions: {
      output: {
        manualChunks: {
          three:    ['three', '@react-three/fiber', '@react-three/drei'],
          gsap:     ['gsap'],
          lenis:    ['lenis'],
          react:    ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
})
