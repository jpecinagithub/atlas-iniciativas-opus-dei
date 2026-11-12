# Web del Atlas — imagen de producción (Fase 6).
# Compila la app con la ruta base del despliegue (/atlas/) y la sirve
# con un nginx propio que además redirige /api/ al contenedor de la
# API. El nginx del host solo ve este contenedor (127.0.0.1:8180).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/web apps/web
ARG VITE_BASE_PATH=/atlas/
ENV VITE_BASE_PATH=${VITE_BASE_PATH}
RUN npm run build --workspace=@atlas/web

FROM nginx:alpine
COPY deploy/nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
