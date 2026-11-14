import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

const INTERNAL_ERROR_MESSAGE = "Internal server error";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const path = request.url.split("?")[0];
    const statusCode = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (!(exception instanceof HttpException)) {
      request.log.error({ err: exception }, "Erro não tratado na requisição");
    }

    void reply.status(statusCode).send({
      statusCode,
      message: exception instanceof HttpException ? this.messageOf(exception, request.url, path) : INTERNAL_ERROR_MESSAGE,
      timestamp: new Date().toISOString(),
      path,
    });
  }

  // O 404 de rota inexistente do Nest ecoa a URL completa; a query string pode carregar dado do usuário.
  private messageOf(exception: HttpException, url: string, path: string): string | string[] {
    const response = exception.getResponse();
    const message = typeof response === "object" && "message" in response ? (response.message as string | string[]) : exception.message;
    return Array.isArray(message) ? message.map((item) => item.replaceAll(url, path)) : message.replaceAll(url, path);
  }
}
