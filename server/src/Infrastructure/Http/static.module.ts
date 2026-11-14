import { existsSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply } from "fastify";

const INDEX_FILE = "index.html";
const API_PREFIXES = ["/v1", "/health"];
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const REVALIDATE_CACHE_CONTROL = "no-cache";

// A profundidade é a mesma em src/ (testes) e em dist/ (build): quatro níveis acima fica a raiz do repositório.
export function defaultWebDistDir(): string {
  return path.resolve(import.meta.dirname, "../../../../dist/web");
}

export async function registerStatic(fastify: FastifyInstance, webDistDir: string): Promise<void> {
  if (!existsSync(path.join(webDistDir, INDEX_FILE))) {
    throw new Error(`Build da SPA não encontrado: ${INDEX_FILE} ausente em ${webDistDir}. Rode "npm run build" na raiz.`);
  }

  // wildcard:false registra uma rota por arquivo existente; o que não existe cai no 404 do Nest, sem alcançar o disco com input do usuário.
  await fastify.register(fastifyStatic, {
    root: webDistDir,
    wildcard: false,
    index: false,
    dotfiles: "ignore",
    cacheControl: false,
    setHeaders: (reply, filePath) => {
      reply.header("cache-control", isHashedAsset(webDistDir, filePath) ? IMMUTABLE_CACHE_CONTROL : REVALIDATE_CACHE_CONTROL);
    },
  });

  fastify.route({
    method: ["GET", "HEAD"],
    url: "/*",
    handler: (request, reply) => (isApiPath(request.url) || isAssetPath(request.url) ? reply.callNotFound() : sendIndex(reply)),
  });
}

function sendIndex(reply: FastifyReply): FastifyReply {
  return reply.sendFile(INDEX_FILE);
}

function isHashedAsset(webDistDir: string, filePath: string): boolean {
  return path.relative(webDistDir, filePath).split(path.sep)[0] === "assets";
}

function isAssetPath(url: string): boolean {
  return pathnameOf(url).startsWith("/assets/");
}

function isApiPath(url: string): boolean {
  const pathname = pathnameOf(url);
  return API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function pathnameOf(url: string): string {
  return url.split("?")[0] ?? "";
}
