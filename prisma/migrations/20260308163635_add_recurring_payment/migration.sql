-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "is_recurring" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "recurring_payments" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "lastProcessedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_payments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
