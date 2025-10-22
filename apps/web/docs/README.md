# Web App Documentation

## 🌐 Deployment Target: Vercel

This is **web app-specific** documentation (`/apps/web`).

**For worker docs**, see `/apps/worker/docs/`  
**For shared concerns**, see `/docs/`

## What This App Does

- User-facing UI (brain dumps, projects, calendar, dashboard)
- SvelteKit API routes (SSE streaming, CRUD operations)
- Real-time updates via Supabase subscriptions
- Google Calendar integration (frontend + API)
- Stripe payments (optional, via `ENABLE_STRIPE` flag)

## Tech Stack

- **Framework:** SvelteKit 2 + Svelte 5 (runes syntax)
- **Database:** Supabase (via `@buildos/supabase-client`)
- **Auth:** Supabase Auth + Google OAuth
- **AI:** OpenAI API with streaming support
- **Deployment:** Vercel (serverless functions)
- **Shared Packages:** `@buildos/shared-types`, `@buildos/supabase-client`

## Documentation Structure

| Folder           | Contents                           | README | Key Documents                                                    |
| ---------------- | ---------------------------------- | ------ | ---------------------------------------------------------------- |
| `/features/`     | Feature specs and designs          | ⭐ Yes | brain-dump, calendar, notifications, onboarding, admin-dashboard |
| `/audits/`       | Feature audits & implementation    | ⭐ Yes | Core columns, notifications, implementation reviews              |
| `/design/`       | Design system and UI specs         | ⭐ Yes | style guide, design patterns, component standards                |
| `/development/`  | Dev guides and conventions         | Yes    | testing, patterns, setup, migration tracking                     |
| `/operations/`   | Deployment and ops                 | ⭐ Yes | Vercel config, runbooks, monitoring                              |
| `/migrations/`   | Migration tracking                 | ⭐ Yes | active migrations (Phase 2.2, Phase 3, type updates)             |
| `/integrations/` | Third-party services               | ⭐ Yes | Stripe (50%), Google Calendar, OAuth, OpenAI, Twilio (planned)   |
| `/prompts/`      | LLM prompt templates               | Yes    | brain dump prompts, AI processing                                |
| `/technical/`    | Technical documentation (detailed) | No     | architecture, API, database, services, deployment                |

**Note:**

- ⭐ **NEW directories with README.md files** for easy navigation
- Some documentation exists in both `/features/` and `/technical/` for comprehensive coverage
- `/audits/` contains feature-specific implementation reviews (NEW as of Oct 20, 2025)

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

### Brain Dump System

**Location:** `/features/brain-dump/`  
**Architecture:** `/technical/architecture/brain-dump-flow.md`

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

**Location:** `/audits/` (NEW - Oct 20, 2025)

Comprehensive reviews of feature implementations:

- **Core Columns** (⚠️ **CRITICAL GAPS**) - 9 new core dimension columns partially integrated
- **Notifications Logging** (✅ Complete) - End-to-end correlation tracking system
- **Notification Preferences** (✅ Complete) - Notification preferences refactor

See `/audits/README.md` for full audit status and details.

## Development Commands

```bash
# Development
pnpm dev               # Standard dev server
pnpm dev:split         # Dev with type checking in parallel (recommended)
pnpm dev:fast          # Quick dev without type checking

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
cd .. && pnpm build --filter=web  # Build from monorepo root
```

## Environment Variables

See [Deployment Environment Checklist](/docs/operations/environment/DEPLOYMENT_ENV_CHECKLIST.md) for complete list.

**Essential variables:**

```bash
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
PRIVATE_SUPABASE_SERVICE_KEY=
OPENAI_API_KEY=
PUBLIC_GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

## Deployment

See `/operations/deployment/` for complete deployment guides:

- [Vercel Configuration Guide](operations/deployment/VERCEL_CONFIGURATION_GUIDE.md)
- [Deployment Checklist](operations/deployment/READY_TO_DEPLOY.md)
- [Vercel Deployment Fix](operations/deployment/VERCEL_DEPLOYMENT_FIX.md)

## Migrations

### Active Migrations

See `/migrations/active/` for completed and ongoing migration work:

- **Phase 2.2**: Store structure flattening (`PHASE_2_2_STORE_FLATTENING.md`)
- **Phase 3**: Performance optimizations (`PHASE_3_PERFORMANCE_OPTIMIZATIONS.md`)
- **Phase 2**: Brain dump migration (`PHASE_2_BRAIN_DUMP_MIGRATION_STATUS.md`)
- **Type System**: Type updates and fixes (`TYPE_UPDATE_PROGRESS.md`, `TYPEFIX_PLAN.md`)
- **Implementation**: Progress tracking (`IMPLEMENTATION_PROGRESS.md`)

## Related Documentation

- **System-wide**: `/docs/architecture/`
- **Worker service**: `/apps/worker/docs/`
- **Shared types**: `/packages/shared-types/`
- **Deployment Topology**: `/docs/DEPLOYMENT_TOPOLOGY.md`
- **Task Index**: `/docs/TASK_INDEX.md`
