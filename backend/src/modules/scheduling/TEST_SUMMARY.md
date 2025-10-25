# Scheduling Module Test Summary

**Last verified:** October 25, 2025  
**Scope:** `backend/src/modules/scheduling`, `frontend/src/pages/Schedule`

---

## Testing Stack
- **Backend (Node + Jest):** Controller and receipt logic run under Jest with manual mocks for Stripe, Mongoose models (`User`, `SpecialCollectionRequest`, `SpecialCollectionPayment`, `Bill`), the municipal mailer, and the PDF receipt helper.
- **Frontend (Vite + Vitest + React Testing Library):** Resident portal flows (`SpecialCollectionPage`, `SpecialCollectionCheckoutResult`) exercise routing, fetch orchestration, and browser APIs with jsdom + vi mocks.
- **Shared validation:** Zod schemas are exercised end-to-end through controller tests; React form tests reuse the same field-level expectations to mirror backend rules.

---

## Coverage Snapshot

### Backend API layer

Executed with:

```bash
cd backend
npm test -- --runTestsByPath src/modules/scheduling/__tests__/controller.test.js src/modules/scheduling/__tests__/receipt.test.js --coverage --collectCoverageFrom=src/modules/scheduling/**/*.js
```

| File            | % Stmts | % Branch | % Funcs | % Lines | Notes |
|-----------------|---------|----------|---------|---------|-------|
| controller.js   | 69.97%  | 52.66%   | 78.94%  | 69.97%  | Gaps remain in late error handlers (lines 1009-1018, 1032, 1049-1052). |
| receipt.js      | 93.97%  | 61.01%   | 91.66%  | 93.75%  | Missed branches cover optional PDF fields (lines 57-62). |
| routes.js       | 100%    | 100%     | 100%    | 100%    | Fully exercised through controller tests. |
| **Module total**| **72.86%** | **54.11%** | **82.00%** | **72.74%** | Target 80% by filling the noted error paths and optional branches. |

HTML and LCOV artefacts live at `backend/coverage/lcov-report/src/modules/scheduling/` for detailed inspection.

### Frontend resident portal

Executed with:

```bash
cd frontend
npx vitest run src/pages/Schedule/_tests_/SpecialCollectionPage.test.jsx src/pages/Schedule/_tests_/SpecialCollectionCheckoutResult.test.jsx --coverage
```

Vitest writes coverage output to `frontend/coverage/`. Regenerate before reporting numbers to keep the summary in sync with UI changes.

---

## Test Case Catalogue

### Backend API scenarios (`backend/src/modules/scheduling`)

| Flow | Scenario | Type | What it verifies |
|------|----------|------|------------------|
| Configuration | `GET /special/config` returns slot settings and allowed items | Happy path | The resident portal receives catalogue data and slot window metadata. |
| Availability | Eligible resident sees available slots with pricing | Happy path | Slot generation, pricing, and resident echo fields are populated. |
| | Disallowed item type is rejected | Negative | `ITEM_NOT_ALLOWED` guard stops banned materials. |
| | Missing or inactive resident returns 404 | Error | User lookup enforces authentication and account status. |
| Booking | Payment-required bookings reject missing payment success | Negative | Prevents creating records unless `paymentStatus=success` when Stripe is mandatory. |
| | Zero-cost booking records the request and emails | Happy path | Yard waste flow persists the request, generates bills, and sends notifications. |
| | Slot already filled returns conflict | Edge | Simulates a race where capacity is exhausted before confirmation. |
| Checkout (Stripe) | Checkout disabled returns early | Error | Absence of `STRIPE_SECRET_KEY` short-circuits payment creation. |
| | Checkout session is created and metadata sanitised | Happy path | Stripe session payload, payment persistence, and metadata sanitation are validated. |
| | Slot fills during checkout creation | Edge | Guards against overbooking by returning HTTP 409. |
| | Free bookings bypass Stripe | Happy path | Zero-cost flows skip session creation gracefully. |
| Checkout sync | Successful redirect finalises booking and generates receipt | Happy path | Payment doc updates, request status changes, and receipt generation succeed. |
| | Pending intent reports pending status | Edge | Handles Stripe intents still processing without erroring. |
| | Malformed metadata is rejected | Negative | `sanitizeMetadata` failures bubble up with a clear error. |
| Resident history | Resident sees only their own requests | Happy path | `/special/my` returns lean documents filtered by user id. |
| Receipt downloads | Authorised resident downloads PDF | Happy path | Streams buffer, sets headers, and increments notification markers. |
| | Other residents are blocked | Security | Cross-account downloads respond with HTTP 403. |
| Receipt helper | Generates populated PDF | Happy path | `generateSpecialCollectionReceipt` returns a non-empty buffer. |
| | Handles missing or invalid numeric fields | Edge | Optional numeric values fall back without crashing. |

