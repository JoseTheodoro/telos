import helmet from "@fastify/helmet";
import Fastify, { type FastifyInstance, LogController } from "fastify";
import type { Env } from "./Infrastructure/Config/env.js";
import { echoCorrelationId, resolveCorrelationId } from "./Infrastructure/Http/correlation-id.js";
import { handleFrameworkError, registerErrorHandling } from "./Infrastructure/Http/error-handling.js";
import { healthRoutes } from "./Infrastructure/Http/health.js";
import { closeLingeringConnectionsAfter, SHUTDOWN_GRACE_MS } from "./Infrastructure/Http/graceful-shutdown.js";
import { securityHeadersOptions } from "./Infrastructure/Http/security-headers.js";
import { defaultWebDistDir, registerStatic } from "./Infrastructure/Http/static.js";

export interface CreateAppOptions {
  logStream?: { write(message: string): void };
  shutdownGraceMs?: number;
}

export function createApp(env: Env, options: CreateAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: { level: env.NODE_ENV === "production" ? "info" : "debug", ...(options.logStream && { stream: options.logStream }) },
    logController: new LogController({ requestIdLogLabel: "correlationId" }),
    requestIdHeader: false,
    genReqId: resolveCorrelationId,
    onProtoPoisoning: "error",
    onConstructorPoisoning: "error",
    frameworkErrors: handleFrameworkError,
  });

  registerErrorHandling(app);
  void app.register(helmet, securityHeadersOptions);
  app.addHook("onRequest", echoCorrelationId);
  closeLingeringConnectionsAfter(app, options.shutdownGraceMs ?? SHUTDOWN_GRACE_MS);
  void app.register(healthRoutes);
  registerStatic(app, env.WEB_DIST_DIR ?? defaultWebDistDir());
  return app;
}
