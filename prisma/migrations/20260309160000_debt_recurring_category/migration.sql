-- AlterTable
ALTER TABLE "debts" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "recurring_payments" ADD COLUMN "categoryId" TEXT;

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
