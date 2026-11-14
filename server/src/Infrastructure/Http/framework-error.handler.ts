import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { CORRELATION_ID_HEADER } from "./correlation-id.middleware.js";

// Erros antes do roteamento (URL malformada) não passam pelo filter do Nest; a mensagem do Fastify ecoa a URL crua.
export function frameworkErrorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply): void {
  const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
  void reply
    .header(CORRELATION_ID_HEADER, request.id)
    .status(statusCode)
    .send({
      statusCode,
      message: statusCode < 500 ? "Bad Request" : "Internal server error",
      timestamp: new Date().toISOString(),
      path: request.url.split("?")[0],
    });
}
