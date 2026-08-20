import crypto from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import "dotenv/config";
import pg from "pg";

/**
 * NOTE: this seed intentionally talks to Postgres via `pg` directly instead of
 * the generated Prisma client. The generated client targets the Cloudflare
 * `workerd` runtime (WASM query compiler imported as `*.wasm?module`), which
 * plain Node/tsx cannot load — so importing it here crashes with a LinkError.
 * Raw SQL keeps `npm run db:setup` working in every environment.
 */
async function main() {
  const client = new pg.Client({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  });
  await client.connect();

  console.log("🌱 Starting seed...");

  /**
   * Idempotently ensures a user with a credential account exists. Safe to run
   * on every deploy: existing users/accounts are left untouched, and a missing
   * credential account is created (self-healing) without ever duplicating rows.
   */
  async function ensureUser(opts: {
    name: string;
    email: string;
    role: string;
    password: string;
  }) {
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM "user" WHERE email = $1',
      [opts.email],
    );

    let userId: string;
    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
    } else {
      userId = crypto.randomUUID();
      await client.query(
        `INSERT INTO "user"
          (id, name, email, "emailVerified", role, banned, "ridingStyles", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, true, $4, false, '{}', now(), now())`,
        [userId, opts.name, opts.email, opts.role],
      );
    }

    const existingAccount = await client.query(
      'SELECT id FROM account WHERE "userId" = $1 AND "providerId" = $2',
      [userId, "credential"],
    );

    if (existingAccount.rows.length === 0) {
      await client.query(
        `INSERT INTO account
          (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, now(), now())`,
        [
          crypto.randomUUID(),
          userId,
          "credential",
          userId,
          await hashPassword(opts.password),
        ],
      );
    }

    return { id: userId, email: opts.email };
  }

  const admin = await ensureUser({
    name: "Admin User",
    email: "admin@festi.com",
    role: "admin",
    password: "admin123",
  });
  console.log("✅ Ensured admin user:", admin.email);

  const user = await ensureUser({
    name: "Alex Rider",
    email: "rider@festi.com",
    role: "user",
    password: "user1234",
  });
  console.log("✅ Ensured sample user:", user.email);

  console.log("\n📋 Test credentials:");
  console.log("Admin: admin@festi.com / admin123");
  console.log("User:  rider@festi.com / user1234");

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
