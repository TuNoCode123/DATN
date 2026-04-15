-- Seed credit packages (idempotent via ON CONFLICT).
-- Kept in sync with prisma/seed.ts::seedCreditPackages so production deploys
-- (which don't run `prisma db seed`) get the storefront packages automatically.
INSERT INTO "credit_packages" ("id", "name", "description", "priceUsd", "baseCredits", "bonusCredits", "active", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('pkg_starter',  'Starter',  '200 credits',              2.00,  200,  0,    true, 1, NOW(), NOW()),
  ('pkg_standard', 'Standard', '500 + 50 bonus credits',   5.00,  500,  50,   true, 2, NOW(), NOW()),
  ('pkg_plus',     'Plus',     '1,000 + 200 bonus',        10.00, 1000, 200,  true, 3, NOW(), NOW()),
  ('pkg_pro',      'Pro',      '2,000 + 600 bonus',        20.00, 2000, 600,  true, 4, NOW(), NOW()),
  ('pkg_mega',     'Mega',     '5,000 + 2,000 bonus',      50.00, 5000, 2000, true, 5, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- Backfill a UserCredit row (balance = schema default 100) for every existing
-- user that doesn't have one yet. Idempotent: re-running the migration is a no-op.
INSERT INTO "user_credits" ("id", "userId", "balance", "updatedAt")
SELECT 'uc_' || u."id", u."id", 100, NOW()
FROM "users" u
ON CONFLICT ("userId") DO NOTHING;