### Frontend UI scenarios (`frontend/src/pages/Schedule`)

| Flow | Scenario | Type | What it verifies |
|------|----------|------|------------------|
| SpecialCollectionPage | Empty required fields stop availability check | Validation | Form prevents submission and highlights missing resident details before calling `/special/config`. |
| | Resident can complete a zero-cost booking | Happy path | User edits fields, selects an allowed slot, and completes booking with no payment required. |
| | Configuration fetch failure surfaces an error banner | Error | Network failure on `/special/config` stops the flow and prompts the user. |
| SpecialCollectionCheckoutResult | Missing `session_id` query shows error state | Validation | Landing on the result page without session details displays the “missing checkout session” message. |
| | Successful checkout shows confirmation and downloads receipt | Happy path | Fetches checkout details, renders the success view, and triggers receipt download via blob URL. |
| | Failed checkout displays failure guidance | Error | Cancelled or failed sessions show the “payment not completed” messaging path. |

### Test coverage at a glance
- **Backend happy paths:** Config, availability, booking, checkout, receipt download (9 scenarios).
- **Backend negative / security:** Disallowed items, payment enforcement, malformed metadata, unauthorised receipt access (7 scenarios).
- **Frontend UX:** Form validation, booking success, configuration failure, and post-checkout messaging (6 scenarios).
- **Edge and concurrency:** Slot capacity races, pending payments, optional numeric formatting, zero-cost flows (6 scenarios in total across layers).

---

## Reliability Levers
- **Deterministic mocks** isolate external calls (Stripe, Mongoose, mailer, window APIs) while still asserting side effects such as email dispatch, blob downloads, and notification counters.
- **Validation parity** keeps backend Zod schemas and frontend form rules aligned, reducing drift between API expectations and UI error states.
- **Binary assertions** on receipts verify buffer integrity without fragile snapshot files.
- **Concurrency and cancellation paths** are simulated in both layers to reflect real booking races and payment pending states.

---

## Running the Suite

```bash
# Backend API tests + coverage
cd backend
npm test -- --runTestsByPath src/modules/scheduling/__tests__/controller.test.js src/modules/scheduling/__tests__/receipt.test.js --coverage --collectCoverageFrom=src/modules/scheduling/**/*.js

# Frontend Schedule UI tests + coverage
cd frontend
npx vitest run src/pages/Schedule/_tests_/SpecialCollectionPage.test.jsx src/pages/Schedule/_tests_/SpecialCollectionCheckoutResult.test.jsx --coverage
```

Use Jest’s `--watch` or Vitest’s `--watch` flag during development. Coverage artefacts will regenerate under `backend/coverage/` and `frontend/coverage/` respectively.

---

## Next Coverage Targets
1. Add controller tests for the late error branches (lines 1009-1018, 1032, 1049-1052) to raise backend statements/lines above 80%.
2. Extend receipt tests to exercise optional metadata and attachment fields (lines 57-62) for full branch coverage.
3. Introduce Vitest cases for checkout error banners (expired session, receipt download failure) and for the “slot unavailable after selection” UI hint to improve frontend branch coverage.
