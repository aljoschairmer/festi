import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: [".env.local", ".env"] });

/**
 * Migrations and introspection need a direct connection: Neon's pooled
 * endpoint runs PgBouncer in transaction mode, which cannot keep the advisory
 * lock and session state the schema engine relies on. `DATABASE_URL` is the
 * fallback so a plain Postgres needs no second variable.
 */
const migrationUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: migrationUrl,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
