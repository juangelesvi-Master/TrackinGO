import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// En desarrollo, Vite reenvía /api al servidor Traccar indicado en TRACCAR_URL
// (archivo .env). Así el navegador habla con un único origen y no hay problemas
// de CORS ni de cookies de sesión.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.TRACCAR_URL || 'https://demo.traccar.org'

  return {
    plugins: [react()],
    build: {
      rolldownOptions: {
        output: {
          // Librerías grandes en archivos aparte: casi no cambian entre versiones, así el
          // navegador las reusa de su caché cuando actualizamos la app.
          advancedChunks: {
            groups: [
              { name: 'maplibre', test: /node_modules[\\/]maplibre-gl/ },
              { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            ],
          },
          // El "worker" del mapa sale como .mjs y algunos hostings lo mandan con un tipo
          // que el navegador rechaza (el mapa queda en blanco). Como .js funciona en todos.
          assetFileNames: (asset) =>
            asset.names?.some((n) => n.endsWith('.mjs')) ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]',
        },
      },
    },
    server: {
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: true,
          ws: true,
          cookieDomainRewrite: '',
          configure: (proxy) => {
            // Traccar puede rechazar el WebSocket si el Origin no es el suyo.
            proxy.on('proxyReqWs', (proxyReq) => proxyReq.setHeader('origin', target))
            // Quitamos "Secure" para que la cookie funcione en http://localhost.
            proxy.on('proxyRes', (proxyRes) => {
              const cookies = proxyRes.headers['set-cookie']
              if (cookies) {
                proxyRes.headers['set-cookie'] = cookies.map((c) => c.replace(/;\s*Secure/gi, ''))
              }
            })
          },
        },
      },
    },
  }
})
