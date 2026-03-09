-- Remove duplicate tokens per user (keep most recent)
DELETE FROM "push_tokens" p1
USING "push_tokens" p2
WHERE p1."userId" = p2."userId" AND p1."created_at" < p2."created_at";

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_userId_key" ON "push_tokens"("userId");
