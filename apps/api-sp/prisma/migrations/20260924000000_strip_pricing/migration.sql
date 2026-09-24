-- Strip pricing from the ShowPlan schema.
--
-- Money is never computed in this repo (AGENTS.md rule 7): rates and quotes
-- belong to QuoteOS through contracts/quote/v1. Fuel burn is physics, so it
-- moves onto the item row as consumptionLitresPerHour.

-- 1. Drop the pricing tables (child before parent: QuoteLine -> Quote -> Rate).
DROP TABLE "QuoteLine";
DROP TABLE "Quote";
DROP TABLE "Rate";

-- 2. Item: drop the reference-rate flag, carry fuel burn as a physical value.
ALTER TABLE "Item" DROP COLUMN "referenceRate";
ALTER TABLE "Item" ADD COLUMN "consumptionLitresPerHour" DOUBLE PRECISION;

-- 3. CatalogueVersion: rates are no longer imported, so the count goes.
ALTER TABLE "CatalogueVersion" DROP COLUMN "rateCount";
