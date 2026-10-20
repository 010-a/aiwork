import { defineConfig } from "vite";
export default defineConfig({
  build: {
    ssr: true,
    target: "node22",
    outDir: "service-dist",
    rollupOptions: {
      input: {
        main: "server/main.ts",
        cli: "server/cli.ts",
        mcp: "server/mcp.ts",
      },
      output: {
        entryFileNames: "[name].mjs",
        chunkFileNames: "chunks/[name]-[hash].mjs",
      },
    },
  },
});
