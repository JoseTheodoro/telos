import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp, type CreateAppOptions } from "../../src/create-app.js";
import { type Env, loadEnv } from "../../src/Infrastructure/Config/env.js";
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

export function loadTestEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({ NODE_ENV: "test", WEB_DIST_DIR: createWebRootFixture(), ...overrides });
}

export async function createReadyApp(options: CreateAppOptions = {}, env: Env = loadTestEnv()): Promise<NestFastifyApplication> {
  const { stream } = collectLogLines();
  const app = await createApp(env, { logStream: stream, ...options });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
