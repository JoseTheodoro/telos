import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { collectLogLines, createTestApp } from "./support/test-app.js";

describe("error handling", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("answers an unhandled error with 500 and logs it with the correlationId", async () => {
    const { lines, stream } = collectLogLines();
    app = createTestApp({ logStream: stream });
    app.get("/boom", () => {
      throw new Error("synthetic-internal-detail");
    });

    const response = await app.inject({
      method: "GET",
      url: "/boom?token=synthetic-query-marker",
      headers: { "x-correlation-id": "boom-1" },
    });
    const body = response.json<Record<string, unknown>>();

    expect(response.statusCode).toBe(500);
    expect(response.headers["x-correlation-id"]).toBe("boom-1");
    expect(body).toMatchObject({ statusCode: 500, message: "Internal server error", path: "/boom" });
    expect(response.body).not.toContain("synthetic-internal-detail");
    expect(lines.some((line) => line.correlationId === "boom-1" && line.msg === "Erro não tratado na requisição")).toBe(true);
  });

  it("hides the message of a route error that only carries a 4xx statusCode", async () => {
    app = createTestApp();
    app.get("/boom-4xx", () => {
      throw Object.assign(new Error("synthetic-internal-detail"), { statusCode: 400 });
    });

    const response = await app.inject({ method: "GET", url: "/boom-4xx" });

    expect(response.statusCode).toBe(500);
    expect(response.json<Record<string, unknown>>()).toMatchObject({ statusCode: 500, message: "Internal server error" });
    expect(response.body).not.toContain("synthetic-internal-detail");
  });

  it("hides an error that marks expose without the http-errors status", async () => {
    app = createTestApp();
    app.get("/half-http-error", () => {
      throw Object.assign(new Error("synthetic-internal-detail"), { statusCode: 409, expose: true });
    });

    const response = await app.inject({ method: "GET", url: "/half-http-error" });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("synthetic-internal-detail");
  });

  it("keeps the message of an http-errors client error", async () => {
    app = createTestApp();
    app.get("/conflict", () => {
      throw Object.assign(new Error("Versão desatualizada"), { status: 409, statusCode: 409, expose: true });
    });

    const response = await app.inject({ method: "GET", url: "/conflict" });

    expect(response.statusCode).toBe(409);
    expect(response.json<Record<string, unknown>>()).toMatchObject({ statusCode: 409, message: "Versão desatualizada" });
  });
});
