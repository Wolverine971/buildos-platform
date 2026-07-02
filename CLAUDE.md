<!-- CLAUDE.md -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (ALWAYS pnpm, NEVER npm)
pnpm install

# Development
pnpm dev                          # All apps via Turborepo
pnpm dev --filter=web             # SvelteKit web app only (localhost:5173)
pnpm dev --filter=worker          # Worker service only (localhost:3001)

# Testing
pnpm test                         # All tests across monorepo
pnpm test:run                     # Run once without watch
cd apps/web && pnpm test path/to/file.test.ts   # Single test file
cd apps/web && pnpm test:llm      # LLM prompt tests (uses real API, costs money)
cd apps/worker && pnpm test:run   # Worker tests once
cd apps/worker && pnpm test:scheduler  # Scheduler-specific tests

# Code quality
pnpm typecheck                    # Type checking all apps
pnpm lint                         # Lint all apps
pnpm lint:fix                     # Auto-fix lint issues
pnpm format                       # Prettier formatting
pnpm pre-push                     # Full validation: typecheck + test + lint + build

# Building
pnpm build                        # Build all apps
pnpm build --filter=web           # Build web only
pnpm build --filter=worker        # Build worker only

# Type/schema generation
pnpm gen:types                    # Generate Supabase types
pnpm gen:schema                   # Extract database schema
pnpm gen:all                      # Full regeneration pipeline (types + schema + web assets + typecheck)
```

## Architecture

**BuildOS** is an AI-powered productivity platform. Users write stream-of-consciousness "brain dumps" and AI extracts projects, tasks, and context. The platform includes daily brief generation, calendar integration, ontology-driven project management, and an agentic chat system.

### Monorepo Layout (Turborepo + pnpm workspaces)

- **`apps/web`** — SvelteKit 2 + Svelte 5 frontend, deployed to **Vercel** (nodejs22.x runtime)
- **`apps/worker`** — Node.js + Express background worker, deployed to **Railway**
- **`packages/shared-types`** — TypeScript types (database schema, queue types, API types)
- **`packages/shared-utils`** — Logging and metrics utilities
- **`packages/smart-llm`** — LLM abstraction layer (OpenRouter primary, OpenAI/Anthropic fallback, Moonshot for Kimi models)
- **`packages/supabase-client`** — Shared Supabase client configuration
- **`packages/twilio-service`** — SMS/Twilio integration
- **`packages/shared-agent-ops`** — Agent operation layer shared by the web agent-call gateway and the worker Agent Run runner (op policy/scope, ontology mutation core, task/document state normalizers)
- **`packages/buildos-mcp-server`** — Local stdio MCP bridge (`@buildos/mcp-server`) that proxies a local MCP client to the remote BuildOS connector at `/mcp/buildos`

### Web App (`apps/web`)

SvelteKit app with path aliases: `$components` → `src/lib/components`, `$ui` → `src/lib/components/ui`, `$utils` → `src/lib/utils`.

**Key directories:**

- `src/routes/api/` — ~49 API route groups (REST + SSE endpoints)
- `src/routes/(public)/` — Public-facing pages
- `src/lib/services/` — Business logic services (brain dump, calendar, chat, dashboard, etc.)
- `src/lib/server/` — Server-only modules (billing, braindump processing, onboarding, OCR, ontology classification, agent runs, project loops, welcome/retargeting sequences)
- `src/lib/stores/` — Svelte stores (dashboard, navigation, notifications, brain dump, etc.)
- `src/lib/components/` — UI components organized by feature domain
- `src/lib/config/` — Feature configuration (calendar colors, billing, forms, onboarding, trial)
- `src/lib/supabase/` — Supabase clients (`index.ts` server, `admin.ts` service role, `authenticated.ts`)
- `src/lib/types/` — App-specific TypeScript types
- `src/lib/components/ui/` — Design-system primitives (`$ui` alias)
- `src/lib/utils/` — Helpers incl. `ApiResponse` (`$utils` alias)

**Auth flow:** Supabase Auth + Google OAuth. `hooks.server.ts` creates the Supabase client per-request, validates JWT via `safeGetSession()`, and attaches `user`/`session`/`supabase` to `event.locals`. Consumption billing guards block mutations for frozen accounts (402 response).

**Server timing:** `hooks.server.ts` instruments request performance via `Server-Timing` headers. Set `PERF_TIMING=true` and `PERF_LOG_SLOW=true` in env to enable.

### Worker (`apps/worker`)

Express server with three main components:

- **API Server** (`src/index.ts`) — REST endpoints for job management
- **Worker** (`src/worker.ts`) — Supabase queue consumer processing jobs (briefs + audio narration, braindumps, notifications, chat classification, voice transcription, OCR, ontology, agent runs, project loops, project icons, SMS)
- **Scheduler** (`src/scheduler.ts`) — Cron-based job scheduling with timezone-aware brief generation and engagement backoff

**Queue system:** Redis-free. Jobs live in `queue_jobs`; workers claim rows atomically via Supabase RPCs (`add_queue_job`, `claim_pending_jobs`, `complete_queue_job`, `fail_queue_job`) using `FOR UPDATE SKIP LOCKED`. `SupabaseQueue` defaults: `pollInterval=5s`, `batchSize=5`, `stalledTimeout=5min`. The `JobAdapter` in `workers/shared/jobAdapter.ts` bridges the legacy BullMQ-style processor interface to the Supabase queue.

**Active job types** (registered in `src/worker.ts`): `generate_daily_brief`, `onboarding_analysis`, `send_notification`, `project_activity_batch_flush`, `schedule_daily_sms`, `send_sms`, `classify_chat_session`, `process_onto_braindump`, `transcribe_voice_note`, `generate_brief_audio`, `extract_onto_asset_ocr`, `agent_run`, `build_project_context_snapshot`, `generate_project_icon`, `buildos_project_loop`, `sync_calendar`.

### LLM Integration (`packages/smart-llm`)

Routes through **OpenRouter** as the primary provider with model selection based on task complexity (speed/smartness/cost scoring). Models are defined in `model-config.ts` with JSON and text profiles. Supports streaming, tool calling, and JSON mode. Falls back to direct OpenAI/Anthropic. Optional Moonshot direct routing for Kimi models.

### Database

**Supabase (PostgreSQL + RLS).** Generated types live in `packages/shared-types/src/database.types.ts`; the schema snapshot lives alongside as `database.schema.ts`. Full OpenAPI specs are at `supabase.openapi.json` (v2) and `supabase.openapi3.json` (v3). Migrations are in `supabase/migrations/`.

API routes access Supabase via `locals.supabase` (user-scoped, respects RLS). Admin operations use `createAdminSupabaseClient()` from `$lib/supabase/admin`. Regenerate types + schema + web assets with `pnpm gen:all`.

## Key Conventions

### Svelte 5 Runes

Always use Svelte 5 runes syntax. Never use the old reactive syntax.

```svelte
let count = $state(0);
let doubled = $derived(count * 2);
$effect(() => { /* side effects */ });
```

### API Response Pattern

All JSON API endpoints must use `ApiResponse` from `$lib/utils/api-response`:

```typescript
import { ApiResponse, requireAuth } from '$lib/utils/api-response';

