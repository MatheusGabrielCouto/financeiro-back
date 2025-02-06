/*
  Warnings:

  - Added the required column `status` to the `installments` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StatusInstallment" AS ENUM ('PAY', 'SCHEDULE');

-- AlterTable
ALTER TABLE "installments" ADD COLUMN     "status" "StatusInstallment" NOT NULL;
