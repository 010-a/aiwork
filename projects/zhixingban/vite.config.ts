import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: process.env.ZHIXINGBAN_BROWSER_ONLY
      ? undefined
      : { "/api": "http://127.0.0.1:5174" },
  },
});
