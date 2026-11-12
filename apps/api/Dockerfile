# API del Atlas — imagen de producción (Fase 6).
# El importador y las migraciones resuelven la raíz del repo desde la
# ubicación de dist/ (../../..), así que la imagen conserva la
# estructura del repositorio: /app/apps/api/dist, /app/db/migrations,
# /app/apps/web/public/data/catalog.json, /app/data/generated y
# /app/data/source (el Excel, para la verificación de integridad).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/api apps/api
RUN npm run build --workspace=@atlas/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY db db
COPY apps/web/public/data/catalog.json apps/web/public/data/catalog.json
COPY data/generated/sources.json data/generated/sources.json
COPY data/source data/source
WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]
