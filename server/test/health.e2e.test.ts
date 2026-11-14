import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/create-app.js";
import { loadEnv } from "../src/Infrastructure/Config/env.js";
import { collectLogLines, createReadyApp } from "./support/test-app.js";

const EXPECTED_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "font-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("GET /health", () => {
  let app: NestFastifyApplication;

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 with status ok", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("echoes X-Correlation-ID when provided", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/health", headers: { "x-correlation-id": "trace-123.abc_DEF" } });

    expect(response.headers["x-correlation-id"]).toBe("trace-123.abc_DEF");
  });

  it("generates X-Correlation-ID when absent", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.headers["x-correlation-id"]).toMatch(UUID_PATTERN);
  });

  it.each(["has space", "a".repeat(129), "semi;colon"])("replaces an invalid X-Correlation-ID (%s)", async (invalidId) => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/health", headers: { "x-correlation-id": invalidId } });

    expect(response.headers["x-correlation-id"]).toMatch(UUID_PATTERN);
  });

  it("sets X-Correlation-ID on a 404 for an unknown route", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/unknown", headers: { "x-correlation-id": "missing-route-1" } });

    expect(response.statusCode).toBe(404);
    expect(response.headers["x-correlation-id"]).toBe("missing-route-1");
  });

  it("sets Content-Security-Policy with script-src 'self'", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/health" });

    const directives = String(response.headers["content-security-policy"])
      .split(";")
      .map((directive) => directive.trim());
    expect(directives).toEqual(EXPECTED_CSP_DIRECTIVES);
    expect(response.headers["strict-transport-security"]).toContain("max-age=");
    expect(response.headers["referrer-policy"]).toBe("same-origin");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("returns errors as { statusCode, message, timestamp, path }", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/unknown?token=synthetic-query-marker" });
    const body = response.json<Record<string, unknown>>();

    expect(Object.keys(body).sort()).toEqual(["message", "path", "statusCode", "timestamp"]);
    expect(body.statusCode).toBe(404);
    expect(body.path).toBe("/unknown");
    expect(new Date(body.timestamp as string).toISOString()).toBe(body.timestamp);
    expect(response.body).not.toContain("synthetic-query-marker");
  });

  it("returns the error format with X-Correlation-ID for a malformed URL", async () => {
    app = await createReadyApp();

    const response = await app.inject({ method: "GET", url: "/%zz", headers: { "x-correlation-id": "bad-url-1" } });
    const body = response.json<Record<string, unknown>>();

    expect(response.statusCode).toBe(400);
    expect(response.headers["x-correlation-id"]).toBe("bad-url-1");
    expect(Object.keys(body).sort()).toEqual(["message", "path", "statusCode", "timestamp"]);
    expect(body.message).toBe("Bad Request");
    expect(response.body).not.toContain("not a valid url component");
  });

  it("returns the error format with X-Correlation-ID for a malformed JSON body", async () => {
    app = await createReadyApp();

    const response = await app.inject({
      method: "POST",
      url: "/health",
      headers: { "content-type": "application/json", "x-correlation-id": "bad-json-1" },
      payload: "{bad",
    });
    const body = response.json<Record<string, unknown>>();

    expect(response.statusCode).toBe(400);
    expect(response.headers["x-correlation-id"]).toBe("bad-json-1");
    expect(Object.keys(body).sort()).toEqual(["message", "path", "statusCode", "timestamp"]);
    expect(body.path).toBe("/health");
  });

  it("rejects a JSON body carrying __proto__", async () => {
    app = await createApp(loadEnv({ NODE_ENV: "test" }), { logStream: collectLogLines().stream });
    app.getHttpAdapter().post("/echo", (_request: unknown, reply: { send(payload: unknown): void }) => reply.send({ ok: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const response = await app.inject({
      method: "POST",
      url: "/echo",
      headers: { "content-type": "application/json" },
      payload: '{"__proto__": {"isAdmin": true}}',
    });

    expect(response.statusCode).toBe(400);
  });

  it("logs the correlationId on request lines and never the request body", async () => {
    const { lines, stream } = collectLogLines();
    app = await createApp(loadEnv({ NODE_ENV: "test" }), { logStream: stream });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    await app.inject({
      method: "POST",
      url: "/health",
      headers: { "content-type": "application/json", "x-correlation-id": "log-check-1" },
      payload: '{"name":"synthetic-body-marker"}',
    });

    const requestLines = lines.filter((line) => line.correlationId === "log-check-1");
    expect(requestLines.length).toBeGreaterThan(0);
    expect(JSON.stringify(lines)).not.toContain("synthetic-body-marker");
  });
});
