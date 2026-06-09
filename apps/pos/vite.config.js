import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "@icons": path.resolve(__dirname, "../../icons"),
        },
    },
    server: {
        proxy: {
            "/api": "http://localhost:3005",
            "/ws": { target: "ws://localhost:3005", ws: true },
        },
    },
});
