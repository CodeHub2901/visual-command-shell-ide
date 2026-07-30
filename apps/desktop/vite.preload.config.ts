import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  build: {
    outDir: path.resolve(__dirname, "dist-electron/preload"),
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "src/preload/index.ts"),
      formats: ["cjs"],
      fileName: () => "index.js"
    },
    rollupOptions: {
      external: ["electron"]
    }
  }
});

