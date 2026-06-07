import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from "vite-plugin-pwa"
import path from "path"

export default defineConfig({
  base: "/mobile/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      base: "/mobile/",
      manifest: {
        name: "InBill Captain",
        short_name: "Captain",
        description: "InBill order-taking app for restaurant captains",
        start_url: "/mobile/",
        display: "standalone",
        background_color: "#fffaf7",
        theme_color: "#c47a1e",
        icons: [
          { src: "/mobile/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/mobile/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/mobile/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/ws/],
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
})
