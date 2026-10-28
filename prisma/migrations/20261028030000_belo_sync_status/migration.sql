CREATE TABLE "IntegrationSyncState" (
 "id" TEXT PRIMARY KEY,
 "lastCheckedAt" TIMESTAMPTZ(3) NOT NULL,
 "complete" BOOLEAN NOT NULL,
 "pendingReviewCount" INTEGER NOT NULL CHECK ("pendingReviewCount" BETWEEN 0 AND 50)
);
