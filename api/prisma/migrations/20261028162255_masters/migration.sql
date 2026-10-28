-- CreateTable
CREATE TABLE "Setting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "businessName" TEXT NOT NULL,
    "businessStartDate" DATE NOT NULL,
    "openingCashPaise" INTEGER NOT NULL DEFAULT 0,
    "openingOnlinePaise" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "phone" TEXT,
    "village" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tractor" (
    "id" SERIAL NOT NULL,
    "regNumber" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Tractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "joinedOn" DATE NOT NULL,
    "leftOn" DATE,
    "defaultTractorId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverSalaryRate" (
    "id" SERIAL NOT NULL,
    "driverId" INTEGER NOT NULL,
    "monthlyPaise" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverSalaryRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Khet" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Khet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Labourer" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Labourer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "shareBasisPoints" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

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

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_defaultTractorId_fkey" FOREIGN KEY ("defaultTractorId") REFERENCES "Tractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverSalaryRate" ADD CONSTRAINT "DriverSalaryRate_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Constraints Prisma cannot express. They back up the API's own checks.
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_singleton" CHECK ("id" = 1);
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_opening_non_negative"
  CHECK ("openingCashPaise" >= 0 AND "openingOnlinePaise" >= 0);

CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer" ("phone") WHERE "phone" IS NOT NULL;

ALTER TABLE "DriverSalaryRate" ADD CONSTRAINT "DriverSalaryRate_positive" CHECK ("monthlyPaise" > 0);
ALTER TABLE "DriverSalaryRate" ADD CONSTRAINT "DriverSalaryRate_month_start"
  CHECK (EXTRACT(DAY FROM "effectiveFrom") = 1);
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_left_after_joined"
  CHECK ("leftOn" IS NULL OR "leftOn" >= "joinedOn");

ALTER TABLE "Partner" ADD CONSTRAINT "Partner_share_range"
  CHECK ("shareBasisPoints" IS NULL OR "shareBasisPoints" BETWEEN 0 AND 10000);
