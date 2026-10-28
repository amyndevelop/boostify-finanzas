CREATE TABLE "BeloImport" (
 "id" TEXT PRIMARY KEY,
 "gmailMessageId" TEXT NOT NULL,
 "transactionId" TEXT,
 "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "BeloImport_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BeloImport_gmailMessageId_key" ON "BeloImport"("gmailMessageId");
CREATE UNIQUE INDEX "BeloImport_transactionId_key" ON "BeloImport"("transactionId");
