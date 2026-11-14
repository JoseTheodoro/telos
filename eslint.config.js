import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist/**", "**/dist/**", "legacy/**", "tests/e2e/**", "node_modules/**"] },
  {
    files: ["**/*.{ts,js}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    // graphInit e upgradeWorkspace recebem JSON de entrada sem schema; tipá-los exige reescrever as duas funções e seus chamadores.
    files: ["packages/domain/src/model.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
