import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000', 
        changeOrigin: true,
      }
    }
  },

  plugins: [ 
    VitePWA({
      strategies: 'injectManifest',

      srcDir: 'public',
      filename: 'sw-workbox.js',
      
      manifest: {
        name: 'BanPlex',
        short_name: 'BanPlex',
        description: 'Aplikasi Manajemen Proyek Konstruksi',
        theme_color: '#f0f4f8',
        icons: [
          {
            src: '/icons-logo.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons-logo.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },

      includeAssets: [
          '/icons-logo.png', 
          '/logo-cv-aba.png', 
          '/icons-logo.webp', 
          '/logo-cv-aba.webp', 
          '/logo-header-pdf.png', 
          '/logo-footer-pdf.png'
        ]
    })
  ] 
});