# Smart Waste LK

Smart Waste LK is a proof-of-concept platform for Sri Lankan municipalities to orchestrate day-to-day solid waste collection. It combines a MongoDB-backed REST API for planning and telemetry with a React + Material UI control centre that operations teams and field crews can access.

## Features
- Route optimisation that filters bins by fill threshold, respects truck capacity, and returns the shortest greedy path.
- Collector shift companion that surfaces the current route, highlights pending bins, and records collection events.
- Ward-level scheduling, billing, and analytics modules scaffolded for future expansion.
- Seed script that generates realistic bin data around Colombo for demo and testing purposes.

## Tech Stack
- **Backend**: Node.js, Express 5, Mongoose 8, MongoDB Atlas, Zod for input validation (ready for use), Morgan for request logging.
- **Frontend**: React 19 with Vite, Tailwind CSS, Material UI 6, Lucide icons, React Router 7.
- **Tooling**: Nodemon for local backend reloads, Jest + Supertest placeholders, PostCSS, ESLint, dotenv-based configuration.

## Repository Layout
```
backend/        Express API, database access, domain modules
frontend/       Vite React application and UI assets
scripts/        Utility scripts (e.g., database seeders)
```

## Prerequisites
- Node.js 18+ (tested with the current LTS release)
- npm 9+
- A MongoDB instance (Atlas cluster or local) with network access for the API

## Environment Variables
Create `backend/.env` with the following keys:
```
PORT=4000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>/<database>?retryWrites=true&w=majority
NODE_ENV=development
```

> Keep credentials out of version control. The project ships with a `.env` file for convenience; replace the URI with your own cluster URL before deploying.

## Getting Started

### 1. Install dependencies
```powershell
cd smart-waste
cd backend
npm install
cd ..\frontend
npm install
```

### 2. Seed demo data (optional)
Populate MongoDB with sample bins to exercise the optimiser:
```powershell
cd ..\scripts
node seedLK.js
```
The script relies on `backend/.env` to locate your database.

### 3. Run the backend API
```powershell
cd ..\backend
npm run dev
```
- Serves the REST API on `http://localhost:4000`.
- Auto reloads when files under `backend/src` change.

### 4. Run the frontend
In a new shell:
```powershell
cd smart-waste\frontend
npm run dev
```
- Vite starts the UI on `http://localhost:5173` and proxies `/api` requests to the backend when configured.

## Key API Endpoints
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | `/health` | Simple service heartbeat. |
| POST   | `/api/ops/routes/optimize` | Generates a route plan for a ward. Body accepts `ward`, optional `date`, `truckId`. |
| GET    | `/api/ops/routes/:truckId/today` | Returns today's route for the specified truck (default `TRUCK-01`). |
| POST   | `/api/ops/collections` | Records a collection event and marks the stop as visited. |
| GET    | `/api/schedules` | Placeholder endpoint returning an empty array. |
| GET    | `/api/billing/bills` | Placeholder endpoint returning an empty array. |
| GET    | `/api/analytics/summary` | Placeholder endpoint returning an empty object. |

## Frontend Highlights
- **Manage Collection Ops**: Control-centre view to run optimisations, review key metrics, and brief crews.
- **Collector View**: Field-friendly checklist that syncs with the API, tracks progress, and handles offline-friendly error states.
- Shared Material UI theme aligned with Tailwind colour tokens for consistent styling.

## Testing & Quality
- Backend: `npm test` inside `backend/` runs Jest with Supertest scaffolding (no suites yet).
- Frontend: `npm run lint` inside `frontend/` validates code style via ESLint.

## Deployment Notes
- Set `NODE_ENV=production` and supply production MongoDB credentials for the API.
- Run `npm run build` inside `frontend/` to generate a static bundle ready for hosting.
- Ensure CORS settings in `backend/src/app.js` align with the domains you deploy to.

## Future Enhancements
1. Replace greedy routing with a capacity-constrained VRP solver for better optimisation.
2. Back the analytics, billing, and scheduling modules with real datasets.
3. Add authentication, role-based access, and audit logs.
4. Extend automated test coverage for service and routing logic.
