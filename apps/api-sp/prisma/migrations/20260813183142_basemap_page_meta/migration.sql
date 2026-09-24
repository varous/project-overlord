-- AlterTable
ALTER TABLE "BaseMap" ADD COLUMN     "pageCount" INTEGER,
ADD COLUMN     "sourcePage" INTEGER NOT NULL DEFAULT 1;
