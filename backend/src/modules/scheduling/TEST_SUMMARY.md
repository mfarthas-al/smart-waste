# Scheduling Module Test Summary

**Last verified:** October 25, 2025  
**Location:** `backend/src/modules/scheduling`

---

## Testing Stack
- **Framework:** Jest (Node test environment) with built-in mocking utilities.
- **Mocked dependencies:** Stripe SDK, Mongoose models (`User`, `SpecialCollectionRequest`, `SpecialCollectionPayment`, `Bill`), municipal mailer service, and PDF receipt generator.
- **Validation:** Zod schemas are exercised through the controller flows to confirm request validation paths.

---

## Coverage Snapshot

Executed with:

```bash
cd backend
npm test -- --runTestsByPath src/modules/scheduling/__tests__/controller.test.js src/modules/scheduling/__tests__/receipt.test.js --coverage --collectCoverageFrom=src/modules/scheduling/**/*.js
```

| File            | % Stmts | % Branch | % Funcs | % Lines | Notes |
|-----------------|---------|----------|---------|---------|-------|
| controller.js   | 69.97%  | 52.66%   | 78.94%  | 69.97%  | Remaining gaps are late-stage error paths (lines 1009-1018, 1032, 1049-1052). |
| receipt.js      | 93.97%  | 61.01%   | 91.66%  | 93.75%  | Missing branches relate to optional field rendering (lines 57-62). |
| routes.js       | 100%    | 100%     | 100%    | 100%    | Fully exercised via controller tests. |
| **Module total**| **72.86%** | **54.11%** | **82.00%** | **72.74%** | Focused additions to remaining branches will raise statements/lines above the 80% target. |

HTML and LCOV artefacts are available at `backend/coverage/lcov-report/src/modules/scheduling/` for deeper inspection.

---

## Test Case Catalogue

| Area | Test Case | Type | Description |
|------|-----------|------|-------------|
| **Configuration** | Returns allowed items and slot config | Positive | Ensures `/special/config` exposes item catalogue plus slot window metadata. |
| **Availability** | Valid request returns slots and payment details | Positive | Confirms slot generation, pricing engine, and resident info echo. |
| | Rejects disallowed item types | Negative | Exercises policy guard (`ITEM_NOT_ALLOWED`). |
| | Missing user returns 404 | Error | Validates user resolution and inactivity checks. |
| **Booking** | Enforces payment success when required | Negative | Stripe-required bookings must supply `paymentStatus=success`. |
| | Creates booking when payment not required | Positive | Yard waste (no payment) path produces scheduling record and emails. |
| | Rejects unavailable slot | Edge | Simulates race where resident selects a slot no longer available. |
| **Checkout (Stripe)** | Short-circuits when payments disabled | Error | Works when `STRIPE_SECRET_KEY` absent. |
| | Returns checkout session data | Positive | End-to-end Stripe session creation, payment doc persistence, metadata sanitisation. |
| | Detects when slot just became full | Edge | Concurrency guard returns HTTP 409. |
| | Notes when payment not required | Positive | Zero-cost flows bypass Stripe gracefully. |
| **Checkout Sync** | Completes booking on successful payment | Positive | Mimics redirect with paid session, updates payment status, generates receipt buffer. |
| | Reports pending payments | Edge | Handles processing Stripe intents without failing. |
| | Flags malformed metadata | Negative | Validates metadata sanitizer rejecting incomplete payloads. |
| **Resident history** | Returns resident requests | Positive | `/special/my` fetch ensures lean query and ownership. |
| **Receipt downloads** | Streams receipt for authorised resident | Positive | Produces PDF buffer and sets download headers. |
| | Blocks other residents | Security | Confirms authorisation layer prevents cross-account access. |
| **Receipt helper** | Generates populated PDF | Positive | Validates PDF buffer generation with complete data set. |
| | Handles falsy/invalid numeric fields | Edge | Ensures formatting collapses invalid numbers without throwing. |

### Test Categories at a Glance
- **Positive paths:** Successful configuration fetch, slot discovery, booking, checkout, receipt download (10 cases).
- **Negative paths:** Disallowed items, missing users, failed payment, malformed metadata, unauthorised downloads (6 cases).
- **Edge cases:** Slot capacity races, pending Stripe statuses, optional numeric fields, zero-cost bookings (5 cases).
- **Security/Error handling:** Authentication via user lookup, authorisation on receipt downloads, service disablement (3 cases).

---

## Reliability Levers
- **Deterministic mocks** ensure external dependencies (Stripe, Mongoose, mailer) cannot introduce flakiness while still verifying side effects such as emails or billing records.
- **Zod-backed validation** is exercised throughout to assert correct HTTP status codes and error payload structures.
- **Receipt tests** confirm binary output integrity by asserting for non-empty buffers instead of brittle snapshot comparisons.
- **Concurrency scenarios** (slot fills, pending payments) are explicitly simulated to mirror production timing race conditions.

---

## Running the Suite

```bash
cd backend
npm test -- --runTestsByPath src/modules/scheduling/__tests__/controller.test.js src/modules/scheduling/__tests__/receipt.test.js --coverage --collectCoverageFrom=src/modules/scheduling/**/*.js
```

Use `--watch` or `--runInBand` as needed during development. Coverage artefacts will be regenerated under `backend/coverage/`.

---

## Next Coverage Targets
1. Add tests for the controller’s late-stage error handlers (lines 1009-1018, 1032, 1049-1052) to push statements/lines above 80%.
2. Exercise the optional receipt metadata branches (lines 57-62) to close the remaining branch gap in `receipt.js`.
3. Consider integration tests that stitch availability → checkout → download flows to complement the unit coverage.
