-- AlterTable
ALTER TABLE "Item" ADD COLUMN "placement" TEXT NOT NULL DEFAULT 'CANVAS';

-- AlterTable
ALTER TABLE "PackageTemplate" ADD COLUMN "auto" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ShowItem" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShowItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShowItem_layoutId_itemCode_key" ON "ShowItem"("layoutId", "itemCode");

-- CreateIndex
CREATE INDEX "ShowItem_organisationId_idx" ON "ShowItem"("organisationId");

-- CreateIndex
CREATE INDEX "ShowItem_layoutId_idx" ON "ShowItem"("layoutId");

-- AddForeignKey
ALTER TABLE "ShowItem" ADD CONSTRAINT "ShowItem_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "Layout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowItem" ADD CONSTRAINT "ShowItem_itemCode_fkey" FOREIGN KEY ("itemCode") REFERENCES "Item"("code") ON UPDATE CASCADE;
