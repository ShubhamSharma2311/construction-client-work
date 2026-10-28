-- The shared guard from the previous migration read NEW."allocatedPaise" on Trip rows
-- (and the reverse), which PL/pgSQL rejects even in a branch that does not apply, so every
-- soft delete failed. Replace it with one function per table.
DROP TRIGGER "Trip_soft_delete_guard" ON "Trip";
DROP TRIGGER "CustomerPayment_soft_delete_guard" ON "CustomerPayment";
DROP FUNCTION "refuse_soft_delete_with_allocations"();

CREATE FUNCTION "refuse_trip_soft_delete_with_allocations"() RETURNS trigger AS $$
BEGIN
  IF OLD."deletedAt" IS NULL AND NEW."deletedAt" IS NOT NULL AND NEW."receivedPaise" > 0 THEN
    RAISE EXCEPTION 'Trip % still has allocations; remove them before deleting', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'Trip_soft_delete_without_allocations';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "refuse_payment_soft_delete_with_allocations"() RETURNS trigger AS $$
BEGIN
  IF OLD."deletedAt" IS NULL AND NEW."deletedAt" IS NOT NULL AND NEW."allocatedPaise" > 0 THEN
    RAISE EXCEPTION 'Payment % still has allocations; remove them before deleting', NEW.id
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'CustomerPayment_soft_delete_without_allocations';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Trip_soft_delete_guard" BEFORE UPDATE OF "deletedAt" ON "Trip"
  FOR EACH ROW EXECUTE FUNCTION "refuse_trip_soft_delete_with_allocations"();
CREATE TRIGGER "CustomerPayment_soft_delete_guard" BEFORE UPDATE OF "deletedAt" ON "CustomerPayment"
  FOR EACH ROW EXECUTE FUNCTION "refuse_payment_soft_delete_with_allocations"();

