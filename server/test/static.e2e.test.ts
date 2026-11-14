import { rmSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadEnv } from "../src/Infrastructure/Config/env.js";
import { collectLogLines, createTestApp } from "./support/test-app.js";
import { createWebRootFixture, FIXTURE_ASSET_JS, FIXTURE_INDEX_HTML, FIXTURE_TELOS_HTML, OUTSIDE_FILE_MARKER } from "./support/web-root.js";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

describe("static SPA delivery", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("serves index.html with no-cache", async () => {
    app = createTestApp();

    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["cache-control"]).toBe("no-cache");
    expect(response.body).toBe(FIXTURE_INDEX_HTML);
  });

  it("serves /index.html with no-cache", async () => {
    app = createTestApp();

    const response = await app.inject({ method: "GET", url: "/index.html" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-cache");
  });

  it("serves another HTML entry point with no-cache", async () => {
    app = createTestApp();

    const response = await app.inject({ method: "GET", url: "/telos.html" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["cache-control"]).toBe("no-cache");
    expect(response.body).toBe(FIXTURE_TELOS_HTML);
  });

  it("serves hashed asset as immutable", async () => {
    app = createTestApp();

    const response = await app.inject({ method: "GET", url: "/assets/app-7b2e4d.js" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(response.headers["content-type"]).toContain("javascript");
    expect(response.body).toBe(FIXTURE_ASSET_JS);
  });

  it("serves a hashed stylesheet as immutable", async () => {
    app = createTestApp();

    const response = await app.inject({ method: "GET", url: "/assets/app-3f9a1c.css" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(response.headers["content-type"]).toContain("text/css");
  });

  it("answers HEAD for index.html and assets", async () => {
    app = createTestApp();

    const index = await app.inject({ method: "HEAD", url: "/" });
    const asset = await app.inject({ method: "HEAD", url: "/assets/app-7b2e4d.js" });

    expect(index.statusCode).toBe(200);
    expect(index.headers["cache-control"]).toBe("no-cache");
    expect(index.body).toBe("");
    expect(asset.statusCode).toBe(200);
    expect(asset.headers["cache-control"]).toBe(IMMUTABLE_CACHE_CONTROL);
  });

  it("falls back to index.html for unknown non-API route", async () => {
    app = createTestApp();

    const response = await app.inject({ method: "GET", url: "/mapas/oficina-sintetica/jornada" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-cache");
    expect(response.body).toBe(FIXTURE_INDEX_HTML);
  });

  it("returns JSON 404 for unknown /v1 route", async () => {
    app = createTestApp();

    const response = await app.inject({ method: "GET", url: "/v1/nope?token=synthetic-query-marker" });
    const body = response.json<Record<string, unknown>>();

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(Object.keys(body).sort()).toEqual(["message", "path", "statusCode", "timestamp"]);
    expect(body.path).toBe("/v1/nope");
    expect(response.body).not.toContain("synthetic-query-marker");
  });

  it.each(["/v1", "/health/nope"])("returns JSON 404 for API prefix %s", async (url) => {
    app = createTestApp();

    const response = await app.inject({ method: "GET", url });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
  });

  it("does not treat a path that merely starts with /health as API", async () => {
    app = createTestApp();

    const response = await app.inject({ method: "GET", url: "/healthy-living" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
  });

  it("answers an unsatisfiable Range on an asset with 416 and the status text", async () => {
    app = createTestApp();

    const response = await app.inject({ method: "GET", url: "/assets/app-7b2e4d.js", headers: { range: "bytes=999999-" } });

    expect(response.statusCode).toBe(416);
    expect(response.json<Record<string, unknown>>()).toMatchObject({ statusCode: 416, message: "Range Not Satisfiable" });
  });

  it("answers a failed If-Match on an asset with 412 and the status text", async () => {
    app = createTestApp();

    const response = await app.inject({ method: "GET", url: "/assets/app-7b2e4d.js", headers: { "if-match": '"synthetic-etag"' } });

    expect(response.statusCode).toBe(412);
    expect(response.json<Record<string, unknown>>()).toMatchObject({ statusCode: 412, message: "Precondition Failed" });
  });

  it("returns JSON 404 for a missing asset", async () => {
    app = createTestApp();

    const response = await app.inject({ method: "GET", url: "/assets/app-000000.js" });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(Object.keys(response.json<Record<string, unknown>>()).sort()).toEqual(["message", "path", "statusCode", "timestamp"]);
  });

  it("returns JSON 404 for non-GET methods on unknown paths", async () => {
    app = createTestApp();

    const response = await app.inject({ method: "POST", url: "/qualquer-coisa", payload: {} });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
  });

  it("does not serve dotfiles", async () => {
    app = createTestApp();

    const response = await app.inject({ method: "GET", url: "/.secret" });

    expect(response.body).not.toContain("synthetic-dotfile-marker");
  });

  it.each([
    "/..%2foutside.txt",
    "/%2e%2e/outside.txt",
    "/%2e%2e%2foutside.txt",
    "/assets/..%2f..%2foutside.txt",
    "/..%5coutside.txt",
    "/assets/%2e%2e%2f%2e%2e%2foutside.txt",
    "/../outside.txt",
  ])("does not serve files outside the web root (%s)", async (url) => {
    app = createTestApp();

    const response = await app.inject({ method: "GET", url });

    expect(response.body).not.toContain(OUTSIDE_FILE_MARKER);
  });

  it("index.html carries the CSP and X-Correlation-ID", async () => {
    app = createTestApp();

    const response = await app.inject({ method: "GET", url: "/", headers: { "x-correlation-id": "static-check-1" } });

    expect(response.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-correlation-id"]).toBe("static-check-1");
  });

  it("assets carry the security headers and X-Correlation-ID", async () => {
    app = createTestApp();

    const response = await app.inject({ method: "GET", url: "/assets/app-7b2e4d.js", headers: { "x-correlation-id": "static-check-2" } });

    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["x-correlation-id"]).toBe("static-check-2");
  });

  it("keeps /health working", async () => {
    app = createTestApp();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.json()).toEqual({ status: "ok" });
  });
});

describe("web root validation", () => {
  it("fails fast naming the directory when index.html is missing", () => {
    const webRoot = createWebRootFixture();
    rmSync(path.join(webRoot, "index.html"));

    const startup = () => createApp(loadEnv({ NODE_ENV: "test", WEB_DIST_DIR: webRoot }), { logStream: collectLogLines().stream });

    expect(startup).toThrowError(new RegExp(`index\\.html.*${webRoot.replaceAll("\\", "\\\\")}`));
  });
});
