import type { FastifyPluginCallback } from "fastify";

export const HEALTH_PATH = "/health";

const healthResponseSchema = {
  type: "object",
  properties: { status: { type: "string", const: "ok" } },
  required: ["status"],
} as const;

export const healthRoutes: FastifyPluginCallback = (app, _options, done) => {
  app.get(HEALTH_PATH, { schema: { response: { 200: healthResponseSchema } } }, () => ({ status: "ok" }));
  done();
};
