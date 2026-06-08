# Hospital Room Booking — Production Dockerfile
# React 18 (CRA) frontend + Express/Node.js backend
#
# Build:  docker build -t hospital-app:latest .
# Run:    docker run -d -p 3010:5000 --env-file ~/env/roombooking.env hospital-app:latest

# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps

# .env.production is included (allowed in .dockerignore) and sets REACT_APP_API_URL=/api
COPY frontend/ ./

ARG VITE_API_URL=
ARG VITE_ORGANIZER_EMAIL=

# Explicitly set REACT_APP_API_URL so CRA bakes /api into the bundle.
# This ensures API calls always go to the same origin that serves the page,
# whether deployed on 172.16.6.214:3010 or any other host.
RUN REACT_APP_API_URL=/api npm run build

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache libaio libnsl libc6-compat

WORKDIR /app

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/src ./src

# Express looks for frontend at /app/frontend/build (path.join(__dirname, '../frontend/build'))
COPY --from=frontend-builder /frontend/build ./frontend/build

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:5000/api/auth/login || exit 1

CMD ["node", "src/server.js"]
