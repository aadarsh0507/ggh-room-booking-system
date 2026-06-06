# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hospital Room Booking & Allotment Module — a full-stack web application for managing hospital room/bed admissions, patient workflows, and billing, with integration to an external Hospital Information System (HIS).

## Development Commands

### Backend (from `backend/`)
```bash
npm run dev       # Start with nodemon (auto-reload)
npm start         # Production start
npm test          # Run Jest tests
npm run lint      # ESLint on src/**/*.js
npm run seed      # Seed database with sample data
npm run docs      # Generate Swagger API docs
```

### Frontend (from `frontend/`)
```bash
npm start         # Dev server on port 3000
npm run build     # Production build
npm test          # React Testing Library tests
```

### Docker (full stack)
```bash
docker-compose -f docker/docker-compose.yml up    # Start all services
docker-compose -f docker/docker-compose.yml down  # Stop all services
```

### Run a single backend test
```bash
cd backend && npx jest tests/unit/auth.test.js
```

## Architecture

**Stack:** React 18 frontend → Express/Node.js backend → MongoDB (primary) + MSSQL (HIS integration)

**Backend layout** (`backend/src/`):
- `server.js` — Express app, middleware registration, Socket.IO setup, route mounting, Swagger on `/api-docs`
- `config/database.js` — Dual DB connection: Mongoose for MongoDB and `mssql` for HIS queries
- `models/` — Mongoose schemas: Room, Bed, Patient, Admission, User, Billing, Transfer, AuditLog, Notification
- `routes/` — Thin route files mapping HTTP verbs to controller methods
- `controllers/` — Request/response handling, delegates to services
- `services/` — All business logic lives here (availability aggregation, admission workflows, billing calculations, HIS sync)
- `middleware/auth.js` — `protect()` (JWT verification) and `authorize(...roles)` (RBAC) composable middleware
- `middleware/logger.js` — Morgan HTTP logging + audit logger that fires on POST/PUT/DELETE

**Frontend layout** (`frontend/src/`):
- `pages/` — Full-page views: Dashboard, RoomAvailability, BookingWizard, PatientSearch, Reports, Settings, Login
- `components/` — Reusable UI components
- `App.js` — React Router v6 route definitions

**Real-time:** Socket.IO server (backend) ↔ Socket.IO client (frontend) for live room status updates and notifications.

**RBAC roles:** Admin, Receptionist, Nurse, Billing, Doctor — enforced via `authorize()` middleware on each route.

**HIS integration:** Patient data is searched/synced from the HIS via MSSQL. Billing records set `syncedToHIS: true` once pushed back to HIS.

## Key Conventions

- All async route handlers use `async/await`; errors are passed to Express error middleware via `next(err)`
- Audit logging is automatic for POST/PUT/DELETE — the `logger.js` middleware records user, action, entity, IP, and old/new values
- Room/bed status transitions drive availability: `Available → Occupied → Cleaning → Available`; ICU/isolation rooms have gender and isolation flags
- The `branch` field on Room and User supports multi-branch hospital deployments
- API base URL is `http://localhost:5000/api`; frontend proxies or uses axios baseURL set from env

## Environment Setup

Copy `backend/.env.example` to `backend/.env` and fill in:
- `MONGO_URI` — MongoDB connection string
- `JWT_SECRET` — Secret for signing tokens
- `HIS_API_URL` / `HIS_API_TOKEN` — External HIS credentials (can be mocked for local dev)
- `FRONTEND_URL` — Used for CORS (`http://localhost:3000` locally)

## Testing

- Backend unit/integration tests live in `tests/unit/` and use Jest + Supertest
- A Postman collection (`tests/Hospital_Room_Booking_API.postman_collection.json`) covers full API flows
- Frontend uses React Testing Library via `react-scripts test`
