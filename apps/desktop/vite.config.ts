import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname),
  base: "./",
  plugins: [react()],
  build: {
    target: "es2022",
    outDir: resolve(__dirname, "../../dist-renderer"),
    emptyOutDir: true,
  },
});
