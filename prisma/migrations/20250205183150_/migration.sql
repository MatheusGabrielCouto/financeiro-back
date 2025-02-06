-- DropForeignKey
ALTER TABLE "installments" DROP CONSTRAINT "installments_debtId_fkey";

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "debts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
