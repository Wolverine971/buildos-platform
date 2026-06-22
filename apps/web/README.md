<!-- apps/web/README.md -->

# @buildos/web

SvelteKit 2 + Svelte 5 web app for BuildOS. Deployed to Vercel (`nodejs22.x`).

This app hosts the user-facing UI, all REST/SSE API routes, the agentic chat system, brain dump ingestion, ontology-driven project views, dashboard, calendar integration, billing, and marketing pages.

> For the monorepo-level overview, see the root [README](../../README.md) and [CLAUDE.md](../../CLAUDE.md).

## Tech Stack

- **Framework** — SvelteKit 2 + Svelte 5 (runes only)
- **Styling** — Tailwind CSS + the [Inkprint](./docs/technical/components/INKPRINT_DESIGN_SYSTEM.md) design system
- **Data** — Supabase (PostgreSQL + RLS) via `@buildos/supabase-client`
- **Auth** — Supabase Auth + Google OAuth
- **LLMs** — `@buildos/smart-llm` (OpenRouter primary, OpenAI/Anthropic fallback, optional Moonshot for Kimi)
- **Payments** — Stripe, gated by `PRIVATE_ENABLE_STRIPE`
- **SMS** — `@buildos/twilio-service`
- **Editor** — TipTap, CodeMirror
- **Graph** — AntV G6, Cytoscape, XYFlow
- **Deployment** — Vercel serverless + cron (see `vercel.json`)

## Quick Start

From the monorepo root:

```bash
pnpm install
pnpm dev --filter=web     # http://localhost:5173
```

Requires Node ≥ 20.19 and pnpm ≥ 9. Copy the root `.env.example` to `.env` first.

## Directory Layout

```
apps/web/src/
├── routes/
│   ├── api/                # ~49 API route groups (REST + SSE)
│   ├── (public)/           # Public marketing / content pages
│   └── ...                 # App routes
├── lib/
│   ├── components/         # UI components, organized by feature
│   ├── services/           # Client + shared services (brain dump, chat, calendar, ...)
│   ├── server/             # Server-only: billing, braindump processing, OCR, ontology...
│   ├── stores/             # Svelte stores
│   ├── config/             # Feature configuration
│   ├── supabase/           # Supabase clients (server + admin)
│   ├── types/              # App-specific types
│   ├── ui/                 # Design-system primitives
│   └── utils/              # Helpers incl. ApiResponse
├── hooks.server.ts         # Auth, consumption billing guard, server timing
└── app.html
```

Path aliases: `$components` → `src/lib/components`, `$ui` → `src/lib/ui`, `$utils` → `src/lib/utils`.

## Key Conventions

### Svelte 5 runes

```svelte
let count = $state(0);
let doubled = $derived(count * 2);
$effect(() => { /* side effect */ });
```

Never use the old reactive syntax.

### API responses

All JSON endpoints use `ApiResponse` from `$lib/utils/api-response`:

```ts
import { ApiResponse, requireAuth } from '$lib/utils/api-response';

const auth = await requireAuth(locals);
if ('error' in auth) return auth.error;

return ApiResponse.success(data);
// or: ApiResponse.badRequest, unauthorized, notFound, databaseError, ...
```

Protocol endpoints (SSE streams, file downloads, tracking pixels, webhooks) may return raw `Response` objects.

**Quick drift check:**

```bash
# Routes still using raw json() — should only be protocol endpoints
rg -l "return json\(" src/routes/api --glob '+server.ts'
```

### Supabase access

- User-scoped (respects RLS): `locals.supabase` inside endpoints.
- Admin (service role): `createAdminSupabaseClient()` from `$lib/supabase/admin`.

### Auth & billing flow

`hooks.server.ts` per-request:

1. Builds the Supabase client and exposes `safeGetSession()`.
2. Runs the consumption billing guard — blocks mutations for frozen accounts with a 402 response.
3. Instruments `Server-Timing` headers. Enable verbose timing with `PERF_TIMING=true` (and `PERF_LOG_SLOW=true` to log slow requests).

### Design system

Current system is **Inkprint** — see [`docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`](./docs/technical/components/INKPRINT_DESIGN_SYSTEM.md). All components must support light + dark modes with the `dark:` prefix.

## Scripts

```bash
# Dev
pnpm dev              # Vite dev server
pnpm dev:fast         # Skip type checking
pnpm dev:split        # Dev + svelte-check in parallel (recommended)

# Checks
pnpm check            # svelte-kit sync + svelte-check
pnpm lint             # ESLint + guardrail scripts
pnpm lint:fix         # Lint + Prettier
pnpm test             # Vitest
pnpm test:llm         # LLM prompt tests (real API — costs money)

# Build
pnpm build
pnpm build:analyze    # Bundle analyzer

# Pre-push
pnpm pre-push         # check + test + lint + build:prod

# Generation
pnpm gen:web          # blog context + sitemap + streamlined project context
pnpm gen:embeddings
pnpm gen:api-docs
```

## Feature Flags

Set in env (see root `.env.example`):

- `PRIVATE_ENABLE_STRIPE` — enable payment processing (off = graceful degradation, trial system still works).

## Deployment (Vercel)

- `vercel.json` defines the build command (`turbo build --force --filter=@buildos/web...`), security headers, long-cache static assets, and cron jobs:
    - `/api/cron/dunning` — daily 09:00 UTC
    - `/api/cron/trial-reminders` — daily 10:00 UTC
    - `/api/cron/billing-ops-monitoring` — daily 11:00 UTC
    - `/api/cron/welcome-sequence` — hourly
    - `/api/cron/security-events-retention` — daily 04:30 UTC
- Adapter: `@sveltejs/adapter-vercel` with `runtime: 'nodejs22.x'`.

## Documentation

- [Web docs hub](./docs/README.md)
- [Navigation index](./docs/NAVIGATION_INDEX.md)
- [Inkprint design system](./docs/technical/components/INKPRINT_DESIGN_SYSTEM.md)
- [Features](./docs/features/) — brain dump, agentic chat, calendar, ontology, notifications, onboarding, time blocks, etc.
- [Technical](./docs/technical/) — architecture, API, testing, deployment, performance
- [API reference](./docs/technical/api/) — generated via `pnpm docs:api`

## Contributing

Follow the monorepo workflow. Before pushing: `pnpm pre-push` from the repo root, or `pnpm pre-push` inside `apps/web` for web-only checks. Conventions live in the root [CLAUDE.md](../../CLAUDE.md).
