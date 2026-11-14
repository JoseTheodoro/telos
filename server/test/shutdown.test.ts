import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateAppOptions } from "../src/app.js";
import { closeOnShutdownSignals } from "../src/Infrastructure/Http/graceful-shutdown.js";
import { createTestApp } from "./support/test-app.js";

const SLOW_ROUTE_MS = 600;

interface RunningServer {
  app: FastifyInstance;
  baseUrl: string;
  events: string[];
  killedAfterClose: Promise<unknown[]>;
}

async function startServerWithSlowRoute(slowRouteMs: number, options: CreateAppOptions = {}): Promise<RunningServer> {
  const events: string[] = [];
  const killedAfterClose = new Promise<unknown[]>((resolve) => {
    vi.spyOn(process, "kill").mockImplementation((...args) => {
      events.push("shutdown-completed");
      resolve(args);
      return true;
    });
  });
  const app = createTestApp(options);
  app.get("/slow", (_request, reply) => {
    setTimeout(() => {
      events.push("handler-finished");
      void reply.send({ finished: true });
    }, slowRouteMs);
    return reply;
  });
  closeOnShutdownSignals(app);
  await app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = app.server.address() as AddressInfo;
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
    const killArgs = await running.killedAfterClose;

    expect(await inFlight).toEqual({ finished: true });
    expect(killArgs).toEqual([process.pid, "SIGTERM"]);
    expect(running.events).toEqual(["handler-finished", "shutdown-completed"]);
  });

  it("closes on SIGINT and releases its signal listeners", async () => {
    const listenersBefore = { SIGINT: process.listenerCount("SIGINT"), SIGTERM: process.listenerCount("SIGTERM") };
    running = await startServerWithSlowRoute(SLOW_ROUTE_MS);
    expect(process.listenerCount("SIGINT")).toBe(listenersBefore.SIGINT + 1);

    process.emit("SIGINT", "SIGINT");
    const killArgs = await running.killedAfterClose;

    expect(killArgs).toEqual([process.pid, "SIGINT"]);
    expect({ SIGINT: process.listenerCount("SIGINT"), SIGTERM: process.listenerCount("SIGTERM") }).toEqual(listenersBefore);
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
