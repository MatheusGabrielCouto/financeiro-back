-- AlterTable
ALTER TABLE "grocery_purchases" ADD COLUMN "transaction_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "grocery_purchases_transaction_id_key" ON "grocery_purchases"("transaction_id");

-- AddForeignKey
ALTER TABLE "grocery_purchases" ADD CONSTRAINT "grocery_purchases_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
