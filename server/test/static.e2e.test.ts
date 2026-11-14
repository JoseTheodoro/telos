import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/create-app.js";
import { loadEnv } from "../src/Infrastructure/Config/env.js";
import { collectLogLines, createReadyApp } from "./support/test-app.js";
import { createWebRootFixture, FIXTURE_ASSET_JS, FIXTURE_INDEX_HTML } from "./support/web-root.js";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const SERVER_PACKAGE_NAME = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../package.json"), "utf8")).name as string;

describe("static SPA delivery", () => {
  let app: NestFastifyApplication;

  afterEach(async () => {
    await app.close();
  });

  it("serves index.html with no-cache", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["cache-control"]).toBe("no-cache");
    expect(response.body).toBe(FIXTURE_INDEX_HTML);
  });

  it("serves /index.html with no-cache", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/index.html" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-cache");
  });

  it("serves hashed asset as immutable", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/assets/app-7b2e4d.js" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(response.headers["content-type"]).toContain("javascript");
    expect(response.body).toBe(FIXTURE_ASSET_JS);
  });

  it("serves a hashed stylesheet as immutable", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/assets/app-3f9a1c.css" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(response.headers["content-type"]).toContain("text/css");
  });

  it("answers HEAD for index.html and assets", async () => {
    app = await createReadyApp();

    const index = await app.inject({ method: "HEAD", url: "/" });
    const asset = await app.inject({ method: "HEAD", url: "/assets/app-7b2e4d.js" });

    expect(index.statusCode).toBe(200);
    expect(index.headers["cache-control"]).toBe("no-cache");
    expect(index.body).toBe("");
    expect(asset.statusCode).toBe(200);
    expect(asset.headers["cache-control"]).toBe(IMMUTABLE_CACHE_CONTROL);
  });

  it("falls back to index.html for unknown non-API route", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/mapas/oficina-sintetica/jornada" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-cache");
    expect(response.body).toBe(FIXTURE_INDEX_HTML);
  });

  it("returns JSON 404 for unknown /v1 route", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/v1/nope?token=synthetic-query-marker" });
    const body = response.json<Record<string, unknown>>();

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(Object.keys(body).sort()).toEqual(["message", "path", "statusCode", "timestamp"]);
    expect(body.path).toBe("/v1/nope");
    expect(response.body).not.toContain("synthetic-query-marker");
  });

  it.each(["/v1", "/health/nope"])("returns JSON 404 for API prefix %s", async (url) => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
  });

  it("does not treat a path that merely starts with /health as API", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/healthy-living" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
  });

  it("returns JSON 404 for a missing asset", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/assets/app-000000.js" });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(Object.keys(response.json<Record<string, unknown>>()).sort()).toEqual(["message", "path", "statusCode", "timestamp"]);
  });

  it("returns JSON 404 for non-GET methods on unknown paths", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "POST", url: "/qualquer-coisa", payload: {} });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
  });

  it("does not serve dotfiles", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/.secret" });

    expect(response.body).not.toContain("synthetic-dotfile-marker");
  });

  it.each([
    "/..%2fpackage.json",
    "/%2e%2e/package.json",
    "/assets/..%2f..%2fpackage.json",
    "/..%5cpackage.json",
    "/assets/%2e%2e%2f%2e%2e%2fpackage.json",
  ])("does not serve files outside the web root (%s)", async (url) => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url });

    expect(response.body).not.toContain(SERVER_PACKAGE_NAME);
    expect(response.body).not.toContain('"dependencies"');
  });

  it("index.html carries the CSP and X-Correlation-ID", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/", headers: { "x-correlation-id": "static-check-1" } });

    expect(response.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-correlation-id"]).toBe("static-check-1");
  });

  it("assets carry the security headers and X-Correlation-ID", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/assets/app-7b2e4d.js", headers: { "x-correlation-id": "static-check-2" } });

    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["x-correlation-id"]).toBe("static-check-2");
  });

  it("keeps /health working", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.json()).toEqual({ status: "ok" });
  });
});

describe("web root validation", () => {
  it("fails fast naming the directory when index.html is missing", async () => {
    const webRoot = createWebRootFixture();
    rmSync(path.join(webRoot, "index.html"));

    const startup = createApp(loadEnv({ NODE_ENV: "test", WEB_DIST_DIR: webRoot }), { logStream: collectLogLines().stream });

    await expect(startup).rejects.toThrowError(new RegExp(`index\\.html.*${webRoot.replaceAll("\\", "\\\\")}`));
  });
});
