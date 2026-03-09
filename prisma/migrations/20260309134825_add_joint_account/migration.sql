-- CreateEnum
CREATE TYPE "JointAccountRole" AS ENUM ('OWNER', 'MEMBER');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "jointAccountId" TEXT;

-- CreateTable
CREATE TABLE "joint_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "joint_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_joint_accounts" (
    "userId" TEXT NOT NULL,
    "jointAccountId" TEXT NOT NULL,
    "role" "JointAccountRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_joint_accounts_pkey" PRIMARY KEY ("userId","jointAccountId")
);

-- AddForeignKey
ALTER TABLE "user_joint_accounts" ADD CONSTRAINT "user_joint_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_joint_accounts" ADD CONSTRAINT "user_joint_accounts_jointAccountId_fkey" FOREIGN KEY ("jointAccountId") REFERENCES "joint_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_jointAccountId_fkey" FOREIGN KEY ("jointAccountId") REFERENCES "joint_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