// Success
return ApiResponse.success(data);

// Auth check
const auth = await requireAuth(locals);
if ('error' in auth) return auth.error;

// Errors
return ApiResponse.badRequest('message');
return ApiResponse.unauthorized();
return ApiResponse.notFound('Resource');
return ApiResponse.databaseError(error);
```

Protocol endpoints (SSE streams, file downloads, tracking pixels, webhooks) may return raw responses.

### Design System: Inkprint

The current design system is **Inkprint** (see `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`). Uses synesthetic texture-based design language inspired by halftone printing and field notes. Key tokens: `bg-card`, `text-foreground`, `shadow-ink`, texture classes like `tx-bloom`, `tx-grain`. All components must support light and dark modes with `dark:` prefix.

Lucide root imports are Vite-aliased through `apps/web/src/lib/icons/lucide.ts`; when adding a new `lucide-svelte` icon, verify the exact installed icon subpath and add the matching re-export there before using it.

### Formatting

Prettier config: tabs, single quotes, no trailing commas, 100 char print width. Svelte files use the `svelte` parser via `prettier-plugin-svelte`.

### Environment Variables

Prefix conventions: `PUBLIC_` for client-accessible, `PRIVATE_` for server-only. See `.env.example` for the complete list. Key groups: Supabase, AI/LLM (OpenRouter primary + OpenAI fallback, optional Moonshot for Kimi), Google OAuth, Stripe (optional via `PRIVATE_ENABLE_STRIPE`), Worker communication (`PUBLIC_RAILWAY_WORKER_URL` + `PRIVATE_RAILWAY_WORKER_TOKEN`), Twilio/SMS, PostHog analytics (`PUBLIC_POSTHOG_KEY` + `PUBLIC_POSTHOG_HOST`, optional — no-ops without a key).

Notable feature flags:

- `PRIVATE_ENABLE_STRIPE` — enable payment processing; off = graceful degradation, trial system still works.
- `PERF_TIMING=true` + `PERF_LOG_SLOW=true` — enable `Server-Timing` headers and slow-request logs.

## Deployment

- **Web → Vercel.** `vercel.json` defines the build (`turbo build --filter=@buildos/web...`), security headers, long-cache asset rules, and cron jobs (dunning, trial reminders, billing-ops monitoring, welcome sequence, reactivation sequence, security-events retention). Adapter: `@sveltejs/adapter-vercel` pinned to `nodejs22.x`.
- **Worker → Railway.** `railway.toml` + `nixpacks.toml` at the repo root drive the build; start command is `node apps/worker/dist/index.js`; healthcheck `GET /health`.
- **CI → GitHub Actions.** `.github/workflows/ci.yml` runs `turbo typecheck`, `turbo lint`, and `turbo test:run` on pushes to `main` and all PRs, seeding placeholder env from the `.env.example` files (no real secrets in CI).

## Documentation

- `apps/web/docs/` — Web app feature docs, technical architecture, components, API
- `apps/worker/docs/` — Worker features, daily briefs, queue system, scheduler analysis
- `docs/` — Cross-cutting docs (architecture diagrams, integrations, operations, marketing)
- `apps/web/docs/technical/architecture/` — Architecture decisions (ADRs), system flows
- `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md` — Design system reference
- `docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md` — Cross-service topology
- `docs/architecture/diagrams/QUEUE-SYSTEM-FLOW.md` — Queue internals

## Marketing Documentation

**Start here:** `docs/marketing/START_HERE.md` — single entry point for all marketing work, with current campaign status and reading order. `docs/marketing/INDEX.md` has the full index (brand, investors, growth, social, segments). Don't duplicate marketing reading lists here — they drift out of sync with START_HERE.md, which is the maintained source of truth.

BuildOS uses an **anti-AI marketing strategy**: do not lead with AI, lead with relief. Public category: **"thinking environment for people making complex things."** Core promise: **"turn messy thinking into structured work."**
