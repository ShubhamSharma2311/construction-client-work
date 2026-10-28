
-- AlterTable
ALTER TABLE "CustomerPayment" ADD COLUMN     "deliveryTripId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPayment_deliveryTripId_key" ON "CustomerPayment"("deliveryTripId");

-- AddForeignKey
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_deliveryTripId_fkey" FOREIGN KEY ("deliveryTripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The allocation trigger now locks the trip and payment it checks, so a concurrent
-- soft delete cannot slip in between the check and the update.
CREATE OR REPLACE FUNCTION "apply_payment_allocation"() RETURNS trigger AS $$
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
      FROM "Trip" WHERE id = NEW."tripId" FOR UPDATE;
    SELECT "customerId", "deletedAt" INTO payment_customer, payment_deleted
      FROM "CustomerPayment" WHERE id = NEW."paymentId" FOR UPDATE;
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

-- A soft-deleted trip or payment must not keep allocations: its money would still count
-- on one side of the ledger and not the other.
CREATE FUNCTION "refuse_soft_delete_with_allocations"() RETURNS trigger AS $$
BEGIN
  IF OLD."deletedAt" IS NULL AND NEW."deletedAt" IS NOT NULL
     AND ((TG_TABLE_NAME = 'Trip' AND NEW."receivedPaise" > 0)
       OR (TG_TABLE_NAME = 'CustomerPayment' AND NEW."allocatedPaise" > 0)) THEN
    RAISE EXCEPTION '% % still has allocations; remove them before deleting', TG_TABLE_NAME, NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'soft_delete_without_allocations';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Trip_soft_delete_guard" BEFORE UPDATE OF "deletedAt" ON "Trip"
  FOR EACH ROW EXECUTE FUNCTION "refuse_soft_delete_with_allocations"();
CREATE TRIGGER "CustomerPayment_soft_delete_guard" BEFORE UPDATE OF "deletedAt" ON "CustomerPayment"
  FOR EACH ROW EXECUTE FUNCTION "refuse_soft_delete_with_allocations"();

-- A write-off only forgives specific trips; an unallocated one would invent credit.
-- Checked at commit, because the payment row is written before its allocations.
CREATE FUNCTION "write_off_fully_allocated"() RETURNS trigger AS $$
DECLARE
  current_row "CustomerPayment"%ROWTYPE;
BEGIN
  SELECT * INTO current_row FROM "CustomerPayment" WHERE id = NEW.id;
  IF current_row."kind" = 'WRITE_OFF' AND current_row."deletedAt" IS NULL
     AND current_row."allocatedPaise" <> current_row."amountPaise" THEN
    RAISE EXCEPTION 'Write-off % must be fully allocated to trips', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'CustomerPayment_write_off_allocated';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "CustomerPayment_write_off_allocated"
  AFTER INSERT OR UPDATE ON "CustomerPayment"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "write_off_fully_allocated"();
