CREATE TABLE "MonthlyGoal" (
 "month" TEXT PRIMARY KEY,
 "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0),
 "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
