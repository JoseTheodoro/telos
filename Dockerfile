FROM node:26-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY server/package.json server/
RUN npm ci
COPY . .
RUN npm run build

FROM node:26-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace @telos/server

FROM node:26-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS runtime
# O layout do repositório é mantido para o WEB_DIST_DIR padrão resolver a partir de server/dist sem configuração.
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/dist/web ./dist/web
WORKDIR /app/server
USER node
EXPOSE 8080
CMD ["node", "--import", "./dist/Infrastructure/Observability/instrumentation.js", "./dist/main.js"]
