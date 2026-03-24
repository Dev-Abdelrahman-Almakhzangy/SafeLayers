# ─── Stage 1: Build ───────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ─── Stage 2: Serve with nginx ────────────────────────
FROM nginx:alpine

# Security: remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf
RUN apk add --no-cache gettext
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy built app
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

ENV BACKEND_API_URL=http://backend:5000

HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["/bin/sh", "-c", "envsubst '$$BACKEND_API_URL' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
