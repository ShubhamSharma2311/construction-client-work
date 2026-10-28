-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('LABOUR', 'DIESEL', 'ROYALTY', 'POLICE', 'OTHER', 'EMERGENCY', 'TRACTOR_SERVICE', 'TRACTOR_EMI');

-- CreateTable
CREATE TABLE "Expense" (
    "id" SERIAL NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "spentOn" DATE NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "mode" "PayMode" NOT NULL,
    "driverId" INTEGER,
    "tractorId" INTEGER,
    "labourerId" INTEGER,
    "dieselMl" INTEGER,
    "hourMeter" INTEGER,
    "periodFrom" DATE,
    "periodTo" DATE,
    "reference" TEXT,
    "notes" TEXT,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_spentOn_idx" ON "Expense"("spentOn");

-- CreateIndex
CREATE INDEX "Expense_category_spentOn_idx" ON "Expense"("category", "spentOn");

-- CreateIndex
CREATE INDEX "Expense_tractorId_spentOn_idx" ON "Expense"("tractorId", "spentOn");

-- CreateIndex
CREATE INDEX "Expense_driverId_spentOn_idx" ON "Expense"("driverId", "spentOn");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tractorId_fkey" FOREIGN KEY ("tractorId") REFERENCES "Tractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_labourerId_fkey" FOREIGN KEY ("labourerId") REFERENCES "Labourer"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Category rules. The API checks them first with clearer messages.
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_amount_positive" CHECK ("amountPaise" > 0);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_labour_has_labourer"
  CHECK (("category" = 'LABOUR') = ("labourerId" IS NOT NULL));
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_diesel_fields"
  CHECK (("category" = 'DIESEL') = ("dieselMl" IS NOT NULL)
    AND ("category" <> 'DIESEL' OR ("tractorId" IS NOT NULL AND "driverId" IS NOT NULL AND "dieselMl" > 0)));
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_royalty_period"
  CHECK (("category" = 'ROYALTY' OR ("periodFrom" IS NULL AND "periodTo" IS NULL))
    AND ("periodFrom" IS NULL OR "periodTo" IS NULL OR "periodFrom" <= "periodTo"));
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_notes_required"
  CHECK ("category" NOT IN ('POLICE', 'OTHER', 'EMERGENCY', 'TRACTOR_SERVICE')
    OR length(trim(coalesce("notes", ''))) > 0);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_service_fields"
  CHECK (("category" = 'TRACTOR_SERVICE' OR "hourMeter" IS NULL)
    AND ("category" <> 'TRACTOR_SERVICE' OR "tractorId" IS NOT NULL));
