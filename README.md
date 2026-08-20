# Festi

Festi is a social platform built for cyclists. It lets riders plan group rides, share route-aware posts, join rider groups, follow each other, and stay in touch through direct and group messaging.

The project is a modern [Next.js](https://nextjs.org) application that ships to [Cloudflare Workers](https://workers.cloudflare.com/) via [OpenNext](https://opennext.js.org/cloudflare), backed by [Neon](https://neon.com/) serverless Postgres and Cloudflare R2 for media storage.

---

## Features

- **Authentication & accounts**
  - Email/password registration and sign-in with mandatory email verification.
  - Forgot/reset password flows delivered through [Resend](https://resend.com/).
  - Session management, role-based access (`user` / `admin`), and admin-initiated user bans.
- **Rider profiles**
  - Public profile with avatar upload, bio, location, bike details, skill level, riding styles, and years riding.
  - Follow/unfollow riders with a real-time presence heartbeat.
- **Social feed**
  - Create posts with a markdown editor and image attachments.
  - Like and comment on posts (authors are notified).
  - "For You" timeline combining posts and community rides in one interleaved, cursor-paginated feed.
- **Groups & chat**
  - Create and join rider groups; owners can require approval for membership and manage pending join requests.
  - Owner-appointed moderators help manage join requests, members, and announcements.
  - Group announcements notify all members; a shared route library lets members plan rides from saved routes.
  - Group chat available to members.
  - Direct messaging between mutually-followed riders.
- **Community rides**
  - Plan rides with an interactive route planner.
  - Route calculation through [BRouter](https://brouter.de/) with distance, duration, and elevation gain/loss.
  - Visualize routes on [MapLibre GL](https://maplibre.org/) maps with elevation charts.
  - Export routes as GPX (with elevation data); upload ride photos.
  - Request to join rides; creators approve or reject participants.
  - Optional pace and difficulty labels, rider caps, and full lifecycle management: creators can edit details (approved riders are notified when the start time moves) or cancel a ride (all participants are notified); riders can leave rides, withdraw pending requests, and re-request after a rejection.
  - Weekly recurring rides: create up to 12 weekly instances in one go, cancel single instances or the whole remaining series.
  - Waitlists on full rides: joiners queue automatically and are promoted to a pending request when a spot frees.
  - After the ride, creators mark who actually showed up (attendance / no-shows).
  - Every ride has a shareable public page (creators can disable it) with route, stats, and a join CTA for logged-out visitors.
  - Post rides to a group; members are notified and see upcoming group rides on the group page.
  - Save any ride's route to your personal or a group's route library and plan new rides from it.
  - Discover upcoming rides with text search, pace/difficulty filters, and a proximity filter ("near this place", 10–100 km).
- **Notifications**
  - In-app notifications for follows, group joins and join requests, ride join requests/approvals/rejections, ride updates and cancellations, new group rides, and post likes/comments.
  - Notifications link straight to the ride, group, or rider profile they reference; a full-page history with pagination lives under `/dashboard/notifications`.
- **Admin dashboard**
  - Activity analytics with time-series charts, top actors, recent activity, and anomaly warnings.
  - User management table with role changes and bans.
- **Audit logging**
  - Comprehensive `ActivityLog` records for authentication, moderation, group, ride, and messaging events.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | [Next.js 16](https://nextjs.org) (App Router) + [React 19](https://react.dev) |
| Language | [TypeScript](https://www.typescriptlang.org/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) |
| ORM / Database | [Prisma 7](https://www.prisma.io/) + [Neon](https://neon.com/) serverless [PostgreSQL](https://www.postgresql.org/) |
| Auth | [better-auth](https://www.better-auth.com/) with the admin plugin |
| Server state | [TanStack Query](https://tanstack.com/query/latest) |
| Forms | [react-hook-form](https://www.react-hook-form.com/) + [Zod](https://zod.dev/) |
| Maps & Routing | [MapLibre GL](https://maplibre.org/) + [MapTiler](https://www.maptiler.com/) + [BRouter](https://brouter.de/) |
| Images | Client-side canvas processing, server validation, Cloudflare R2 |
| Email | [Resend](https://resend.com/) |
| Deployment | [OpenNext Cloudflare](https://opennext.js.org/cloudflare) + [Wrangler](https://developers.cloudflare.com/workers/wrangler/) |
| Linting / Formatting | [Biome](https://biomejs.dev/) |

---

## Architecture

- **App Router**: pages are server components by default under `src/app/`. Async server actions live next to the features that use them.
- **Feature folders**: `src/features/<domain>/` groups components, actions, schemas, types, and helpers per domain (e.g. `rides`, `posts`, `community`, `users`, `auth`, `analytics`).
- **Server actions**: most mutations are implemented as Next.js server actions, guarded by `src/features/auth/guards.ts`.
- **Auth**: the better-auth handler is mounted at `src/app/api/auth/[...all]/route.ts`. Client-side helpers are exported from `src/lib/auth-client.ts`.
- **Database**: `src/lib/prisma.ts` exposes one lazily built Prisma client per Worker isolate. `src/lib/db/` picks the driver from `DATABASE_URL`: Neon's serverless driver in production, plain TCP for a local or CI Postgres. See [Database](#database).
- **Media**: images are resized/encoded to WebP in the browser, validated server-side, and stored in Cloudflare R2 (`src/lib/r2.ts`).
- **Maps**: MapTiler provides tiles and geocoding; BRouter computes cycling routes.
- **Deployment**: OpenNext builds the app into `.open-next/`, and Wrangler serves static assets through the `ASSETS` binding.

---

## Project Structure

```text
.
├── prisma/
│   ├── schema.prisma        # Prisma data model
│   ├── migrations/          # Migration history
│   └── seed.ts              # Seed admin + sample user
├── public/                  # Static assets / logos
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── api/auth/[...all]/route.ts
│   │   ├── dashboard/
│   │   ├── login/
│   │   ├── register/
│   │   └── ...
│   ├── components/          # Shared UI components (shadcn + custom)
│   ├── components/ui/       # shadcn/ui primitives
│   ├── features/            # Domain-driven feature modules
│   │   ├── analytics/
│   │   ├── auth/
│   │   ├── chat/
│   │   ├── community/
│   │   ├── followers/
│   │   ├── logger/
│   │   ├── notification/
│   │   ├── posts/
│   │   ├── rides/
│   │   └── users/
│   ├── generated/prisma/    # Generated Prisma client (git-ignored)
│   ├── hooks/               # Shared React hooks
│   └── lib/                 # Cross-cutting utilities
│       ├── auth.ts          # better-auth configuration
│       ├── auth-client.ts   # Client auth client
│       ├── db/              # Connection resolution + driver adapter
│       ├── prisma.ts        # Prisma client, one per Worker isolate
│       ├── email.ts         # Resend email helpers
│       ├── image.ts         # Server-side image validation
│       └── r2.ts            # Cloudflare R2 client
├── biome.json               # Biome configuration
├── components.json          # shadcn/ui configuration
├── docker-compose.yaml      # Local Postgres + pgAdmin
├── next.config.ts           # Next.js config
├── open-next.config.ts      # OpenNext Cloudflare config
├── postcss.config.mjs       # Tailwind v4 PostCSS setup
├── prisma.config.ts         # Prisma CLI configuration
└── wrangler.jsonc           # Wrangler / Cloudflare Workers settings
```

---

## Database

Production runs on [Neon](https://neon.com/). Neon matters here because the app
is a Cloudflare Worker: a Worker isolate cannot keep a long-lived TCP pool the
way a Node server can, and every colo that serves traffic would otherwise open
its own connections against one Postgres.

**How the connection is made**

- `src/lib/db/connection.ts` reads `DATABASE_URL` and classifies it. A
  `*.neon.tech` host selects Neon's serverless driver; anything else — Docker
  Compose locally, the service container in CI — selects plain TCP through
  `pg`. `DATABASE_DRIVER` overrides the guess.
- `src/lib/db/adapter.ts` builds the matching Prisma driver adapter. On Neon,
  `poolQueryViaFetch` sends ordinary queries as a single HTTPS request, so no
  WebSocket handshake sits in front of a query. Transactions still need a
  socket and open one on their own.
- `src/lib/prisma.ts` exposes `prisma`, built on first use and cached on
  `globalThis` for the life of the isolate. Building lazily matters on Workers:
  the environment is bound per request, and the build imports this module
  without ever running a query.

**Pooled vs. direct endpoint**

Neon offers two hostnames per branch. `DATABASE_URL` should be the pooled one
(`…-pooler.…`), which fronts PgBouncer and absorbs the connection churn of many
isolates. `DIRECT_URL` should be the unpooled one: the schema engine takes
advisory locks and relies on session state, neither of which survives
PgBouncer's transaction mode. `prisma.config.ts` therefore runs migrations and
seeding against `DIRECT_URL`, falling back to `DATABASE_URL` when it is unset —
which is what a single-endpoint local Postgres wants.

The app warns on startup when `DATABASE_URL` points at a Neon endpoint that is
not pooled.

**Local development**

`docker compose up -d` plus a `postgresql://postgres:changeme@localhost:5432/database`
URL needs no Neon account and no extra configuration: the driver selection sees
a non-Neon host and uses `pg`. Pointing `DATABASE_URL` at a Neon branch instead
works just as well, and is the closer match to production.

---

## Database Schema Highlights

- `User`, `Session`, `Account`, `Verification` – managed by better-auth; `User` has extra rider fields.
- `Group` / `GroupMember` / `GroupMessage` – rider groups and their chats; `GroupMember.status` supports approval-gated membership (`PENDING` / `APPROVED`).
- `DirectMessage` – mutual-follow direct messages.
- `Follow` – follower/following relationships.
- `Ride` / `RidePhoto` / `RideParticipant` – planned rides, photos, and join requests. Rides carry a lifecycle `status` (`SCHEDULED` / `CANCELLED`), an optional `maxParticipants` cap, and optional `pace` / `difficulty` labels.
- `Post` / `PostLike` / `PostComment` / `PostImage` – social feed.
- `Notification` – in-app notifications.
- `ActivityLog` – audit trail of platform events.

---

## Environment Variables

Create `.env.local` (and/or `.env`) in the project root. The following variables are required or commonly used:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Connection string the app queries through. On Neon use the **pooled** endpoint (`…-pooler.<region>.aws.neon.tech`). |
| `DIRECT_URL` | Connection string for migrations, introspection and seeding. On Neon use the **direct** endpoint; falls back to `DATABASE_URL` when unset. |
| `SHADOW_DATABASE_URL` | Optional. Shadow database for `prisma migrate dev`; on Neon point it at a second branch or database. |
| `DATABASE_DRIVER` | Optional. Forces `neon` or `postgres` when the host alone does not say — e.g. a Neon proxy under your own hostname. |
| `NEXT_PUBLIC_APP_URL` | Canonical app URL (e.g. `http://localhost:3000`). |
| `BETTER_AUTH_SECRET` | Secret used by better-auth for token signing. |
| `RESEND_API_KEY` | Resend API key for transactional emails. |
| `EMAIL_FROM` | Verified sender address (defaults to Resend onboarding address locally). |
| `NEXT_PUBLIC_MAPTILER_API_KEY` | MapTiler API key for maps and geocoding. |
| `BROUTER_URL` | Optional custom BRouter instance (defaults to `https://brouter.de`). |
| `ROUTE_ENGINE_URL` | Base URL of the Festi Route Engine (festi-backend) powering "Generate a route for me". Set as a Wrangler secret in production. |
| `ROUTE_ENGINE_API_KEY` | Shared secret for the route engine (its `API_KEY`). Set as a Wrangler secret; optional in local dev when the engine runs without auth. |
| `R2_ACCOUNT_ID` | Cloudflare account ID for R2. |
| `R2_ACCESS_KEY_ID` | R2 S3-compatible access key. |
| `R2_SECRET_ACCESS_KEY` | R2 S3-compatible secret key. |
| `R2_BUCKET_NAME` | R2 bucket name. |
| `R2_PUBLIC_URL` | Public CDN/base URL for R2 objects. |

> Do not commit secrets. This project ignores `.env*` files by default.

For Cloudflare deployments, set sensitive values as Wrangler secrets:

```bash
wrangler secret put DATABASE_URL
wrangler secret put DIRECT_URL
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put RESEND_API_KEY
# ... etc
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (the project targets the LTS range used by Next.js 16)
- A Postgres to develop against: the provided Docker Compose file, or a [Neon](https://neon.com/) branch

### 1. Install dependencies

```bash
npm install
```

### 2. Start the local database

```bash
docker compose up -d
```

This starts PostgreSQL on port `5432` and pgAdmin on port `5050`. Skip it if
you develop against a Neon branch instead.

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill it in. At minimum set
`DATABASE_URL` and `NEXT_PUBLIC_APP_URL`:

```bash
DATABASE_URL="postgresql://postgres:changeme@localhost:5432/database"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Against a Neon branch, use the pooled endpoint for `DATABASE_URL` and the
direct one for `DIRECT_URL`:

```bash
DATABASE_URL="postgresql://…@ep-xxx-pooler.eu-central-1.aws.neon.tech/festi?sslmode=require"
DIRECT_URL="postgresql://…@ep-xxx.eu-central-1.aws.neon.tech/festi?sslmode=require"
```

### 4. Set up the database

```bash
npm run db:setup
```

This runs migrations and seeds the database.

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Seeded test accounts

| Email | Password | Role |
| --- | --- | --- |
| `admin@festi.com` | `admin123` | admin |
| `rider@festi.com` | `user1234` | user |

---

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start Next.js in development mode. |
| `npm run build` | Build the Next.js application. |
| `npm run start` | Start the production server (Node). |
| `npm run db:migrate` | Deploy Prisma migrations. |
| `npm run db:seed` | Seed the database. |
| `npm run db:setup` | Run migrations + seed. |
| `npm run lint` | Run Biome checks. |
| `npm run format` | Format code with Biome. |
| `npm run preview` | Build and preview the Cloudflare Worker locally. |
| `npm run deploy` | Build and deploy to Cloudflare Workers. |
| `npm run cf-typegen` | Generate `cloudflare-env.d.ts` from Wrangler bindings. |

---

## Deployment

Festi is configured for Cloudflare Workers.

1. Make sure you have a Cloudflare account and [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) authenticated.
2. Set all required secrets via `wrangler secret put`.
3. Configure public vars in `wrangler.jsonc` if needed (e.g. `EMAIL_FROM`).
4. Deploy:

```bash
npm run deploy
```

For a local production preview:

```bash
npm run preview
```

### Notes for production

- Point `NEXT_PUBLIC_APP_URL` and `EMAIL_FROM` to your verified domain.
- Verify your sender domain in Resend; otherwise emails are only delivered to your own account.
- Use a dedicated R2 bucket with a public/custom domain for ride and post images.
- Set `BETTER_AUTH_SECRET` to a strong, stable secret.

---

## License

This project is private and not licensed for public use.
