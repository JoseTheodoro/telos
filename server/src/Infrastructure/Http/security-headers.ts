import type { FastifyHelmetOptions } from "@fastify/helmet";

const ONE_YEAR_IN_SECONDS = 31_536_000;

export const securityHeadersOptions: FastifyHelmetOptions = {
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "object-src": ["'none'"],
      "base-uri": ["'none'"],
      "frame-ancestors": ["'none'"],
      "font-src": ["'self'"],
      "connect-src": ["'self'"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "style-src": ["'self'", "'unsafe-inline'"],
    },
  },
  hsts: { maxAge: ONE_YEAR_IN_SECONDS, includeSubDomains: true },
  referrerPolicy: { policy: "same-origin" },
};
