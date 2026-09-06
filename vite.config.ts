import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, '.', '')

  return {
    server: {
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target:
            environment.VITE_BACKEND_PROXY_TARGET || 'http://localhost:8080',
          changeOrigin: true,
          configure(proxy) {
            proxy.on('proxyReq', (proxyRequest) => {
              proxyRequest.removeHeader('origin')
            })
          },
        },
      },
    },
  }
})
