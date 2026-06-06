# ============================================================================
# Hospital Room Booking - Single Unified Dockerfile
# ============================================================================
# Multi-stage build that creates a production image containing:
# - React frontend (static build)
# - Node.js/Express backend (API server)
# - Database drivers (MySQL, Oracle)
# - All dependencies
#
# Usage:
#   docker build -t hospital-app:latest -f docker/Dockerfile .
#   docker run -d -p 3010:80 --env-file .env hospital-app:latest
#
# Architecture:
#   Stage 1: Build React frontend (generates static assets)
#   Stage 2: Build Express backend with React assets included
#   Result: Single container, port 80, serves both frontend + API
# ============================================================================

# ============================================================================
# STAGE 1: Build React Frontend
# ============================================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm install

# Copy frontend source
COPY frontend .

# Build React app with relative API URL
# This allows the app to work on any host/port
RUN REACT_APP_API_URL=/api npm run build

# Output: /frontend/build contains all static assets


# ============================================================================
# STAGE 2: Production Image (Backend + Frontend)
# ============================================================================
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copy backend source code
COPY backend/src ./src

# Copy React build from Stage 1
# Express will serve these static files
COPY --from=frontend-builder /frontend/build ./frontend/build

# Expose port 80 (HTTP)
# Container internal port: 80
# Mapped to external port: 3010 (via docker-compose or -p flag)
EXPOSE 80

# Environment
ENV NODE_ENV=production

# Start Express server
# server.js handles:
#   - Serving React static files (/)
#   - API routes (/api/*)
#   - Socket.IO real-time updates
#   - Database connections (MySQL + Oracle)
CMD ["node", "src/server.js"]

# ============================================================================
# What This Container Includes
# ============================================================================
# Frontend:
#   - React 18 app (pre-built, static files)
#   - CSS, JavaScript, images optimized for production
#   - Runs on port 80 via Express.static()
#
# Backend:
#   - Express.js server
#   - JWT authentication
#   - MongoDB via Mongoose (optional)
#   - MySQL connection pool
#   - Oracle HIS integration
#   - Socket.IO for real-time updates
#   - Audit logging
#   - RBAC (role-based access control)
#
# Size: ~300MB (uncompressed)
# ============================================================================

# ============================================================================
# How It Works at Runtime
# ============================================================================
# 1. Container starts Express server on port 80
#
# 2. Browser accesses http://server:3010
#    → Routed to container port 80
#    → Express serves /index.html (React app)
#    → React bundle loads: main.js, main.css
#    → React app starts in browser
#
# 3. React makes API calls to /api/auth/login
#    → Request goes to http://server:3010/api/auth/login
#    → Express receives on port 80
#    → Routes to backend controller
#    → Returns JSON response
#    → React updates UI
#
# 4. Socket.IO real-time updates
#    → WebSocket connection on same port
#    → Backend broadcasts room availability changes
#    → Frontend updates live
#
# 5. Database queries
#    → Backend connects to MySQL: DB_HOST:3306
#    → Backend connects to Oracle HIS: SQL_HOST:1521
#    → Results sent to frontend via API
# ============================================================================

# ============================================================================
# Environment Variables Required
# ============================================================================
# Critical for internal LAN deployment:
#   PORT=80
#   NODE_ENV=production
#   INTERNAL_LAN=true
#
# Database:
#   DB_HOST=172.16.6.214
#   DB_PORT=3306
#   DB_USER=ggh
#   DB_PASSWORD=...
#   DB_NAME=room_booking
#
#   SQL_HOST=172.16.7.85:1521/dsoft
#   SQL_USER=ellider
#   SQL_PASSWORD=...
#
# Application:
#   FRONTEND_URL=http://172.16.6.214:3010
#   SOCKET_CORS_ORIGIN=http://172.16.6.214:3010
#   JWT_SECRET=...
#
# See: /home/ggh/env/roombooking.env
# ============================================================================

# ============================================================================
# Docker Compose Usage
# ============================================================================
# File: docker/docker-compose.yml
#
# services:
#   app:
#     build:
#       context: .
#       dockerfile: docker/Dockerfile
#     ports:
#       - "8080:80"
#     env_file:
#       - backend/.env
#     environment:
#       - INTERNAL_LAN=true
#
# Command: docker-compose up -d
# ============================================================================

# ============================================================================
# Server Deployment Usage
# ============================================================================
# 1. Build image:
#    docker build -t hospital-app:latest -f docker/Dockerfile .
#
# 2. Transfer to server (optional, if not using registry):
#    docker save hospital-app:latest | gzip > hospital-app.tar.gz
#    scp hospital-app.tar.gz server:/home/ggh/
#    docker load -i /home/ggh/hospital-app.tar.gz
#
# 3. Run on server:
#    docker run -d \
#      --name hospital-app \
#      --restart unless-stopped \
#      --env-file /home/ggh/env/roombooking.env \
#      -p 3010:80 \
#      hospital-app:latest
#
# 4. Verify:
#    curl http://localhost:3010
#    docker logs hospital-app
#    http://server:3010 (in browser)
# ============================================================================
