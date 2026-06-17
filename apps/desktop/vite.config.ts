import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname),
  base: "./",
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "../../dist-renderer"),
    emptyOutDir: true,
  },
});
