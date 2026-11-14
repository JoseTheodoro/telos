import type { FastifyInstance } from "fastify";
import { createApp, type CreateAppOptions } from "../../src/app.js";
import { loadEnv } from "../../src/Infrastructure/Config/env.js";
import { createWebRootFixture } from "./web-root.js";

export function collectLogLines() {
  const lines: Record<string, unknown>[] = [];
  const stream = {
    write(chunk: string) {
      lines.push(JSON.parse(chunk) as Record<string, unknown>);
    },
  };
  return { lines, stream };
}

export function createTestApp(options: CreateAppOptions = {}): FastifyInstance {
  const env = loadEnv({ NODE_ENV: "test", WEB_DIST_DIR: createWebRootFixture() });
  return createApp(env, { logStream: collectLogLines().stream, ...options });
}
