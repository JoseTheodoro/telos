import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp, type CreateAppOptions } from "../../src/create-app.js";
import { loadEnv } from "../../src/Infrastructure/Config/env.js";

export function collectLogLines() {
  const lines: Record<string, unknown>[] = [];
  const stream = {
    write(chunk: string) {
      lines.push(JSON.parse(chunk) as Record<string, unknown>);
    },
  };
  return { lines, stream };
}

export async function createReadyApp(options: CreateAppOptions = {}): Promise<NestFastifyApplication> {
  const { stream } = collectLogLines();
  const app = await createApp(loadEnv({ NODE_ENV: "test" }), { logStream: stream, ...options });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
