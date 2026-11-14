import { defaultClientConditions, defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Modo "server": build multiarquivo com hash em dist/web, entregue pelo servidor com base "/" (o fallback da SPA serve o index.html em rotas profundas).
// Modo "portable": dist/portable/index.html autocontido (JS e CSS inline), abre com duplo clique (file://) ou em qualquer host estático.
export default defineConfig(({ mode }) => {
  const isPortable = mode === "portable";
  return {
    base: isPortable ? "./" : "/",
    plugins: isPortable ? [viteSingleFile()] : [],
    resolve: {
      conditions: ["telos-source", ...defaultClientConditions],
    },
    build: {
      outDir: isPortable ? "dist/portable" : "dist/web",
      emptyOutDir: true,
      rolldownOptions: isPortable ? {} : { input: { index: "index.html", telos: "telos.html" } },
    },
  };
});
