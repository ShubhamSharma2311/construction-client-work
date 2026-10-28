-- CreateEnum
CREATE TYPE "LoanClosure" AS ENUM ('PAID_OFF', 'FORECLOSED');

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "emiMonth" DATE,
ADD COLUMN     "lateFeePaise" INTEGER,
ADD COLUMN     "tractorLoanId" INTEGER;

-- CreateTable
CREATE TABLE "TractorLoan" (
    "id" SERIAL NOT NULL,
    "tractorId" INTEGER NOT NULL,
    "lender" TEXT NOT NULL,
    "emiPaise" INTEGER NOT NULL,
    "emiDay" INTEGER NOT NULL,
    "firstEmiMonth" DATE NOT NULL,
    "totalInstallments" INTEGER NOT NULL,
    "closedOn" DATE,
    "closedReason" "LoanClosure",
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TractorLoan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TractorLoan_tractorId_idx" ON "TractorLoan"("tractorId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tractorLoanId_fkey" FOREIGN KEY ("tractorLoanId") REFERENCES "TractorLoan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TractorLoan" ADD CONSTRAINT "TractorLoan_tractorId_fkey" FOREIGN KEY ("tractorId") REFERENCES "Tractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Loan rules.
ALTER TABLE "TractorLoan" ADD CONSTRAINT "TractorLoan_values"
  CHECK ("emiPaise" > 0 AND "emiDay" BETWEEN 1 AND 28
    AND "totalInstallments" BETWEEN 1 AND 120
    AND EXTRACT(DAY FROM "firstEmiMonth") = 1);
ALTER TABLE "TractorLoan" ADD CONSTRAINT "TractorLoan_closure_pair"
  CHECK (("closedOn" IS NULL) = ("closedReason" IS NULL));
CREATE UNIQUE INDEX "TractorLoan_one_open_per_tractor"
  ON "TractorLoan" ("tractorId") WHERE "closedOn" IS NULL;

-- EMI rows belong to a loan and a tractor; loan fields appear on EMI rows only.
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_emi_fields"
  CHECK ((("category" = 'TRACTOR_EMI') = ("tractorLoanId" IS NOT NULL))
    AND ("category" <> 'TRACTOR_EMI' OR "tractorId" IS NOT NULL)
    AND ("category" = 'TRACTOR_EMI' OR ("emiMonth" IS NULL AND "lateFeePaise" IS NULL))
    AND ("emiMonth" IS NULL OR EXTRACT(DAY FROM "emiMonth") = 1)
    AND ("lateFeePaise" IS NULL OR ("lateFeePaise" >= 0 AND "lateFeePaise" < "amountPaise")));
CREATE UNIQUE INDEX "Expense_one_payment_per_emi_month"
  ON "Expense" ("tractorLoanId", "emiMonth")
  WHERE "emiMonth" IS NOT NULL AND "deletedAt" IS NULL;
