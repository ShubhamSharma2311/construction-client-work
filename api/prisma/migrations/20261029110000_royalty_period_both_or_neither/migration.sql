-- A royalty period is either both dates or neither; one end alone cannot be checked for
-- overlap with other royalty payments.
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_royalty_period";
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_royalty_period"
  CHECK (("category" = 'ROYALTY' OR ("periodFrom" IS NULL AND "periodTo" IS NULL))
    AND (("periodFrom" IS NULL) = ("periodTo" IS NULL))
    AND ("periodFrom" IS NULL OR "periodFrom" <= "periodTo"));
