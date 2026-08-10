import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El proxy hace que /api/... del frontend salga hacia el backend de Express.
// Gracias a eso el navegador ve todo en el mismo origen y no hay lios de CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
