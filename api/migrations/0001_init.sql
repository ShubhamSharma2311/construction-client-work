-- SQLite schema for the ledger's Durable Object; generated from prisma/schema.prisma,
-- plus the rules Prisma cannot express (CHECKs, partial indexes, triggers, the totals view).
-- CreateTable
CREATE TABLE "AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "route" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "familyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ip" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "businessName" TEXT NOT NULL,
    "businessStartDate" DATETIME NOT NULL,
    "openingCashPaise" INTEGER NOT NULL DEFAULT 0,
    "openingOnlinePaise" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Setting_singleton" CHECK ("id" = 1),
    CONSTRAINT "Setting_opening_non_negative" CHECK ("openingCashPaise" >= 0 AND "openingOnlinePaise" >= 0)
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "phone" TEXT,
    "village" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Tractor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "regNumber" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "joinedOn" DATETIME NOT NULL,
    "leftOn" DATETIME,
    "defaultTractorId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Driver_defaultTractorId_fkey" FOREIGN KEY ("defaultTractorId") REFERENCES "Tractor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Driver_left_after_joined" CHECK ("leftOn" IS NULL OR "leftOn" >= "joinedOn")
);

-- CreateTable
CREATE TABLE "DriverSalaryRate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "driverId" INTEGER NOT NULL,
    "monthlyPaise" INTEGER NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverSalaryRate_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DriverSalaryRate_positive" CHECK ("monthlyPaise" > 0),
    CONSTRAINT "DriverSalaryRate_month_start" CHECK (strftime('%d', "effectiveFrom") = '01')
);

-- CreateTable
CREATE TABLE "Khet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Labourer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "shareBasisPoints" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Partner_share_range" CHECK ("shareBasisPoints" IS NULL OR "shareBasisPoints" BETWEEN 0 AND 10000)
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL DEFAULT 'TRIP',
    "tripDate" DATETIME NOT NULL,
    "customerId" INTEGER NOT NULL,
    "driverId" INTEGER,
    "tractorId" INTEGER,
    "khetId" INTEGER,
    "amountPaise" INTEGER NOT NULL,
    "receivedPaise" INTEGER NOT NULL DEFAULT 0,
    "quantityNote" TEXT,
    "notes" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Trip_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Trip_tractorId_fkey" FOREIGN KEY ("tractorId") REFERENCES "Tractor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Trip_khetId_fkey" FOREIGN KEY ("khetId") REFERENCES "Khet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Trip_amount_positive" CHECK ("amountPaise" > 0),
    CONSTRAINT "Trip_received_within_amount" CHECK ("receivedPaise" >= 0 AND "receivedPaise" <= "amountPaise"),
    CONSTRAINT "Trip_kind_fields" CHECK ( ("kind" = 'TRIP' AND "driverId" IS NOT NULL AND "tractorId" IS NOT NULL AND "khetId" IS NOT NULL) OR ("kind" = 'OPENING_BALANCE' AND "driverId" IS NULL AND "tractorId" IS NULL AND "khetId" IS NULL) )
);

