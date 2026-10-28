CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE');
CREATE TABLE "Transaction" (
 "id" TEXT PRIMARY KEY,
 "type" "TransactionType" NOT NULL,
 "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0),
 "category" TEXT NOT NULL,
 "description" TEXT,
 "occurredAt" TIMESTAMPTZ(3) NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "Transaction_occurredAt_type_idx" ON "Transaction"("occurredAt", "type");
CREATE TABLE "LoginAttempt" ("id" TEXT PRIMARY KEY, "count" INTEGER NOT NULL DEFAULT 0, "blockedUntil" TIMESTAMPTZ(3) NOT NULL);
