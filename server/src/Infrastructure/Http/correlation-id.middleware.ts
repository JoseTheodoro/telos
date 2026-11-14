import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { FastifyReply, FastifyRequest } from "fastify";

export const CORRELATION_ID_HEADER = "x-correlation-id";
const VALID_CORRELATION_ID = /^[A-Za-z0-9._-]{1,128}$/;

// O id entra em log e em header de resposta: só passa o que não permite injeção de linha ou de campo.
export function resolveCorrelationId(request: IncomingMessage): string {
  const incoming = request.headers[CORRELATION_ID_HEADER];
  return typeof incoming === "string" && VALID_CORRELATION_ID.test(incoming) ? incoming : randomUUID();
}

export function echoCorrelationId(request: FastifyRequest, reply: FastifyReply, done: () => void): void {
  void reply.header(CORRELATION_ID_HEADER, request.id);
  done();
}
