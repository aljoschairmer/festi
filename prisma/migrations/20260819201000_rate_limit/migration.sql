-- Fixed-window rate limiting for public server actions. better-auth's
-- built-in limiter lives in its router, so actions calling `auth.api.*`
-- directly (registration) were never covered.
CREATE TABLE "rate_limit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "rate_limit_expiresAt_idx" ON "rate_limit"("expiresAt");
