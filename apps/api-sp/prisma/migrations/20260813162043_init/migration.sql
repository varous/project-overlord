-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ISSUED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hd" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pictureUrl" TEXT,
    "googleSub" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client" TEXT,
    "venue" TEXT,
    "city" TEXT,
    "eventStart" TIMESTAMP(3),
    "eventEnd" TIMESTAMP(3),
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Layout" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Layout 1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Layout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Level" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Ground',
    "ordinal" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaseMap" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "widthPx" INTEGER NOT NULL,
    "heightPx" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calAx" DOUBLE PRECISION,
    "calAy" DOUBLE PRECISION,
    "calBx" DOUBLE PRECISION,
    "calBy" DOUBLE PRECISION,
    "calKnownValue" DOUBLE PRECISION,
    "calKnownUnit" TEXT,
    "calibratedAt" TIMESTAMP(3),
    "calibratedById" TEXT,

    CONSTRAINT "BaseMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogueVersion" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemCount" INTEGER NOT NULL,
    "rateCount" INTEGER NOT NULL,
    "findings" JSONB NOT NULL,

    CONSTRAINT "CatalogueVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "qtyBasis" TEXT NOT NULL,
    "dayCurveId" TEXT NOT NULL,
    "tags" TEXT[],
    "linkedRateItem" TEXT,
    "powerSupplyKva" DOUBLE PRECISION,
    "powerLoadKva" DOUBLE PRECISION,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "DayCurve" (
    "id" TEXT NOT NULL,
    "table" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayCurve_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rate" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "city" TEXT,
    "valuePaise" INTEGER,
    "litresPerHour" DOUBLE PRECISION,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageTemplate" (
    "packageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "params" TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageTemplate_pkey" PRIMARY KEY ("packageId")
);

-- CreateTable
CREATE TABLE "PackageItem" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "qtyRule" TEXT NOT NULL,
    "qtyValue" DOUBLE PRECISION NOT NULL,
    "flag" TEXT NOT NULL,

    CONSTRAINT "PackageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "params" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantLine" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "qtyRule" TEXT NOT NULL,
    "qtyValue" DOUBLE PRECISION NOT NULL,
    "flag" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "overrideDays" DOUBLE PRECISION,

    CONSTRAINT "VariantLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instance" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "xPx" DOUBLE PRECISION NOT NULL,
    "yPx" DOUBLE PRECISION NOT NULL,
    "widthPx" DOUBLE PRECISION,
    "heightPx" DOUBLE PRECISION,
    "rotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "runningHoursPerDay" DOUBLE PRECISION,
    "pointsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sequence" INTEGER,
    "versionMajor" INTEGER,
    "versionMinor" INTEGER,
    "issuedAt" TIMESTAMP(3),
    "supersedesSequence" INTEGER,
    "side" TEXT NOT NULL,
    "city" TEXT,
    "vcDays" INTEGER NOT NULL,
    "opsDays" INTEGER NOT NULL,
    "defaultRunningHoursPerDay" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "catalogueVersionId" TEXT NOT NULL,
    "subtotalPaise" INTEGER NOT NULL,
    "taxesPaise" INTEGER NOT NULL DEFAULT 0,
    "marginPaise" INTEGER NOT NULL DEFAULT 0,
    "discountPaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL,
    "roundingDeltaPaise" INTEGER NOT NULL DEFAULT 0,
    "roundingIncrementPaise" INTEGER NOT NULL DEFAULT 10000,
    "incomplete" BOOLEAN NOT NULL,
    "priceNotSpecifiedCodes" TEXT[],
    "findings" JSONB NOT NULL,
    "generatedById" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "billedDays" DOUBLE PRECISION NOT NULL,
    "declaredDays" INTEGER NOT NULL,
    "overrideApplied" BOOLEAN NOT NULL DEFAULT false,
    "curveId" TEXT NOT NULL,
    "ratePaise" INTEGER,
    "litresPerHour" DOUBLE PRECISION,
    "rateSide" TEXT,
    "rateResolvedCity" TEXT,
    "usedGenericFallback" BOOLEAN NOT NULL DEFAULT false,
    "amountPaise" INTEGER,
    "unpricedReason" TEXT,
    "isFuel" BOOLEAN NOT NULL DEFAULT false,
    "runningHoursJson" JSONB,
    "contributions" JSONB NOT NULL,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_hd_key" ON "Organisation"("hd");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE INDEX "User_organisationId_idx" ON "User"("organisationId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Project_organisationId_updatedAt_idx" ON "Project"("organisationId", "updatedAt");

