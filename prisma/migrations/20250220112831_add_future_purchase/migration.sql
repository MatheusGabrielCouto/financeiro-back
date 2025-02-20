-- CreateTable
CREATE TABLE "future_purchases" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "value_added" DOUBLE PRECISION NOT NULL,
    "date_acquisition" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "image" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "future_purchases_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "future_purchases" ADD CONSTRAINT "future_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
