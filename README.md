<!-- README.md -->

# BuildOS Platform

AI-powered productivity platform. Users write stream-of-consciousness "brain dumps" and AI extracts projects, tasks, and context. Includes daily brief generation, calendar integration, ontology-driven project management, and an agentic chat system.

This is the unified monorepo for the web app, background worker, and shared packages.

## Structure

```
buildos-platform/
├── apps/
│   ├── web/                  # SvelteKit 2 + Svelte 5 web app (Vercel)
│   └── worker/               # Node.js background worker (Railway)
├── packages/
│   ├── shared-types/         # Generated DB types, queue types, API types
│   ├── shared-utils/         # Logging, metrics, shared utilities
│   ├── smart-llm/            # LLM abstraction (OpenRouter + fallbacks)
│   ├── supabase-client/      # Shared Supabase client configuration
│   └── twilio-service/       # SMS / Twilio integration
├── docs/                     # Cross-cutting docs (architecture, marketing, ops)
├── scripts/                  # Type generation, schema extraction, tooling
└── supabase/                 # Migrations and local Supabase config
```

## Tech Stack

- **Monorepo**: Turborepo + pnpm workspaces
- **Web**: SvelteKit 2 + Svelte 5 (runes) on Vercel (`nodejs22.x`)
- **Worker**: Node.js + Express on Railway (Node 20+)
- **Queue**: Redis-free — Supabase-backed queue with PostgreSQL RPCs
- **Database**: Supabase (PostgreSQL + Row Level Security)
- **LLMs**: OpenRouter (primary) → OpenAI / Anthropic fallback; optional direct Moonshot for Kimi
- **Auth**: Supabase Auth + Google OAuth
- **Billing**: Stripe (optional, behind `PRIVATE_ENABLE_STRIPE`)
- **SMS**: Twilio

## Getting Started

### Prerequisites

- Node.js **≥ 20.19** (Vercel runtime is `nodejs22.x`)
- pnpm **≥ 9**
- A Supabase project
- OpenRouter API key (or OpenAI/Anthropic as fallback)

### Install & run

```bash
pnpm install

# Dev (all apps via Turborepo)
pnpm dev

# Single app
pnpm dev --filter=web       # http://localhost:5173
pnpm dev --filter=worker    # http://localhost:3001
```

### Environment

Copy `.env.example` to `.env` and fill in the required values. The full list lives in `.env.example`; the essentials are:

```bash
# Supabase
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
PUBLIC_SUPABASE_PROJECT_ID=
PRIVATE_SUPABASE_SERVICE_KEY=

# LLMs (OpenRouter is primary; OpenAI/Anthropic are fallbacks)
PRIVATE_OPENROUTER_API_KEY=
PRIVATE_OPENAI_API_KEY=
PRIVATE_ANTHROPIC_API_KEY=

# Google OAuth (Calendar)
PUBLIC_GOOGLE_CLIENT_ID=
PRIVATE_GOOGLE_CLIENT_SECRET=

# Web ↔ Worker
PUBLIC_RAILWAY_WORKER_URL=http://localhost:3001
PRIVATE_RAILWAY_WORKER_TOKEN=

# Stripe (optional)
PRIVATE_ENABLE_STRIPE=false
```

Naming convention: `PUBLIC_*` for client-accessible, `PRIVATE_*` for server-only.

## Common Commands

```bash
# Quality
pnpm typecheck                    # All apps
pnpm lint                         # All apps
pnpm lint:fix
pnpm format                       # Prettier
pnpm pre-push                     # typecheck + test + lint + build

# Tests
pnpm test                         # Full suite
pnpm test:run                     # No watch mode
cd apps/web && pnpm test path/to/file.test.ts    # Single file
cd apps/web && pnpm test:llm      # LLM prompt tests (real API; costs money)
cd apps/worker && pnpm test:scheduler

# Build
pnpm build
pnpm build --filter=web
pnpm build --filter=worker

# Generation
pnpm gen:types                    # Regenerate Supabase types
pnpm gen:schema                   # Extract DB schema
pnpm gen:all                      # Full regen: types + schema + web assets + typecheck
```

Always use `pnpm`. Never `npm` or `yarn`.

## Deployment

- **Web** → Vercel. Config in `vercel.json`. Cron jobs for dunning, trial reminders, billing ops, welcome sequence, and security retention run from Vercel.
- **Worker** → Railway. Config in `railway.toml` + `nixpacks.toml`. Healthcheck at `/health`.

See `docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md` for the full topology.

## Conventions (Quick Reference)

- **Svelte 5 runes only** — `$state`, `$derived`, `$effect`. Never old reactive syntax.
- **API responses** — JSON endpoints must use `ApiResponse` from `$lib/utils/api-response`. Protocol endpoints (SSE, file downloads, webhooks, tracking pixels) may return raw responses.
- **Supabase access** — API routes use `locals.supabase` (user-scoped, RLS). Admin operations use `createAdminSupabaseClient()` from `$lib/supabase/admin`.
- **Design system** — [Inkprint](./apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md). All components support light + dark modes with `dark:` prefix.
- **Formatting** — Tabs, single quotes, no trailing commas, 100-char print width. Configured in root Prettier.

Full guidelines in [`CLAUDE.md`](./CLAUDE.md).

## Documentation

- [Web app](./apps/web/README.md) — SvelteKit app
- [Worker service](./apps/worker/README.md) — background jobs & scheduler
- [Docs hub](./docs/README.md) — cross-cutting docs
- [Architecture overview](./docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md)
- [Queue system](./docs/architecture/diagrams/QUEUE-SYSTEM-FLOW.md)
- [Inkprint design system](./apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md)
- [Marketing docs](./docs/marketing/START_HERE.md)
- [CLAUDE.md](./CLAUDE.md) ⭐ — full working guide for contributors and AI agents

## Security

- Service role key is server-side only; never shipped to the browser.
- RLS enforced on all user-scoped tables.
- Stripe webhook signatures verified.
- Consumption billing guard blocks mutations for frozen accounts (402 response) in `hooks.server.ts`.

Report issues to the maintainers privately — see `docs/SECURITY.md`.
