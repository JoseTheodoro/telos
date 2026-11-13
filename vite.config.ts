import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// O build gera dist/index.html autocontido (JS e CSS inline):
// abre com duplo clique (file://) ou em qualquer host estático.
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
