# Payment Flow

How users buy credits in the IELTS AI Platform. Provider: **PayPal** (Orders v2 + Webhooks). Payment unlocks **credits**, which are spent on AI features (pronunciation, grading, chat, translation, etc.).

## Components

**Backend** (`apps/api/src/payments/`)
- `payments.controller.ts` — REST endpoints under `/api/payments`
- `payments.service.ts` — order/capture/webhook orchestration
- `paypal.client.ts` — thin PayPal REST wrapper (OAuth, create/capture order, webhook signature verify)

**Frontend** (`apps/web/src/app/(learner)/credits/page.tsx`)
- Package picker, PayPal Buttons SDK (`@paypal/react-paypal-js`), balance + history.

**Credits** (`apps/api/src/credits/credits.service.ts`)
- `grant()` / `deduct()` mutate `UserCredit.balance` and append a `CreditTransaction` row inside one DB transaction.

**DB models** (`apps/api/prisma/schema.prisma`)
- `CreditPackage` — sellable SKU (price, baseCredits, bonusCredits, active, sortOrder)
- `PaymentOrder` — local mirror of a PayPal order (status, amount, raw payloads, creditsGranted)
- `PaymentWebhookEvent` — idempotency log keyed by PayPal `event.id`
- `UserCredit` / `CreditTransaction` — balance + immutable ledger

`PaymentOrderStatus`: `CREATED → CAPTURED` (happy path) or `FAILED` / `PARTIALLY_REFUNDED` / `REFUNDED`.

`PaymentOrder` also tracks cumulative refund state via `refundedAmountUsd` and `refundedCredits`, so multiple partial refund webhooks compose correctly.

## Happy path (purchase)

```
User           Web (Credits page)        API                 PayPal
 │  pick pkg  ─►                                                   │
 │            │ POST /payments/paypal/orders ─►                    │
 │            │                          │ POST /v2/checkout/orders│
 │            │                          │ ◄── { id, links }       │
 │            │                          │ INSERT PaymentOrder     │
 │            │ ◄── { providerOrderId }  │  (status=CREATED)       │
 │  approve   │  PayPal Buttons popup ──────────────────────────►  │
 │            │ ◄── onApprove(orderID)                             │
 │            │ POST /payments/paypal/orders/:id/capture ─►        │
 │            │                          │ POST .../capture        │
 │            │                          │ ◄── COMPLETED, $X       │
 │            │                          │ verify amount + status  │
 │            │                          │ TX: update order=CAPTURED
 │            │                          │     grant credits       │
 │            │ ◄── { creditsGranted, balance }                    │
```

### Step-by-step

1. **List packages** — `GET /api/payments/packages` returns active `CreditPackage` rows. Frontend renders the grid in `credits/page.tsx`.
2. **Create order** — `POST /api/payments/paypal/orders { packageId }` (JWT-protected).
   - `PaymentsService.createOrder` looks up the package, calls `PayPalClient.createOrder` with `intent: CAPTURE`, then inserts a `PaymentOrder` row in status `CREATED` storing `providerOrderId` and the raw PayPal response in `rawCreate`.
   - Returns `{ providerOrderId, approveUrl, ... }`. The PayPal Buttons SDK uses `providerOrderId` directly — no redirect needed.
3. **User approves in PayPal** — handled by the JS SDK popup. On success, `onApprove({ orderID })` fires.
4. **Capture order** — `POST /api/payments/paypal/orders/:providerOrderId/capture`.
   - Loads the local order, asserts ownership (`ForbiddenException` otherwise).
   - **Idempotent**: if already `CAPTURED`, returns the existing result with `alreadyCaptured: true`. If already `FAILED`, throws `400`.
   - Calls `PayPalClient.captureOrder`. On HTTP error → mark `FAILED`, store error in `rawCapture`, rethrow.
   - **Verifies** PayPal returned `status === 'COMPLETED'` for both the order and the inner capture, AND that `amount.value` matches the local `amountUsd` to 2 decimals. Mismatch → mark `FAILED`, log a warning, throw `400 Payment capture failed verification`. This blocks tampered/spoofed capture flows.
   - On success: in a single DB transaction, set `PaymentOrder.status = CAPTURED`, stamp `capturedAt`, write `creditsGranted`, persist raw capture payload. Then call `CreditsService.grant(userId, baseCredits + bonusCredits, PAYPAL_PURCHASE, orderId, { providerOrderId, packageId })` which atomically increments `UserCredit.balance` and appends a `CreditTransaction`.
   - Returns `{ status, creditsGranted, balance }`. UI shows toast and refreshes balance/history queries.

## Webhook flow (refunds + safety net)

`POST /api/payments/paypal/webhook` — public, no JWT. Requires raw body for signature verification (Nest is configured with `rawBody: true` in `main.ts`).

