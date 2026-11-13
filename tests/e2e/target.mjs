import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const appUrl = () => process.env.E2E_BASE_URL || `file://${root}/dist/index.html`;
