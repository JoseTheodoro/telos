import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const FIXTURE_INDEX_HTML =
  '<!doctype html><html><head><link rel="stylesheet" href="/assets/app-3f9a1c.css"></head><body><script type="module" src="/assets/app-7b2e4d.js"></script></body></html>';
export const FIXTURE_ASSET_JS = "export const synthetic = true;";

let createdRoots: string[] = [];

export function createWebRootFixture(): string {
  const webRoot = mkdtempSync(path.join(tmpdir(), "atlas-web-"));
  mkdirSync(path.join(webRoot, "assets"));
  writeFileSync(path.join(webRoot, "index.html"), FIXTURE_INDEX_HTML);
  writeFileSync(path.join(webRoot, "assets", "app-7b2e4d.js"), FIXTURE_ASSET_JS);
  writeFileSync(path.join(webRoot, "assets", "app-3f9a1c.css"), "body{margin:0}");
  writeFileSync(path.join(webRoot, ".secret"), "synthetic-dotfile-marker");
  createdRoots.push(webRoot);
  return webRoot;
}

export function removeWebRootFixtures(): void {
  for (const webRoot of createdRoots) rmSync(webRoot, { recursive: true, force: true });
  createdRoots = [];
}
