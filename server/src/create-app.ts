import "reflect-metadata";
import helmet from "@fastify/helmet";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { type FastifyInstance, LogController } from "fastify";
import { AppModule } from "./app.module.js";
import type { Env } from "./Infrastructure/Config/env.js";
import { echoCorrelationId, resolveCorrelationId } from "./Infrastructure/Http/correlation-id.middleware.js";
import { frameworkErrorHandler } from "./Infrastructure/Http/framework-error.handler.js";
import { GlobalExceptionFilter } from "./Infrastructure/Http/global-exception.filter.js";
import { securityHeadersOptions } from "./Infrastructure/Http/security-headers.js";
import { defaultWebDistDir, registerStatic } from "./Infrastructure/Http/static.module.js";

export const SHUTDOWN_GRACE_MS = 10_000;

export interface CreateAppOptions {
  logStream?: { write(message: string): void };
  shutdownGraceMs?: number;
}

export async function createApp(env: Env, options: CreateAppOptions = {}): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    logger: { level: env.NODE_ENV === "production" ? "info" : "debug", ...(options.logStream && { stream: options.logStream }) },
    logController: new LogController({ requestIdLogLabel: "correlationId" }),
    requestIdHeader: false,
    genReqId: resolveCorrelationId,
    onProtoPoisoning: "error",
    onConstructorPoisoning: "error",
    frameworkErrors: frameworkErrorHandler,
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { logger: ["error", "warn"] });

  await app.register(helmet, securityHeadersOptions);
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook("onRequest", echoCorrelationId);
  closeLingeringConnectionsAfter(fastify, options.shutdownGraceMs ?? SHUTDOWN_GRACE_MS);
  await registerStatic(fastify, env.WEB_DIST_DIR ?? defaultWebDistDir());

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();
  return app;
}

// Sem o teto, uma conexão pendurada seguraria o SIGTERM até o orquestrador dar SIGKILL e perder o drain das demais.
function closeLingeringConnectionsAfter(fastify: FastifyInstance, graceMs: number): void {
  let timer: NodeJS.Timeout | undefined;
  fastify.addHook("preClose", () => {
    timer = setTimeout(() => fastify.server.closeAllConnections(), graceMs);
    timer.unref();
  });
  fastify.addHook("onClose", () => clearTimeout(timer));
}
