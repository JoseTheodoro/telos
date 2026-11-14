import type { AddressInfo } from "node:net";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, type CreateAppOptions } from "../src/create-app.js";
import { loadEnv } from "../src/Infrastructure/Config/env.js";
import { collectLogLines } from "./support/test-app.js";

const SLOW_ROUTE_MS = 600;

interface RunningServer {
  app: NestFastifyApplication;
  baseUrl: string;
  events: string[];
  killedAfterClose: Promise<void>;
}

async function startServerWithSlowRoute(slowRouteMs: number, options: CreateAppOptions = {}): Promise<RunningServer> {
  const events: string[] = [];
  const killedAfterClose = new Promise<void>((resolve) => {
    vi.spyOn(process, "kill").mockImplementation(() => {
      events.push("shutdown-completed");
      resolve();
      return true;
    });
  });
  const app = await createApp(loadEnv({ NODE_ENV: "test" }), { logStream: collectLogLines().stream, ...options });
  app.getHttpAdapter().get("/slow", (_request: unknown, reply: { send(payload: unknown): void }) => {
    setTimeout(() => {
      events.push("handler-finished");
      reply.send({ finished: true });
    }, slowRouteMs);
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { app, baseUrl: `http://127.0.0.1:${port}`, events, killedAfterClose };
}

describe("graceful shutdown", () => {
  let running: RunningServer;

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await running.app.close();
  });

  it("drains in-flight request on SIGTERM", async () => {
    running = await startServerWithSlowRoute(SLOW_ROUTE_MS);
    const inFlight = fetch(`${running.baseUrl}/slow`, { headers: { connection: "close" } }).then((response) => response.json());
    await new Promise((resolve) => setTimeout(resolve, 100));

    process.emit("SIGTERM", "SIGTERM");
    await running.killedAfterClose;

    expect(await inFlight).toEqual({ finished: true });
    expect(running.events).toEqual(["handler-finished", "shutdown-completed"]);
  });

  it("force-closes connections still open once the grace period ends", async () => {
    running = await startServerWithSlowRoute(5_000, { shutdownGraceMs: 150 });
    const inFlight = fetch(`${running.baseUrl}/slow`, { headers: { connection: "close" } });
    const aborted = expect(inFlight).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const startedAt = Date.now();

    process.emit("SIGTERM", "SIGTERM");
    await running.killedAfterClose;

    await aborted;
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });
});
