# Smart Waste LK

Smart Waste LK is a proof-of-concept platform for Sri Lankan municipalities to orchestrate day-to-day solid waste collection. It combines a MongoDB-backed REST API for planning and telemetry with a React + Material UI control centre that operations teams and field crews can access.

## Features
- Route optimisation that filters bins by fill threshold, respects truck capacity, and returns the shortest greedy path.
- Collector shift companion that surfaces the current route, highlights pending bins, and records collection events.
- Resident authentication and self-service registration with role-based dashboards for admins and field crews.
- Special waste collection scheduling with slot availability checks, booking confirmation, and payment tracking.
- Resident billing workspace with Stripe-powered checkout sessions and transaction history.
- Ward-level scheduling and analytics modules scaffolded for future expansion.
- Waste analytics workspace for municipal officers with configurable filters and exportable insights.
- Seed script that generates realistic bin data and demo user accounts for rapid onboarding.

## Tech Stack
- **Backend**: Node.js, Express 5, Mongoose 8, MongoDB Atlas, Zod for input validation (ready for use), Morgan for request logging.
- **Frontend**: React 19 with Vite, Tailwind CSS, Material UI 6, Lucide icons, React Router 7.
- **Tooling**: Nodemon for local backend reloads, Jest + Supertest placeholders, PostCSS, ESLint, dotenv-based configuration.

## Recent Enhancements
- **Authentication refresh**: Login and registration flows now enforce active accounts, hash passwords with bcrypt, lock accounts for 15 minutes after three failed attempts, and route users to role-aware dashboards.
- **Special collection flow**: `/api/schedules/special/*` endpoints expose item policies, availability calculation, booking confirmation, and request history. The React page (`frontend/src/pages/Schedule/SpecialCollectionPage.jsx`) guides residents through slot selection, simulates the payment UI, and dispatches confirmation emails to both residents and the field operations inbox.
- **Waste analytics suite**: Admin-only `/api/analytics/config` and `/api/analytics/report` endpoints serve filter metadata and aggregated waste statistics (household, regional, recycling splits). The React Reports page (`frontend/src/pages/Analytics/ReportsPage.jsx`) offers chart/table visualisations with PDF and Excel exports powered by `jspdf` and `xlsx`.
- **Resident billing and payments**: `/api/billing/*` endpoints list outstanding invoices, create Stripe Checkout sessions, sync payment status back to MongoDB, and surface digital receipts. The new React "My Bills" workspace (`frontend/src/pages/Billing/BillingPage.jsx`) launches Stripe checkout, surfaces cancellations/failures, and exposes downloadable receipts via `/api/billing/transactions/:transactionId/receipt`.

Run `npm install` inside `frontend` to pull the new report export dependencies, then `npm run lint` to ensure the UI compiles cleanly.

## Demo Accounts
Execute `node scripts/seedLK.js` to populate demo data. The seeder provisions:
- **Admin**: `admin@smartwaste.lk` / `Admin@123`
- **Field crew**: `collector@smartwaste.lk` / `Collector@123`
- **Resident**: `resident@smartwaste.lk` / `Resident@123`

Use these credentials to explore the new authentication, scheduling, billing, and analytics flows locally. The seed script also synthesises 1.3k+ `WasteCollectionRecord` documents so the analytics module has realistic data to aggregate.

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
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PAYMENT_METHODS=card,link
COLLECTION_AUTHORITY_EMAIL=ops-team@smartwaste.lk
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=secret
SMTP_FROM="Smart Waste Billing" <no-reply@smartwaste.lk>
```

> Keep credentials out of version control. The project ships with a `.env` file for convenience; replace the URI with your own cluster URL before deploying.
> Stripe integration is optional for local development; omit `STRIPE_SECRET_KEY` to disable checkout (billing endpoints will return configuration errors instead of failing silently).
> SMTP settings and `COLLECTION_AUTHORITY_EMAIL` are optional. When provided, the platform emails residents and operations staff after special collections are booked and sends receipts for successful bill payments.

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
The script relies on `backend/.env` to locate your database and now seeds demo invoices for the resident account.

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
| POST   | `/api/auth/login` | Authenticates a user; rejects inactive accounts. |
| POST   | `/api/auth/register` | Creates a regular user account after validation. |
| POST   | `/api/ops/routes/optimize` | Generates a route plan for a ward or city selection. |
| GET    | `/api/ops/routes/:truckId/today` | Returns today's route for the specified truck (default `TRUCK-01`). |
| POST   | `/api/ops/collections` | Records a collection event and marks the stop as visited. |
| GET    | `/api/schedules/special/config` | Returns allowed item types, slot policies, and payment thresholds for special collections. |
| POST   | `/api/schedules/special/availability` | Checks slot availability for a resident's preferred window. |
| POST   | `/api/schedules/special/confirm` | Books a slot and records payment metadata when required. |
| GET    | `/api/schedules/special/my` | Lists a resident's historical and upcoming special collection requests. |
| GET    | `/api/analytics/config` | Supplies available regions, waste types, billing models, and default date ranges (admin only). |
| POST   | `/api/analytics/report` | Generates waste analytics aggregates for the supplied filters (admin only). |
| GET    | `/api/billing/bills` | Returns outstanding and paid bills for the authenticated resident. |
| POST   | `/api/billing/checkout` | Creates a Stripe Checkout session for a selected bill and returns the hosted payment URL. |
| GET    | `/api/billing/checkout/:sessionId` | Syncs Stripe payment status and updates local bill and transaction records. |
| GET    | `/api/billing/transactions/:transactionId/receipt` | Returns a structured receipt (with Stripe receipt URL when available) for auditing and downloads. |

## Frontend Highlights
- **Manage Collection Ops**: Control-centre view to run optimisations, review key metrics, and brief crews.
- **Collector View**: Field-friendly checklist that syncs with the API, tracks progress, and handles offline-friendly error states.
- **Special Collections**: Resident-facing booking flow that validates slots, handles simulated payments, and surfaces history.
- **My Bills**: Resident workspace to view outstanding invoices, launch Stripe Checkout, track cancellations, and download receipts once paid.
- **Reports & Analytics**: Admin dashboard to generate charts/tables, toggle sections, and export PDF/Excel snapshots.
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

## Design Critique SPA (Report.html)

A standalone, static "Design Critique & Improvement" single-page report is included at the repository root as `Report.html`.

Files:
- Report.html — top-level file: ./Report.html

How to view the report (from the repository root)

Option A — Quick static server (recommended)
# From the repository root (where README.md and Report.html live)
# Node (no install required)
npx http-server . -p 8080
# or Python 3
python -m http.server 8080

Open: http://127.0.0.1:8080/Report.html

Option B — Open directly in the browser
Open the file at: ./Report.html
Note: some browsers restrict local file access for CDN assets — use Option A if Chart.js or Tailwind fail to load.

Option C — GitHub Pages (public hosting)
After pushing the repo, the report will be available at:
https://<github-username>.github.io/<repo-name>/Report.html
(Enable GitHub Pages in the repository settings or publish the file to the gh-pages branch.)
