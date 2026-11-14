import { STATUS_CODES } from "node:http";
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { setCorrelationIdHeader } from "./correlation-id.js";
import { pathnameOf } from "./url.js";

const INTERNAL_ERROR_MESSAGE = "Internal server error";
const BAD_REQUEST_MESSAGE = "Bad Request";
const INTERNAL_SERVER_ERROR = 500;
const NOT_FOUND = 404;

type RequestError = FastifyError & { expose?: boolean; status?: number };
type ClientError = RequestError & { statusCode: number };

function clientStatusOf(statusCode: number | undefined): number | null {
  return typeof statusCode === "number" && statusCode < INTERNAL_SERVER_ERROR ? statusCode : null;
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler(handleError);
  app.setNotFoundHandler(handleNotFound);
}

// Erros antes do roteamento (URL malformada) não passam pelos hooks nem pelo error handler; a mensagem do Fastify ecoa a URL crua.
export function handleFrameworkError(error: FastifyError, request: FastifyRequest, reply: FastifyReply): void {
  const clientStatus = clientStatusOf(error.statusCode);
  setCorrelationIdHeader(request, reply);
  if (clientStatus === null) sendError(request, reply, INTERNAL_SERVER_ERROR, INTERNAL_ERROR_MESSAGE);
  else sendError(request, reply, clientStatus, BAD_REQUEST_MESSAGE);
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
function clientMessageOf(error: ClientError): string {
  return error.expose === false ? (STATUS_CODES[error.statusCode] ?? INTERNAL_ERROR_MESSAGE) : error.message;
}

// A mensagem usa o path, não a URL: a query string pode carregar dado do usuário.
function handleNotFound(request: FastifyRequest, reply: FastifyReply): void {
  sendError(request, reply, NOT_FOUND, `Cannot ${request.method} ${pathnameOf(request.url)}`);
}

// Só erros do Fastify (FST_*) e do http-errors trazem mensagem escrita para o cliente; qualquer outro erro de rota vira 500 para não vazar detalhe interno.
function isClientError(error: RequestError): error is ClientError {
  const fromFastify = error.code?.startsWith("FST_") === true;
  const fromHttpErrors = typeof error.expose === "boolean" && error.status === error.statusCode;
  return (fromFastify || fromHttpErrors) && clientStatusOf(error.statusCode) !== null;
}

function sendError(request: FastifyRequest, reply: FastifyReply, statusCode: number, message: string): void {
  void reply.status(statusCode).send({ statusCode, message, timestamp: new Date().toISOString(), path: pathnameOf(request.url) });
}
