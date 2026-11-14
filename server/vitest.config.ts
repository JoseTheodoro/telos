import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    pool: "forks",
    setupFiles: ["test/support/cleanup-web-roots.ts"],
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
