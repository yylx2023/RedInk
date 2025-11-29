import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:12398',
        changeOrigin: true,
        // SSE 长连接配置
        configure: (proxy) => {
          // 设置代理超时为 10 分钟
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // 设置 socket 超时
            req.socket.setTimeout(600000)
            if (res.socket) {
              res.socket.setTimeout(600000)
            }
          })
        }
      }
    }
  }
})
