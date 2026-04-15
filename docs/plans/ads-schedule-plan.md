# Ads Schedule Module — Plan

Schedule ad/announcement emails from the app, fan out to all (or a targeted subset of) users via AWS. Sending is throttled to **5 emails/sec** even though the SES account limit is 13/s — leaves headroom for transactional mail, bounces, and warm-up.

---

## 1. Architecture

```
Admin UI → NestJS API → DB (Ad + AdSchedule)
                              │
                              ▼
                    EventBridge (cron, every 1 min)
                              │
                              ▼
                    Dispatcher Lambda
                      (find due schedules,
                       resolve audience,
                       emit 1 SQS msg / user)
                              │
                              ▼
                    SQS Standard (send queue)  ──►  DLQ (after 3 retries)
                              │
                              ▼
                    Sender Lambda
                      reservedConcurrency = 1
                      batchSize = 5, window = 1s
                      paced loop: 200ms / email
                              │
                              ▼
                         SES SendEmail
                              │
                              ▼
                    DB (AdDelivery log)
                              ▲
                              │
           SES config set → SNS → Bounce/Complaint Lambda
```

### Why throttle at Sender Lambda (not SQS / not Redis token bucket)

| Option | Approach | Verdict |
|---|---|---|
| A. SQS message delay | Dispatcher staggers delay per msg | Fragile — delay ≠ rate |
| **B. Reserved concurrency = 1 + sleep** | Single Sender instance, 200ms between sends | ✅ Simple, precise, chosen |
| C. Redis/DynamoDB token bucket | Any concurrency, each send takes a token | Overkill until >20/s |

Stick with B. Switch to C only if SES limit rises and we need >~20/s.

---

## 2. Data Model (Prisma)

```prisma
model Ad {
  id             String   @id @default(cuid())
  title          String
  subject        String
  htmlBody       String   @db.Text
  textBody       String?  @db.Text
  audienceFilter Json     // { role?, tagIds?, locale?, userIds? }
  status         AdStatus @default(DRAFT)
  createdBy      String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  schedules      AdSchedule[]
}

model AdSchedule {
  id           String            @id @default(cuid())
  adId         String
  ad           Ad                @relation(fields: [adId], references: [id])
  runAt        DateTime          // first/next run, UTC
  timezone     String            @default("UTC")
  recurrence   AdRecurrence      @default(ONCE)
  cronExpr     String?           // when recurrence = CRON
  status       AdScheduleStatus  @default(PENDING)
  nextRunAt    DateTime?
  lastRunAt    DateTime?
  audienceSize Int?              // snapshot at dispatch
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  deliveries   AdDelivery[]
}

model AdDelivery {
  id            String             @id @default(cuid())
  adId          String
  scheduleId    String
  schedule      AdSchedule         @relation(fields: [scheduleId], references: [id])
  userId        String
  email         String
  status        AdDeliveryStatus   @default(QUEUED)
  sesMessageId  String?
  error         String?
  queuedAt      DateTime @default(now())
  sentAt        DateTime?

  @@unique([scheduleId, userId])   // idempotency
  @@index([scheduleId, status])
}

enum AdStatus           { DRAFT ACTIVE ARCHIVED }
enum AdRecurrence       { ONCE DAILY WEEKLY CRON }
enum AdScheduleStatus   { PENDING QUEUED RUNNING SENT FAILED CANCELED }
enum AdDeliveryStatus   { QUEUED SENT BOUNCED COMPLAINED FAILED }
```

---

## 3. Backend (NestJS)

- `ads.module` — admin CRUD for `Ad`
- `ads-schedule.module` — CRUD for `AdSchedule`, cancel, preview audience count
- `ads-delivery.module` — read-only endpoints for delivery progress / reports
- Internal endpoints (token-auth) for Lambdas:
  - `POST /internal/ads/dispatch` — Dispatcher calls this if we want business logic in Nest rather than in the Lambda
  - `POST /internal/ads/deliveries/:id/status` — Sender/Bounce Lambda reports outcome

All admin endpoints gated behind existing admin guard.

---

## 4. AWS Pieces

### 4.1 EventBridge
- Rule: `rate(1 minute)`
- Target: Dispatcher Lambda

### 4.2 Dispatcher Lambda
Pseudocode:
```
schedules = db.find(AdSchedule where
  nextRunAt <= now AND status = PENDING)

for s in schedules:
  lock row (SELECT … FOR UPDATE SKIP LOCKED)
  users = resolveAudience(s.ad.audienceFilter)
  db.insert AdDelivery rows (status=QUEUED) upsert on (scheduleId,userId)
  for u in users:
    sqs.sendMessage({ scheduleId: s.id, adId: s.adId, userId: u.id })
  s.status = RUNNING
  s.lastRunAt = now
  s.audienceSize = users.length
  s.nextRunAt = computeNext(s.recurrence, s.cronExpr)  // null if ONCE
  save
```
Idempotency: `AdDelivery` unique `(scheduleId, userId)` prevents duplicate queue on retries.

