-- CreateEnum
CREATE TYPE "PartnerTxnDirection" AS ENUM ('PAID_TO_PARTNER', 'RECEIVED_FROM_PARTNER');

-- CreateTable
CREATE TABLE "PartnerTxn" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "txnDate" DATE NOT NULL,
    "direction" "PartnerTxnDirection" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "mode" "PayMode" NOT NULL,
    "notes" TEXT,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PartnerTxn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerTxn_partnerId_txnDate_idx" ON "PartnerTxn"("partnerId", "txnDate");

-- CreateIndex
CREATE INDEX "PartnerTxn_txnDate_idx" ON "PartnerTxn"("txnDate");

-- AddForeignKey
ALTER TABLE "PartnerTxn" ADD CONSTRAINT "PartnerTxn_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "PartnerTxn" ADD CONSTRAINT "PartnerTxn_amount_positive" CHECK ("amountPaise" > 0);