-- CreateIndex
CREATE INDEX "Layout_organisationId_idx" ON "Layout"("organisationId");

-- CreateIndex
CREATE INDEX "Layout_projectId_idx" ON "Layout"("projectId");

-- CreateIndex
CREATE INDEX "Level_organisationId_idx" ON "Level"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Level_layoutId_ordinal_key" ON "Level"("layoutId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "BaseMap_levelId_key" ON "BaseMap"("levelId");

-- CreateIndex
CREATE INDEX "BaseMap_organisationId_idx" ON "BaseMap"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogueVersion_label_key" ON "CatalogueVersion"("label");

-- CreateIndex
CREATE INDEX "Item_section_sortOrder_idx" ON "Item"("section", "sortOrder");

-- CreateIndex
CREATE INDEX "Item_category_idx" ON "Item"("category");

-- CreateIndex
CREATE INDEX "Rate_itemCode_side_idx" ON "Rate"("itemCode", "side");

-- CreateIndex
CREATE UNIQUE INDEX "Rate_itemCode_side_city_key" ON "Rate"("itemCode", "side", "city");

-- CreateIndex
CREATE INDEX "PackageTemplate_name_idx" ON "PackageTemplate"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PackageItem_packageId_itemCode_key" ON "PackageItem"("packageId", "itemCode");

-- CreateIndex
CREATE INDEX "Variant_organisationId_idx" ON "Variant"("organisationId");

-- CreateIndex
CREATE INDEX "Variant_layoutId_idx" ON "Variant"("layoutId");

-- CreateIndex
CREATE UNIQUE INDEX "VariantLine_variantId_itemCode_key" ON "VariantLine"("variantId", "itemCode");

-- CreateIndex
CREATE INDEX "Instance_organisationId_idx" ON "Instance"("organisationId");

-- CreateIndex
CREATE INDEX "Instance_levelId_idx" ON "Instance"("levelId");

-- CreateIndex
CREATE INDEX "Quote_projectId_versionMajor_versionMinor_idx" ON "Quote"("projectId", "versionMajor", "versionMinor");

-- CreateIndex
CREATE INDEX "Quote_organisationId_generatedAt_idx" ON "Quote"("organisationId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_projectId_sequence_key" ON "Quote"("projectId", "sequence");

-- CreateIndex
CREATE INDEX "QuoteLine_quoteId_idx" ON "QuoteLine"("quoteId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Layout" ADD CONSTRAINT "Layout_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Level" ADD CONSTRAINT "Level_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "Layout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseMap" ADD CONSTRAINT "BaseMap_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_dayCurveId_fkey" FOREIGN KEY ("dayCurveId") REFERENCES "DayCurve"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_itemCode_fkey" FOREIGN KEY ("itemCode") REFERENCES "Item"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageItem" ADD CONSTRAINT "PackageItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "PackageTemplate"("packageId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageItem" ADD CONSTRAINT "PackageItem_itemCode_fkey" FOREIGN KEY ("itemCode") REFERENCES "Item"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "Layout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "PackageTemplate"("packageId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantLine" ADD CONSTRAINT "VariantLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantLine" ADD CONSTRAINT "VariantLine_itemCode_fkey" FOREIGN KEY ("itemCode") REFERENCES "Item"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instance" ADD CONSTRAINT "Instance_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instance" ADD CONSTRAINT "Instance_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_catalogueVersionId_fkey" FOREIGN KEY ("catalogueVersionId") REFERENCES "CatalogueVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_itemCode_fkey" FOREIGN KEY ("itemCode") REFERENCES "Item"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
