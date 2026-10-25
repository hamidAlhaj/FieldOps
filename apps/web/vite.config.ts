import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api":
        loadEnv(mode, ".", "").FIELDOPS_API_PROXY || "http://127.0.0.1:3000",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          forms: ["react-hook-form", "@hookform/resolvers/zod", "zod"],
          ui: ["@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
}));