-- CreateTable
CREATE TABLE "CustomerPayment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" INTEGER NOT NULL,
    "paidOn" DATETIME NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PAYMENT',
    "mode" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "allocatedPaise" INTEGER NOT NULL DEFAULT 0,
    "reference" TEXT,
    "notes" TEXT,
    "deliveryTripId" INTEGER,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomerPayment_deliveryTripId_fkey" FOREIGN KEY ("deliveryTripId") REFERENCES "Trip" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CustomerPayment_amount_positive" CHECK ("amountPaise" > 0),
    CONSTRAINT "CustomerPayment_allocated_within_amount" CHECK ("allocatedPaise" >= 0 AND "allocatedPaise" <= "amountPaise"),
    CONSTRAINT "CustomerPayment_mode_matches_kind" CHECK (("kind" = 'WRITE_OFF') = ("mode" IS NULL))
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "paymentId" INTEGER NOT NULL,
    "tripId" INTEGER NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "CustomerPayment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentAllocation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentAllocation_amount_positive" CHECK ("amountPaise" > 0)
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "category" TEXT NOT NULL,
    "spentOn" DATETIME NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "driverId" INTEGER,
    "tractorId" INTEGER,
    "labourerId" INTEGER,
    "dieselMl" INTEGER,
    "hourMeter" INTEGER,
    "periodFrom" DATETIME,
    "periodTo" DATETIME,
    "reference" TEXT,
    "notes" TEXT,
    "tractorLoanId" INTEGER,
    "emiMonth" DATETIME,
    "lateFeePaise" INTEGER,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_tractorId_fkey" FOREIGN KEY ("tractorId") REFERENCES "Tractor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_labourerId_fkey" FOREIGN KEY ("labourerId") REFERENCES "Labourer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_tractorLoanId_fkey" FOREIGN KEY ("tractorLoanId") REFERENCES "TractorLoan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_amount_positive" CHECK ("amountPaise" > 0),
    CONSTRAINT "Expense_labour_has_labourer" CHECK (("category" = 'LABOUR') = ("labourerId" IS NOT NULL)),
    CONSTRAINT "Expense_diesel_fields" CHECK (("category" = 'DIESEL') = ("dieselMl" IS NOT NULL) AND ("category" <> 'DIESEL' OR ("tractorId" IS NOT NULL AND "driverId" IS NOT NULL AND "dieselMl" > 0))),
    CONSTRAINT "Expense_notes_required" CHECK ("category" NOT IN ('POLICE', 'OTHER', 'EMERGENCY', 'TRACTOR_SERVICE') OR length(trim(coalesce("notes", ''))) > 0),
    CONSTRAINT "Expense_service_fields" CHECK (("category" = 'TRACTOR_SERVICE' OR "hourMeter" IS NULL) AND ("category" <> 'TRACTOR_SERVICE' OR "tractorId" IS NOT NULL)),
    CONSTRAINT "Expense_emi_fields" CHECK ((("category" = 'TRACTOR_EMI') = ("tractorLoanId" IS NOT NULL)) AND ("category" <> 'TRACTOR_EMI' OR "tractorId" IS NOT NULL) AND ("category" = 'TRACTOR_EMI' OR ("emiMonth" IS NULL AND "lateFeePaise" IS NULL)) AND ("emiMonth" IS NULL OR strftime('%d', "emiMonth") = '01') AND ("lateFeePaise" IS NULL OR ("lateFeePaise" >= 0 AND "lateFeePaise" < "amountPaise")))
);

-- CreateTable
CREATE TABLE "TractorLoan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tractorId" INTEGER NOT NULL,
    "lender" TEXT NOT NULL,
    "emiPaise" INTEGER NOT NULL,
    "emiDay" INTEGER NOT NULL,
    "firstEmiMonth" DATETIME NOT NULL,
    "totalInstallments" INTEGER NOT NULL,
    "closedOn" DATETIME,
    "closedReason" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TractorLoan_tractorId_fkey" FOREIGN KEY ("tractorId") REFERENCES "Tractor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TractorLoan_values" CHECK ("emiPaise" > 0 AND "emiDay" BETWEEN 1 AND 28 AND "totalInstallments" BETWEEN 1 AND 120 AND strftime('%d', "firstEmiMonth") = '01'),
    CONSTRAINT "TractorLoan_closure_pair" CHECK (("closedOn" IS NULL) = ("closedReason" IS NULL))
);

-- CreateTable
CREATE TABLE "DriverAccrual" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "driverId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "month" DATETIME,
    "accruedOn" DATETIME NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "note" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DriverAccrual_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DriverAccrual_kind_rules" CHECK ( ("kind" = 'MONTH_SALARY' AND "month" IS NOT NULL AND strftime('%d', "month") = '01' AND "amountPaise" >= 0) OR ("kind" = 'BONUS' AND "month" IS NULL AND "amountPaise" > 0) OR ("kind" = 'OPENING_BALANCE' AND "month" IS NULL AND "amountPaise" <> 0) )
);

-- CreateTable
CREATE TABLE "DriverPayment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "driverId" INTEGER NOT NULL,
    "paidOn" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "forMonth" DATETIME,
    "bonusAccrualId" INTEGER,
    "notes" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DriverPayment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DriverPayment_bonusAccrualId_fkey" FOREIGN KEY ("bonusAccrualId") REFERENCES "DriverAccrual" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DriverPayment_rules" CHECK ( "amountPaise" > 0 AND (("type" = 'BONUS') = ("bonusAccrualId" IS NOT NULL)) AND ("forMonth" IS NULL OR strftime('%d', "forMonth") = '01') )
);

