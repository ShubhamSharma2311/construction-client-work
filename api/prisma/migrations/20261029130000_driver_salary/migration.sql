-- CreateEnum
CREATE TYPE "DriverAccrualKind" AS ENUM ('MONTH_SALARY', 'BONUS', 'OPENING_BALANCE');

-- CreateEnum
CREATE TYPE "DriverPaymentType" AS ENUM ('ADVANCE', 'SALARY', 'BONUS');

-- CreateTable
CREATE TABLE "DriverAccrual" (
    "id" SERIAL NOT NULL,
    "driverId" INTEGER NOT NULL,
    "kind" "DriverAccrualKind" NOT NULL,
    "month" DATE,
    "accruedOn" DATE NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "note" TEXT,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DriverAccrual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverPayment" (
    "id" SERIAL NOT NULL,
    "driverId" INTEGER NOT NULL,
    "paidOn" DATE NOT NULL,
    "type" "DriverPaymentType" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "mode" "PayMode" NOT NULL,
    "forMonth" DATE,
    "bonusAccrualId" INTEGER,
    "notes" TEXT,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DriverPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverAccrual_driverId_accruedOn_idx" ON "DriverAccrual"("driverId", "accruedOn");

-- CreateIndex
CREATE UNIQUE INDEX "DriverPayment_bonusAccrualId_key" ON "DriverPayment"("bonusAccrualId");

-- CreateIndex
CREATE INDEX "DriverPayment_driverId_paidOn_idx" ON "DriverPayment"("driverId", "paidOn");

-- CreateIndex
CREATE INDEX "DriverPayment_paidOn_idx" ON "DriverPayment"("paidOn");

-- AddForeignKey
ALTER TABLE "DriverAccrual" ADD CONSTRAINT "DriverAccrual_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPayment" ADD CONSTRAINT "DriverPayment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPayment" ADD CONSTRAINT "DriverPayment_bonusAccrualId_fkey" FOREIGN KEY ("bonusAccrualId") REFERENCES "DriverAccrual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Earnings: month salary is never negative; bonus is positive; the opening balance may be
-- either sign but not zero. Only salary rows carry a month.
ALTER TABLE "DriverAccrual" ADD CONSTRAINT "DriverAccrual_kind_rules" CHECK (
  ("kind" = 'MONTH_SALARY' AND "month" IS NOT NULL AND EXTRACT(DAY FROM "month") = 1 AND "amountPaise" >= 0)
  OR ("kind" = 'BONUS' AND "month" IS NULL AND "amountPaise" > 0)
  OR ("kind" = 'OPENING_BALANCE' AND "month" IS NULL AND "amountPaise" <> 0)
);
CREATE UNIQUE INDEX "DriverAccrual_one_salary_per_month"
  ON "DriverAccrual" ("driverId", "month") WHERE "kind" = 'MONTH_SALARY' AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "DriverAccrual_one_opening_balance"
  ON "DriverAccrual" ("driverId") WHERE "kind" = 'OPENING_BALANCE' AND "deletedAt" IS NULL;

-- Payments are positive; a bonus payment carries its earning, others never do.
ALTER TABLE "DriverPayment" ADD CONSTRAINT "DriverPayment_rules" CHECK (
  "amountPaise" > 0
  AND (("type" = 'BONUS') = ("bonusAccrualId" IS NOT NULL))
  AND ("forMonth" IS NULL OR EXTRACT(DAY FROM "forMonth") = 1)
);
