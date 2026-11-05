# Compila la app web y la sirve con Caddy (HTTPS automático con Let's Encrypt).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Llave de TomTom para la capa de tráfico (opcional; sin ella no sale el botón).
ARG VITE_TOMTOM_KEY=""
ENV VITE_TOMTOM_KEY=$VITE_TOMTOM_KEY
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
