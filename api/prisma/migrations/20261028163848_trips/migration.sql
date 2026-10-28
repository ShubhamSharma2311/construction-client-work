-- CreateEnum
CREATE TYPE "PayMode" AS ENUM ('CASH', 'ONLINE');

-- CreateEnum
CREATE TYPE "TripKind" AS ENUM ('TRIP', 'OPENING_BALANCE');

-- CreateEnum
CREATE TYPE "CustomerPaymentKind" AS ENUM ('PAYMENT', 'WRITE_OFF');

-- CreateTable
CREATE TABLE "Trip" (
    "id" SERIAL NOT NULL,
    "kind" "TripKind" NOT NULL DEFAULT 'TRIP',
    "tripDate" DATE NOT NULL,
    "customerId" INTEGER NOT NULL,
    "driverId" INTEGER,
    "tractorId" INTEGER,
    "khetId" INTEGER,
    "amountPaise" INTEGER NOT NULL,
    "receivedPaise" INTEGER NOT NULL DEFAULT 0,
    "quantityNote" TEXT,
    "notes" TEXT,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPayment" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "paidOn" DATE NOT NULL,
    "kind" "CustomerPaymentKind" NOT NULL DEFAULT 'PAYMENT',
    "mode" "PayMode",
    "amountPaise" INTEGER NOT NULL,
    "allocatedPaise" INTEGER NOT NULL DEFAULT 0,
    "reference" TEXT,
    "notes" TEXT,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" SERIAL NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "tripId" INTEGER NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trip_customerId_tripDate_idx" ON "Trip"("customerId", "tripDate");

-- CreateIndex
CREATE INDEX "Trip_tripDate_idx" ON "Trip"("tripDate");

-- CreateIndex
CREATE INDEX "CustomerPayment_customerId_paidOn_idx" ON "CustomerPayment"("customerId", "paidOn");

-- CreateIndex
CREATE INDEX "CustomerPayment_paidOn_idx" ON "CustomerPayment"("paidOn");

-- CreateIndex
CREATE INDEX "PaymentAllocation_tripId_idx" ON "PaymentAllocation"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_tripId_key" ON "PaymentAllocation"("paymentId", "tripId");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_tractorId_fkey" FOREIGN KEY ("tractorId") REFERENCES "Tractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_khetId_fkey" FOREIGN KEY ("khetId") REFERENCES "Khet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "CustomerPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity rules the API also checks. The database is the last line of
-- defence: money can never be received twice or allocated across customers.
-- ---------------------------------------------------------------------------

ALTER TABLE "Trip" ADD CONSTRAINT "Trip_amount_positive" CHECK ("amountPaise" > 0);
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_received_within_amount"
  CHECK ("receivedPaise" >= 0 AND "receivedPaise" <= "amountPaise");
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_kind_fields" CHECK (
  ("kind" = 'TRIP' AND "driverId" IS NOT NULL AND "tractorId" IS NOT NULL AND "khetId" IS NOT NULL)
  OR ("kind" = 'OPENING_BALANCE' AND "driverId" IS NULL AND "tractorId" IS NULL AND "khetId" IS NULL)
);
CREATE UNIQUE INDEX "Trip_one_opening_balance_per_customer"
  ON "Trip" ("customerId") WHERE "kind" = 'OPENING_BALANCE' AND "deletedAt" IS NULL;

ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_amount_positive"
  CHECK ("amountPaise" > 0);
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_allocated_within_amount"
  CHECK ("allocatedPaise" >= 0 AND "allocatedPaise" <= "amountPaise");
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_mode_matches_kind"
  CHECK (("kind" = 'WRITE_OFF') = ("mode" IS NULL));
CREATE UNIQUE INDEX "CustomerPayment_reference_key"
  ON "CustomerPayment" ("reference") WHERE "reference" IS NOT NULL AND "deletedAt" IS NULL;

ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_amount_positive"
  CHECK ("amountPaise" > 0);

-- Keeps Trip.receivedPaise and CustomerPayment.allocatedPaise equal to the sum of
-- allocations, and refuses allocations that cross customers or touch deleted rows.
-- The CHECK constraints above then refuse any allocation that would overfill either side.
CREATE FUNCTION "apply_payment_allocation"() RETURNS trigger AS $$
DECLARE
  trip_customer INT;
  trip_deleted TIMESTAMPTZ;
  payment_customer INT;
  payment_deleted TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'PaymentAllocation rows are immutable; delete and insert instead'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'PaymentAllocation_immutable';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT "customerId", "deletedAt" INTO trip_customer, trip_deleted
      FROM "Trip" WHERE id = NEW."tripId";
    SELECT "customerId", "deletedAt" INTO payment_customer, payment_deleted
      FROM "CustomerPayment" WHERE id = NEW."paymentId";
    IF trip_customer IS DISTINCT FROM payment_customer THEN
      RAISE EXCEPTION 'Allocation links trip % and payment % of different customers',
        NEW."tripId", NEW."paymentId"
        USING ERRCODE = 'check_violation', CONSTRAINT = 'PaymentAllocation_same_customer';
    END IF;
    IF trip_deleted IS NOT NULL OR payment_deleted IS NOT NULL THEN
      RAISE EXCEPTION 'Allocation touches a deleted trip or payment'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'PaymentAllocation_live_rows';
    END IF;
    UPDATE "Trip" SET "receivedPaise" = "receivedPaise" + NEW."amountPaise" WHERE id = NEW."tripId";
    UPDATE "CustomerPayment" SET "allocatedPaise" = "allocatedPaise" + NEW."amountPaise"
      WHERE id = NEW."paymentId";
    RETURN NEW;
  END IF;

  UPDATE "Trip" SET "receivedPaise" = "receivedPaise" - OLD."amountPaise" WHERE id = OLD."tripId";
  UPDATE "CustomerPayment" SET "allocatedPaise" = "allocatedPaise" - OLD."amountPaise"
    WHERE id = OLD."paymentId";
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PaymentAllocation_apply"
  BEFORE INSERT OR UPDATE OR DELETE ON "PaymentAllocation"
  FOR EACH ROW EXECUTE FUNCTION "apply_payment_allocation"();