### 4.3 SQS
- **Standard** (not FIFO — order doesn't matter, cheaper)
- `VisibilityTimeout = 60s`
- DLQ after `maxReceiveCount = 3`
- Message body: `{ scheduleId, adId, userId }` — **one user per message**

### 4.4 Sender Lambda
```ts
const RATE = Number(process.env.SES_RATE_LIMIT_PER_SEC ?? 5);
const SLEEP_MS = 1000 / RATE;  // 200ms for 5/s

export const handler = async (event: SQSEvent) => {
  const failures: SQSBatchItemFailure[] = [];
  for (const record of event.Records) {
    const start = Date.now();
    try {
      const { scheduleId, adId, userId } = JSON.parse(record.body);
      await sendOne({ scheduleId, adId, userId });
    } catch (err) {
      failures.push({ itemIdentifier: record.messageId });
    }
    const elapsed = Date.now() - start;
    if (elapsed < SLEEP_MS) await sleep(SLEEP_MS - elapsed);
  }
  return { batchItemFailures: failures };
};
```

Lambda config:
- `reservedConcurrency: 1`   ← guarantees single instance → hard rate cap
- `batchSize: 5`
- `maximumBatchingWindowInSeconds: 1`
- `functionResponseTypes: ['ReportBatchItemFailures']` (partial retry)
- Memory 256 MB, timeout 60s

### 4.5 SES
- Verified domain + DKIM
- Configuration set with event destination → SNS → Bounce/Complaint Lambda
- Template rendered in Sender Lambda (Handlebars) — allows per-user `{{name}}`, unsubscribe URL
- `List-Unsubscribe` header required (one-click)

### 4.6 Bounce/Complaint Lambda
SNS → Lambda → update `AdDelivery.status = BOUNCED | COMPLAINED`, set `User.adsOptIn = false` on complaint.

---

## 5. Throughput & Capacity

- **Rate**: 5 email/s = 300/min = 18 000/hour
- **100 000 users** → ~5.5 hours to fully send
- **Dispatcher overlap guard**: before queuing a schedule, check `AdDelivery where scheduleId=X AND status=QUEUED`. If > 0, skip (previous run still draining).
- **Schedule completion**: a background job (or the Bounce Lambda path) flips `AdSchedule.status` from `RUNNING → SENT` once `COUNT(AdDelivery where status=QUEUED) = 0`.

---

## 6. Config (env vars)

```
SES_RATE_LIMIT_PER_SEC      = 5
SENDER_LAMBDA_CONCURRENCY   = 1
SENDER_SQS_BATCH_SIZE       = 5
SENDER_SQS_BATCH_WINDOW_SEC = 1
SQS_VISIBILITY_TIMEOUT_SEC  = 60
SQS_DLQ_MAX_RECEIVES        = 3
DISPATCHER_CRON             = rate(1 minute)
```

Tuning is env-var only — no code change needed when SES ceiling rises.

---

## 7. Admin UI

- `/admin-ads` — list ads, status, last sent
- `/admin-ads/new` — editor (subject, HTML body, audience filter)
- `/admin-ads/:id/schedule` — schedule form (run-at, recurrence)
- `/admin-ads/:id/report` — progress bar: `sent / audienceSize`, bounce/complaint counts, failed list

---

## 8. Tradeoffs

- **SQS Standard vs FIFO**: Standard. FIFO caps at 300 TPS/group — fine, but ordering isn't needed and FIFO costs more.
- **Reserved concurrency = 1**: cold start ~500ms on idle invocations. Fine because we're rate-limited anyway; no provisioned concurrency.
- **Per-user message vs batched**: per-user messages cost more SQS calls but give precise per-user retry and clean pacing. For 100k users = 100k SQS requests ≈ $0.04 — negligible.
- **SES `SendBulkTemplatedEmail` alternative**: cheaper, 50 dests/call, but weaker per-recipient retry and tracking. Not chosen — we want `AdDelivery` rows.

---

## 9. Phases

1. **Phase 1** — Prisma models + migration; admin CRUD for `Ad` and `AdSchedule`
2. **Phase 2** — Audience resolver + preview endpoint (`GET /ads/:id/audience-preview` returns count)
3. **Phase 3** — Dispatcher Lambda + EventBridge + SQS wiring (Terraform)
4. **Phase 4** — Sender Lambda + SES templates + configuration set (rate-limited, 5/s)
5. **Phase 5** — Bounce/complaint SNS + Lambda + opt-out handling
6. **Phase 6** — Admin UI (list, editor, schedule form, delivery report)

---

## 10. Open Questions

- Template engine: Handlebars vs SES native templates? (Lean Handlebars in Lambda — full control.)
- Audience caching: if the same filter runs recurringly, cache user-id list for the window or re-resolve each run? (Re-resolve — new signups should be included.)
- Unsubscribe link: signed JWT or opaque token table? (JWT, stateless.)
- Multi-tenant (if we go B2B later): add `organizationId` to `Ad` now or later?
