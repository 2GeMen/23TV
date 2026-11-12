# Use the custom gateway; standalone server.js bypasses its access controls.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOST=127.0.0.1
ENV ACCOUNT_DATA_DIR=/data/accounts ADMIN_DATA_DIR=/data/admin WATCH_DATA_DIR=/data/watch
COPY --from=builder --chown=node:node /app /app
RUN mkdir -p /data/accounts /data/admin /data/watch && chown -R node:node /data
USER node
EXPOSE 8080
CMD ["node", "server/gateway.cjs"]
