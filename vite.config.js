import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['recharts', 'recharts/es6/index'],
  },
  build: {
    commonjsOptions: {
      include: [/recharts/, /node_modules/],
    },
    rollupOptions: {
      output: {
        // Separa as libs pesadas em chunks próprios: melhora cache de longo
        // prazo e tira peso do bundle inicial (login).
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          emoji: ['emoji-picker-react'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
