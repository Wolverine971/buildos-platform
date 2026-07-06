<!-- apps/web/docs/README.md -->

# Web App Documentation

## 🧭 Quick Navigation

**📍 NEW: [NAVIGATION INDEX](./NAVIGATION_INDEX.md)** - Complete guide to finding any documentation quickly

## 🌐 Deployment Target: Vercel

This is **web app-specific** documentation (`/apps/web`).

**For worker docs**, see `/apps/worker/docs/`
**For shared concerns**, see `/docs/`

## What This App Does

- User-facing UI (brain dumps, projects, calendar, dashboard)
- SvelteKit API routes (SSE streaming, CRUD operations)
- Real-time updates via Supabase subscriptions
- Google Calendar integration (frontend + API)
- Stripe payments (optional, via `PRIVATE_ENABLE_STRIPE` flag)

## Tech Stack

- **Framework:** SvelteKit 2 + Svelte 5 (runes syntax)
- **Database:** Supabase (via `@buildos/supabase-client`)
- **Auth:** Supabase Auth + Google OAuth
- **AI:** OpenRouter primary via shared LLM services, with OpenAI/Anthropic fallbacks where configured
- **Deployment:** Vercel (serverless functions)
- **Shared Packages:** `@buildos/shared-types`, `@buildos/supabase-client`

## Documentation Structure

| Folder               | Contents                          | README | Key Documents                                                      |
| -------------------- | --------------------------------- | ------ | ------------------------------------------------------------------ |
| `/features/`         | Feature specs and designs         | Yes    | agentic-chat, calendar, notifications, ontology, onboarding        |
| `/design/`           | Design system and UI specs        | Yes    | design principles, page patterns, context architecture             |
| `/development/`      | Dev guides and conventions        | Yes    | testing, patterns, setup, migration tracking                       |
| `/operations/`       | Deployment and ops                | Yes    | Vercel config, deployment runbooks                                 |
| `/migrations/`       | Migration tracking                | Yes    | completed migration notes                                          |
| `/integrations/`     | Third-party services              | Yes    | integration notes for external services                            |
| `/prompts/`          | LLM prompt templates              | Yes    | brain dump prompts, agent prompts, compression prompts             |
| `/technical/`        | Detailed technical documentation  | Yes    | architecture, API, audits, components, database, services, testing |
| `/technical/audits/` | Technical audits and review plans | No     | current implementation audits and handoffs                         |

**Note:**

- Some documentation exists in both `/features/` and `/technical/` for comprehensive coverage
- Current audit/review work lives under `/technical/audits/`

## Quick Start for LLM Agents

### Understanding a Feature

1. Read spec: `/features/[feature-name]/`
2. Check detailed architecture: `/technical/architecture/[feature-name].md`
3. Review components: `/apps/web/src/lib/components/[feature]/`
4. Check API: `/technical/api/endpoints/[feature].md`

### Adding a Feature

1. Create spec: `/features/[new-feature]/README.md`
2. Document architecture: `/technical/architecture/[new-feature].md`
3. Document API: `/technical/api/endpoints/[new-feature].md`
4. Implement in: `/apps/web/src/`
5. Add tests: `/apps/web/src/lib/**/__tests__/`
6. Update this README with new feature

### Debugging

1. Check runbooks: `/operations/runbooks/`
2. Review technical docs: `/technical/deployment/runbooks/`
3. Check Vercel logs
4. Review error logs in database

## Key Features

### 🤖 Agentic Chat

**Location:** `/features/agentic-chat/`
**Implementation Status:** Current V2 stream/prewarm path documented as of July 2026

Production chat surface with:

- V2 stream API, cancel API, and prepared-prompt prewarm
- Context/project/focus routing
- Tool discovery and direct tool execution
- Turn observability, timing metrics, and session persistence
- Image attachments with stream-time validation

### Brain Dump System

**Location:** `/features/braindump-context/`

Stream-of-consciousness input that AI processes into projects and tasks. Supports:

- Text and voice input
- Dual processing for complex brain dumps
- Short processing for quick updates
- Real-time streaming progress
- Phase generation with intelligent scheduling

### Calendar Integration

**Location:** `/features/calendar-integration/`  
**Architecture:** `/technical/architecture/calendar-sync.md`

Google Calendar sync with bidirectional updates:

- OAuth integration
- Event sync
- Webhook notifications
- Conflict resolution
- Task scheduling based on calendar availability

### Notification System

**Location:** `/features/notifications/`  
**Implementation:** `NOTIFICATION_SYSTEM_IMPLEMENTATION.md`

Stackable notification system for long-running processes:

- Minimized view
- Modal view
- Background processing
- Multiple concurrent notifications

### Project Management

**Location:** `/features/` (various project-related docs)
**API:** `/technical/api/endpoints/projects.md`

Project and task organization:

- Project creation and management
- Task lists with priorities
- Phase-based organization
- Calendar integration

### Admin Dashboard (LLM Usage Tracking)

**Location:** `/features/admin-dashboard/`
**Implementation:** `/technical/services/LLM_USAGE_IMPLEMENTATION_SUMMARY.md`

Admin dashboard for monitoring LLM API usage, costs, and performance:

- Real-time usage metrics and cost tracking
- Model and operation breakdowns
- User cost analytics
- Performance monitoring

## 🔍 Feature Audits & Implementation Status

**Location:** `/technical/audits/`

Comprehensive reviews, repair plans, and handoffs for current implementation work. Recent examples include:

- Agentic chat live sync, search, security, and empty-synthesis repair plans
- Admin chat/session extraction and analytics audits
- Onboarding and marketing-site implementation reviews

## Development Commands

```bash
# Development
pnpm dev               # Standard dev server
pnpm dev:split         # Dev with type checking in parallel (recommended)
pnpm dev:clean         # Clear local Vite/SvelteKit cache, then start dev

# Testing
pnpm test              # Unit tests
pnpm test:watch        # Watch mode
pnpm test:llm          # LLM prompt tests (costs money - uses OpenAI API)

# Code Quality
pnpm typecheck         # Type checking
pnpm lint              # Lint code
pnpm lint:fix          # Auto-fix linting issues

# Building
pnpm build             # Production build
cd ../.. && pnpm build --filter=@buildos/web  # Build from monorepo root
```

## Environment Variables

See [Deployment Environment Checklist](/docs/operations/environment/DEPLOYMENT_ENV_CHECKLIST.md) for complete list.

**Essential variables:**

```bash
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
PRIVATE_SUPABASE_SERVICE_KEY=
PRIVATE_OPENROUTER_API_KEY=
PRIVATE_OPENAI_API_KEY=
PUBLIC_GOOGLE_CLIENT_ID=
PRIVATE_GOOGLE_CLIENT_SECRET=
```

## Deployment

See `/operations/deployment/` for complete deployment guides:

- [Vercel Configuration Guide](operations/deployment/VERCEL_CONFIGURATION_GUIDE.md)
- [Deployment Checklist](operations/deployment/READY_TO_DEPLOY.md)
- [Vercel Deployment Fix](operations/deployment/VERCEL_DEPLOYMENT_FIX.md)

## Migrations

Migration notes live in `/migrations/` with completed migration records under `/migrations/completed/`.

## Related Documentation

- **System-wide**: `/docs/architecture/`
- **Worker service**: `/apps/worker/docs/`
- **Shared types**: `/packages/shared-types/`
- **Deployment Topology**: `/docs/DEPLOYMENT_TOPOLOGY.md`
- **Task Index**: `/docs/TASK_INDEX.md`
