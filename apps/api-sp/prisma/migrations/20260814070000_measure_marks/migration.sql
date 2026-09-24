-- CreateTable
CREATE TABLE "MeasureMark" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "pointsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeasureMark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeasureMark_organisationId_idx" ON "MeasureMark"("organisationId");

-- CreateIndex
CREATE INDEX "MeasureMark_levelId_idx" ON "MeasureMark"("levelId");

-- AddForeignKey
ALTER TABLE "MeasureMark" ADD CONSTRAINT "MeasureMark_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE CASCADE ON UPDATE CASCADE;