1. Headers (`paypal-auth-algo`, `paypal-cert-url`, `paypal-transmission-id`, `paypal-transmission-sig`, `paypal-transmission-time`) are required; missing → `400`.
2. Body parsed as JSON → `400` on parse failure.
3. **Signature verification**: `PayPalClient.verifyWebhookSignature` calls `/v1/notifications/verify-webhook-signature` with `PAYPAL_WEBHOOK_ID`. If unset or `verification_status !== 'SUCCESS'` → `400`. This is the only thing keeping a forged `PAYMENT.CAPTURE.REFUNDED` from clawing back random users' credits, so the webhook id env var is mandatory in production.
4. **Idempotency**: insert `PaymentWebhookEvent { eventId, eventType, resourceId, payload }`. The unique index on `eventId` makes duplicate deliveries fail the insert — caught and returned as `{ received: true, duplicate: true }`. Safe to retry from PayPal's side.
5. **Dispatch by event_type**:
   - `PAYMENT.CAPTURE.REFUNDED` / `PAYMENT.CAPTURE.REVERSED` → `handleRefundOrReversal` (see below).
   - `PAYMENT.CAPTURE.COMPLETED` / `PAYMENT.CAPTURE.DENIED` / `CHECKOUT.ORDER.APPROVED` → record-only. The synchronous capture endpoint already handled granting credits; webhooks act as audit trail.
   - Anything else → logged and returned as `{ received: true, ignored: true }`.
6. After successful handling, `PaymentWebhookEvent.processedAt` is stamped.

### Refund / reversal handling

`handleRefundOrReversal` resolves the local `PaymentOrder` by `providerCaptureId` (preferred — refund webhooks include it via `related_ids.capture_id` or the `up` link on the resource) and falls back to `providerOrderId`. Then:

- Already fully `REFUNDED` → no-op.
- Not `CAPTURED` and not `PARTIALLY_REFUNDED` → mark `REFUNDED`, no credit change.
- Otherwise → process as a (possibly partial) refund:
  1. Read the refund amount from `event.resource.amount.value`. If PayPal omits it, fall back to the entire remaining refundable amount.
  2. Clamp the refund to `amountUsd - refundedAmountUsd` (defensive against PayPal sending more than the order is worth).
  3. Prorate credits: `clawback = round((refundAmount / amountUsd) * creditsGranted)`, capped by `creditsGranted - refundedCredits`. **Final refund** (when cumulative refunded amount reaches `amountUsd`) deducts the exact remainder so rounding dust from prior partials is absorbed instead of accumulating.
  4. Update the order: `refundedAmountUsd += refundAmount`, `refundedCredits += clawback`, status flips to `PARTIALLY_REFUNDED` or `REFUNDED` depending on whether the order is fully refunded.
  5. `CreditsService.deduct(userId, clawback, PAYPAL_REFUND, orderId, { partial, refundAmountUsd, ... })`.

**Idempotency**: each PayPal refund event has its own `event.id`, so duplicate deliveries of the same refund are caught by the `PaymentWebhookEvent` unique index *before* this handler runs. Multiple distinct partial refunds against the same order each get their own webhook event and accumulate cleanly via `refundedAmountUsd` / `refundedCredits`.

**Known limitation**: if the user already spent the credits, `deduct` throws `Insufficient credits`. The error is caught and logged — balance is **not** allowed to go negative. The order's refund state is already persisted before the deduct attempt, so a reconciliation job could replay or alert.

## Endpoints summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/api/payments/packages` | JWT | List active credit packages |
| POST | `/api/payments/paypal/orders` | JWT | Create PayPal order for a package |
| POST | `/api/payments/paypal/orders/:providerOrderId/capture` | JWT | Capture an approved order, grant credits |
| GET  | `/api/payments/history?limit&offset` | JWT | User's payment history (paginated) |
| POST | `/api/payments/paypal/webhook` | none (signed) | PayPal event ingest |

## Configuration

Backend (`apps/api/.env`):
- `PAYPAL_BASE_URL` — defaults to `https://api-m.sandbox.paypal.com`
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` — REST app credentials
- `PAYPAL_WEBHOOK_ID` — required for webhook signature verification

Frontend (`apps/web/.env.local`):
- `NEXT_PUBLIC_PAYPAL_CLIENT_ID` — public client id for the JS SDK

## Security notes

- **Amount tampering** is blocked by re-checking the captured amount against the local `PaymentOrder.amountUsd` on the server. The frontend never tells the API how much to grant.
- **Replay** is blocked by `PaymentWebhookEvent.eventId` uniqueness and by capture-endpoint idempotency on `PaymentOrder.status`.
- **Cross-user capture** is blocked by the `userId` ownership check in `captureOrder`.
- **Forged webhooks** are blocked by mandatory PayPal signature verification (no fallback path).
- The capture endpoint is the source of truth for granting credits; webhooks are a safety net + the only path for refunds.

## Failure modes worth knowing

| Symptom | Cause | Where it surfaces |
|---|---|---|
| Order stays `CREATED` forever | User abandoned after order create, never approved | Harmless; cleanup job could expire stale `CREATED` rows |
| `Payment capture failed verification` | PayPal returned non-COMPLETED or amount mismatch | Order marked `FAILED`, raw payload in `rawCapture` for debugging |
| `Insufficient credits` during refund | User already spent the refunded credits | Logged error, order still flipped to `REFUNDED`/`PARTIALLY_REFUNDED`, balance left as-is |
| Multiple partial refunds for one order | Merchant issued several PayPal refunds against the same capture | Each event accumulates `refundedAmountUsd` / `refundedCredits`; order stays `PARTIALLY_REFUNDED` until cumulative refund equals the order amount, then flips to `REFUNDED` |
| Webhook 400 "signature invalid" | `PAYPAL_WEBHOOK_ID` wrong/unset, or wrong env (sandbox vs live) | Server logs; PayPal will retry per its schedule |
