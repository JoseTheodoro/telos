import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const FIXTURE_INDEX_HTML =
  '<!doctype html><html><head><link rel="stylesheet" href="/assets/app-3f9a1c.css"></head><body><script type="module" src="/assets/app-7b2e4d.js"></script></body></html>';
export const OUTSIDE_FILE_NAME = "outside.txt";
export const OUTSIDE_FILE_MARKER = "synthetic-outside-root-marker";
export const FIXTURE_ASSET_JS = "export const synthetic = true;";

let createdRoots: string[] = [];

export function createWebRootFixture(): string {
  const parentDir = mkdtempSync(path.join(tmpdir(), "telos-web-"));
  writeFileSync(path.join(parentDir, OUTSIDE_FILE_NAME), OUTSIDE_FILE_MARKER);
  const webRoot = path.join(parentDir, "web");
  mkdirSync(path.join(webRoot, "assets"), { recursive: true });
  writeFileSync(path.join(webRoot, "index.html"), FIXTURE_INDEX_HTML);
  writeFileSync(path.join(webRoot, "assets", "app-7b2e4d.js"), FIXTURE_ASSET_JS);
  writeFileSync(path.join(webRoot, "assets", "app-3f9a1c.css"), "body{margin:0}");
  writeFileSync(path.join(webRoot, ".secret"), "synthetic-dotfile-marker");
  createdRoots.push(parentDir);
  return webRoot;
}

export function removeWebRootFixtures(): void {
  for (const parentDir of createdRoots) rmSync(parentDir, { recursive: true, force: true });
  createdRoots = [];
}
