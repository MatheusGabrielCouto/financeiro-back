-- CreateEnum
CREATE TYPE "RecurrenceType" AS ENUM ('MONTHLY', 'WEEKLY', 'DAILY', 'YEARLY');

-- AlterTable
ALTER TABLE "debts" ADD COLUMN     "recurrence" "RecurrenceType" NOT NULL DEFAULT 'MONTHLY';
