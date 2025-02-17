/*
  Warnings:

  - Added the required column `dateTransaction` to the `installments` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "installments" ADD COLUMN     "dateTransaction" TIMESTAMP(3) NOT NULL;
