import { STATUS_CODES } from "node:http";
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { CORRELATION_ID_HEADER } from "./correlation-id.js";

const INTERNAL_ERROR_MESSAGE = "Internal server error";
const BAD_REQUEST_MESSAGE = "Bad Request";
const INTERNAL_SERVER_ERROR = 500;
const NOT_FOUND = 404;

type RequestError = FastifyError & { expose?: boolean };

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler(handleError);
  app.setNotFoundHandler(handleNotFound);
}

// Erros antes do roteamento (URL malformada) não passam pelos hooks nem pelo error handler; a mensagem do Fastify ecoa a URL crua.
export function handleFrameworkError(error: FastifyError, request: FastifyRequest, reply: FastifyReply): void {
  const statusCode = error.statusCode && error.statusCode < INTERNAL_SERVER_ERROR ? error.statusCode : INTERNAL_SERVER_ERROR;
  void reply.header(CORRELATION_ID_HEADER, request.id);
  sendError(request, reply, statusCode, statusCode < INTERNAL_SERVER_ERROR ? BAD_REQUEST_MESSAGE : INTERNAL_ERROR_MESSAGE);
}

function handleError(error: RequestError, request: FastifyRequest, reply: FastifyReply): void {
  if (isClientError(error)) {
    sendError(request, reply, error.statusCode, clientMessageOf(error));
    return;
  }
  request.log.error({ err: error }, "Erro não tratado na requisição");
  sendError(request, reply, INTERNAL_SERVER_ERROR, INTERNAL_ERROR_MESSAGE);
}

// Um erro marcado com expose:false (http-errors) não pode chegar ao cliente: só o texto do status sai.
function clientMessageOf(error: RequestError & { statusCode: number }): string {
  return error.expose === false ? (STATUS_CODES[error.statusCode] ?? INTERNAL_ERROR_MESSAGE) : error.message;
}

// A mensagem usa o path, não a URL: a query string pode carregar dado do usuário.
function handleNotFound(request: FastifyRequest, reply: FastifyReply): void {
  sendError(request, reply, NOT_FOUND, `Cannot ${request.method} ${pathOf(request)}`);
}

function isClientError(error: RequestError): error is RequestError & { statusCode: number } {
  return typeof error.statusCode === "number" && error.statusCode < INTERNAL_SERVER_ERROR;
}

function sendError(request: FastifyRequest, reply: FastifyReply, statusCode: number, message: string): void {
  void reply.status(statusCode).send({ statusCode, message, timestamp: new Date().toISOString(), path: pathOf(request) });
}

function pathOf(request: FastifyRequest): string {
  return request.url.split("?")[0] ?? "";
}
