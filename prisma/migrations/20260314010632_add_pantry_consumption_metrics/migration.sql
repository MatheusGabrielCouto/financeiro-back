-- AlterTable
ALTER TABLE "pantry_items" ADD COLUMN     "average_duration_days" INTEGER,
ADD COLUMN     "consumption_per_day" DOUBLE PRECISION,
ADD COLUMN     "last_purchase_date" TIMESTAMP(3);
