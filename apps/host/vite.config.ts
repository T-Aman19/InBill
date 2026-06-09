import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  base: "/host/",
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:3005",
      "/ws": { target: "ws://localhost:3005", ws: true },
    },
  },
  build: {
    outDir: "dist",
  },
})
