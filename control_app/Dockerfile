FROM node:22-bookworm-slim AS frontend-build

WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=18221 \
    TELEMETRIKA_DB_PATH=/app/data/telemetrika.sqlite \
    TELEMETRIKA_SETTINGS_PATH=/app/data/settings.json

WORKDIR /app
COPY package.json server.js glonass_sync.js start.sh ./
COPY --from=frontend-build /build/public ./public

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 18221
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:18221/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

ENTRYPOINT ["./start.sh"]