-- CreateTable
CREATE TABLE "PartnerTxn" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "partnerId" INTEGER NOT NULL,
    "txnDate" DATETIME NOT NULL,
    "direction" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "notes" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PartnerTxn_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PartnerTxn_amount_positive" CHECK ("amountPaise" > 0)
);

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_createdAt_idx" ON "PasswordReset"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "LoginAttempt_ip_at_idx" ON "LoginAttempt"("ip", "at");

-- CreateIndex
CREATE INDEX "Customer_nameKey_idx" ON "Customer"("nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "Tractor_regNumber_key" ON "Tractor"("regNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_defaultTractorId_key" ON "Driver"("defaultTractorId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverSalaryRate_driverId_effectiveFrom_key" ON "DriverSalaryRate"("driverId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Khet_nameKey_key" ON "Khet"("nameKey");

-- CreateIndex
CREATE INDEX "Trip_customerId_tripDate_idx" ON "Trip"("customerId", "tripDate");

-- CreateIndex
CREATE INDEX "Trip_tripDate_idx" ON "Trip"("tripDate");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPayment_deliveryTripId_key" ON "CustomerPayment"("deliveryTripId");

-- CreateIndex
CREATE INDEX "CustomerPayment_customerId_paidOn_idx" ON "CustomerPayment"("customerId", "paidOn");

-- CreateIndex
CREATE INDEX "CustomerPayment_paidOn_idx" ON "CustomerPayment"("paidOn");

-- CreateIndex
CREATE INDEX "PaymentAllocation_tripId_idx" ON "PaymentAllocation"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_tripId_key" ON "PaymentAllocation"("paymentId", "tripId");

-- CreateIndex
CREATE INDEX "Expense_spentOn_idx" ON "Expense"("spentOn");

-- CreateIndex
CREATE INDEX "Expense_category_spentOn_idx" ON "Expense"("category", "spentOn");

-- CreateIndex
CREATE INDEX "Expense_tractorId_spentOn_idx" ON "Expense"("tractorId", "spentOn");

-- CreateIndex
CREATE INDEX "Expense_driverId_spentOn_idx" ON "Expense"("driverId", "spentOn");

-- CreateIndex
CREATE INDEX "TractorLoan_tractorId_idx" ON "TractorLoan"("tractorId");

-- CreateIndex
CREATE INDEX "DriverAccrual_driverId_accruedOn_idx" ON "DriverAccrual"("driverId", "accruedOn");

-- CreateIndex
CREATE UNIQUE INDEX "DriverPayment_bonusAccrualId_key" ON "DriverPayment"("bonusAccrualId");

-- CreateIndex
CREATE INDEX "DriverPayment_driverId_paidOn_idx" ON "DriverPayment"("driverId", "paidOn");

-- CreateIndex
CREATE INDEX "DriverPayment_paidOn_idx" ON "DriverPayment"("paidOn");

-- CreateIndex
CREATE INDEX "PartnerTxn_partnerId_txnDate_idx" ON "PartnerTxn"("partnerId", "txnDate");

-- CreateIndex
CREATE INDEX "PartnerTxn_txnDate_idx" ON "PartnerTxn"("txnDate");

-- Partial unique indexes (from the Postgres migrations).
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer" ("phone") WHERE "phone" IS NOT NULL;
CREATE UNIQUE INDEX "Trip_one_opening_balance_per_customer" ON "Trip" ("customerId") WHERE "kind" = 'OPENING_BALANCE' AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "CustomerPayment_reference_key" ON "CustomerPayment" ("reference") WHERE "reference" IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "TractorLoan_one_open_per_tractor" ON "TractorLoan" ("tractorId") WHERE "closedOn" IS NULL;
CREATE UNIQUE INDEX "Expense_one_payment_per_emi_month" ON "Expense" ("tractorLoanId", "emiMonth") WHERE "emiMonth" IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "DriverAccrual_one_salary_per_month" ON "DriverAccrual" ("driverId", "month") WHERE "kind" = 'MONTH_SALARY' AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "DriverAccrual_one_opening_balance" ON "DriverAccrual" ("driverId") WHERE "kind" = 'OPENING_BALANCE' AND "deletedAt" IS NULL;

-- Allocations keep each trip's receivedPaise and each payment's allocatedPaise in step; the
-- CHECK rules on Trip and CustomerPayment then refuse any allocation that overfills either.
CREATE TRIGGER "PaymentAllocation_immutable" BEFORE UPDATE ON "PaymentAllocation"
BEGIN
  SELECT RAISE(ABORT, 'PaymentAllocation_immutable: allocations are immutable; delete and insert instead');
END;

CREATE TRIGGER "PaymentAllocation_apply_insert" BEFORE INSERT ON "PaymentAllocation"
BEGIN
  SELECT RAISE(ABORT, 'PaymentAllocation_same_customer: allocation links a trip and a payment of different customers')
  WHERE (SELECT "customerId" FROM "Trip" WHERE "id" = NEW."tripId")
    IS NOT (SELECT "customerId" FROM "CustomerPayment" WHERE "id" = NEW."paymentId");
  SELECT RAISE(ABORT, 'PaymentAllocation_live_rows: allocation touches a deleted trip or payment')
  WHERE (SELECT "deletedAt" FROM "Trip" WHERE "id" = NEW."tripId") IS NOT NULL
     OR (SELECT "deletedAt" FROM "CustomerPayment" WHERE "id" = NEW."paymentId") IS NOT NULL;
  UPDATE "Trip" SET "receivedPaise" = "receivedPaise" + NEW."amountPaise" WHERE "id" = NEW."tripId";
  UPDATE "CustomerPayment" SET "allocatedPaise" = "allocatedPaise" + NEW."amountPaise"
    WHERE "id" = NEW."paymentId";
END;

CREATE TRIGGER "PaymentAllocation_apply_delete" BEFORE DELETE ON "PaymentAllocation"
BEGIN
  UPDATE "Trip" SET "receivedPaise" = "receivedPaise" - OLD."amountPaise" WHERE "id" = OLD."tripId";
  UPDATE "CustomerPayment" SET "allocatedPaise" = "allocatedPaise" - OLD."amountPaise"
    WHERE "id" = OLD."paymentId";
END;

CREATE TRIGGER "Trip_soft_delete_guard" BEFORE UPDATE OF "deletedAt" ON "Trip"
WHEN OLD."deletedAt" IS NULL AND NEW."deletedAt" IS NOT NULL AND NEW."receivedPaise" > 0
BEGIN
  SELECT RAISE(ABORT, 'Trip_soft_delete_without_allocations: trip still has allocations; remove them before deleting');
END;

CREATE TRIGGER "CustomerPayment_soft_delete_guard" BEFORE UPDATE OF "deletedAt" ON "CustomerPayment"
WHEN OLD."deletedAt" IS NULL AND NEW."deletedAt" IS NOT NULL AND NEW."allocatedPaise" > 0
BEGIN
  SELECT RAISE(ABORT, 'CustomerPayment_soft_delete_without_allocations: payment still has allocations; remove them before deleting');
END;

-- A discount (write-off) must stay fully set against trips. Postgres checked that at commit;
-- SQLite has no commit-time triggers, so the payments and trips services hold the rule
-- (assertWriteOffCovered, and the refusal to release a trip that carries a write-off).

-- A customer's standing from live rows; the balance and dues queries both read it.
CREATE VIEW "CustomerTotals" AS
SELECT c."id" AS "customerId",
       COALESCE(t.billed, 0) AS billed,
       COALESCE(p.paid, 0) AS paid,
       COALESCE(t.billed, 0) - COALESCE(p.paid, 0) AS balance,
       COALESCE(t.due, 0) AS due,
       COALESCE(p.credit, 0) AS credit,
       t."oldestDueDate"
FROM "Customer" c
LEFT JOIN (
  SELECT "customerId",
         SUM("amountPaise") AS billed,
         SUM("amountPaise" - "receivedPaise") AS due,
         MIN("tripDate") FILTER (WHERE "receivedPaise" < "amountPaise") AS "oldestDueDate"
  FROM "Trip" WHERE "deletedAt" IS NULL GROUP BY "customerId"
) t ON t."customerId" = c."id"
LEFT JOIN (
  SELECT "customerId",
         SUM("amountPaise") AS paid,
         COALESCE(SUM("amountPaise" - "allocatedPaise") FILTER (WHERE "kind" = 'PAYMENT'), 0) AS credit
  FROM "CustomerPayment" WHERE "deletedAt" IS NULL GROUP BY "customerId"
) p ON p."customerId" = c."id";
