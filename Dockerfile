# ============================================================================
# Hospital Room Booking — Production Dockerfile
# Stack: React 18 (CRA) frontend + Express/Node.js backend + MySQL + OracleDB HIS
#
# Stage 1: Build React frontend  → /frontend/build
# Stage 2: Production image      → Express serves API + static files on one port
#
# Build:
#   docker build -t hospital-app:latest .
#
# Run:
#   docker run -d -p 3010:5000 --env-file backend/.env hospital-app:latest
# ============================================================================

# ============================================================================
# STAGE 1: Build React Frontend (Create React App)
# ============================================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./

# Declare build args passed by Jenkinsfile (VITE_* kept for CI compatibility; CRA uses REACT_APP_*)
ARG VITE_API_URL=
ARG VITE_ORGANIZER_EMAIL=

# Build CRA app — output goes to /frontend/build
# All /api calls go to same origin (Express handles both frontend + API)
RUN REACT_APP_API_URL= npm run build


# ============================================================================
# STAGE 2: Production Image
# ============================================================================
FROM node:20-alpine

# Install OracleDB runtime dependencies (libaio required by oracledb)
RUN apk add --no-cache libaio libnsl libc6-compat

WORKDIR /app

# Install backend production dependencies only
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY backend/src ./src

# Copy React build into the path Express expects: /app/frontend/build
COPY --from=frontend-builder /frontend/build ./frontend/build

# Health check via Express
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:${PORT:-5000}/api/auth || exit 1

ENV NODE_ENV=production

# Express listens on PORT (default 5000)
EXPOSE 5000

CMD ["node", "src/server.js"]
