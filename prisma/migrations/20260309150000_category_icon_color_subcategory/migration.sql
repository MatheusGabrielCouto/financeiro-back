-- AlterTable
ALTER TABLE "categories" ADD COLUMN "icon" TEXT,
ADD COLUMN "color" TEXT,
ADD COLUMN "parentId" TEXT;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
