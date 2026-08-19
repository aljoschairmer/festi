-- CreateTable
-- NOTE: written by hand (sandbox without a database connection); run
-- `npx prisma migrate dev` once a database is available to confirm the
-- schema is in sync.
CREATE TABLE "rate_limit_entry" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_entry_pkey" PRIMARY KEY ("key")
);
