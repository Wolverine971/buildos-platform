# CLAUDE.md - BuildOS Platform (Turborepo Monorepo)

⚠️ **IMPORTANT**: This is a BuildOS platform codebase. ALWAYS use `pnpm` (never `npm`). The project uses Svelte 5 with new runes syntax (`$state`, `$derived`, `$effect`) - not the old reactive syntax.

## 🎯 Quick Start

**This is a monorepo-level guide.** For detailed app-specific documentation:

- **Web App (SvelteKit)**: See `/apps/web/CLAUDE.md`
- **Worker Service (Node.js)**: See `/apps/worker/CLAUDE.md`

## 🏗️ Monorepo Structure

BuildOS is a **Turborepo monorepo** with two independently deployed applications and shared packages.

```
buildos-platform/
├── /apps/
│   ├── /web/              → Vercel (SvelteKit + Svelte 5)
│   └── /worker/           → Railway (Node.js + Express)
├── /packages/
│   ├── /shared-types/     → Shared TypeScript types
│   ├── /supabase-client/  → Database client
│   ├── /twilio-service/   → SMS service
│   └── /config/           → Shared configuration
└── /docs/                 → Cross-cutting documentation
```

## 📚 Documentation Navigation

### Essential Entry Points

| When You Want To...               | Start Here                                                  |
| --------------------------------- | ----------------------------------------------------------- |
| **Find web app documentation** ⭐ | `/apps/web/docs/NAVIGATION_INDEX.md` (complete navigation)  |
| **Understand the system**         | `/docs/README.md` (navigation hub)                          |
| **See web-worker communication**  | `/docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md` ⭐ |
| **See architecture & deployment** | `/docs/DEPLOYMENT_TOPOLOGY.md`                              |
| **Understand queue system**       | `/docs/architecture/diagrams/QUEUE-SYSTEM-FLOW.md`          |
| **Find a specific task**          | `/docs/TASK_INDEX.md` (task-based index)                    |
| **Work on web features**          | `/apps/web/docs/README.md` + `/apps/web/CLAUDE.md`          |
| **Work on background jobs**       | `/apps/worker/docs/README.md` + `/apps/worker/CLAUDE.md`    |
| **Learn monorepo workflows**      | `/docs/MONOREPO_GUIDE.md`                                   |

### Documentation by Scope

| Scope              | Location             | Contains                                |
| ------------------ | -------------------- | --------------------------------------- |
| **Monorepo-wide**  | `/docs/`             | Architecture, deployment, business docs |
| **Web App**        | `/apps/web/docs/`    | Features, components, API, operations   |
| **Worker Service** | `/apps/worker/docs/` | Daily briefs, queue system, scheduler   |
| **Packages**       | `/packages/*/docs/`  | Package usage and implementation        |

### Feature Documentation

| Feature                 | Documentation Path                              |
| ----------------------- | ----------------------------------------------- |
| **Ontology System** ⭐  | `/apps/web/docs/features/ontology/`             |
| Brain Dump System       | `/apps/web/docs/features/brain-dump/`           |
| Calendar Integration    | `/apps/web/docs/features/calendar-integration/` |
| Notification System     | `/apps/web/docs/features/notifications/`        |
| Onboarding Flow         | `/apps/web/docs/features/onboarding/`           |
| Daily Briefs (Worker)   | `/apps/worker/docs/features/daily-briefs/`      |
| **Modal Components** ⭐ | `/apps/web/docs/technical/components/modals/`   |

### Architecture & Deployment

| Task                    | Documentation Path                                          |
| ----------------------- | ----------------------------------------------------------- |
| **System Architecture** | `/docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md` ⭐ |
| Queue System Flow       | `/docs/architecture/diagrams/QUEUE-SYSTEM-FLOW.md`          |
| Deployment Topology     | `/docs/DEPLOYMENT_TOPOLOGY.md`                              |
| Web → Vercel            | `/apps/web/docs/operations/deployment/`                     |
| Worker → Railway        | `/apps/worker/docs/README.md`                               |
| Environment Variables   | `/docs/operations/environment/DEPLOYMENT_ENV_CHECKLIST.md`  |
| Active Migrations       | `/apps/web/docs/migrations/active/`                         |

## Essential Commands

### Development

```bash
# Install dependencies (always use pnpm, never npm)
pnpm install

# Start all apps in development mode
pnpm dev

# Start specific app
pnpm dev --filter=web      # SvelteKit web app
pnpm dev --filter=worker   # Background worker service

# Fast development modes (web app)
cd apps/web && pnpm dev:split    # Dev server with type checking in parallel (recommended)
cd apps/web && pnpm dev:fast     # Quick dev without type checking
```

### Testing

```bash
# Run all tests across monorepo
pnpm test
pnpm test:run         # Run once without watch mode

# Web app specific tests
cd apps/web
pnpm test             # Unit tests
pnpm test:llm         # LLM prompt tests (uses real OpenAI API - costs money)
pnpm test:watch       # Watch mode

# Worker tests
cd apps/worker
pnpm test
pnpm test:scheduler   # Scheduler-specific tests
```

### Code Quality

```bash
# Type checking
pnpm typecheck

# Linting and formatting
pnpm lint
pnpm lint:fix         # Auto-fix issues
pnpm format           # Prettier formatting

# Pre-push validation (runs typecheck, test, lint, and build)
pnpm pre-push
```

### Build & Deploy

```bash
# Build all apps
pnpm build

# Build specific app
pnpm build --filter=web
pnpm build --filter=worker

# Clean build artifacts
pnpm clean
```

## 🎨 What is BuildOS?

BuildOS is an AI-powered productivity platform that transforms unstructured thoughts into actionable plans. It's designed for anyone struggling with disorganization who needs to get organized—from ADHD minds to overwhelmed professionals.

**Core Innovation:** Brain Dump System - users write stream-of-consciousness thoughts, and AI automatically extracts projects, tasks, and context.

### Tech Stack

| Layer          | Technology                                   |
| -------------- | -------------------------------------------- |
| **Monorepo**   | Turborepo + pnpm workspaces                  |
| **Web App**    | SvelteKit 2 + Svelte 5 (runes syntax)        |
| **Worker**     | Node.js + Express + BullMQ (Supabase queue)  |
| **Database**   | Supabase (PostgreSQL + RLS)                  |
| **AI/LLM**     | OpenAI API with streaming (DeepSeek primary) |
| **Auth**       | Supabase Auth + Google OAuth                 |
| **Deployment** | Vercel (web) + Railway (worker)              |

**Detailed Architecture:** See `/docs/DEPLOYMENT_TOPOLOGY.md`

## 💡 Key Conventions

### Svelte 5 Runes (Critical!)

```javascript
// ✅ Use NEW runes syntax:
let count = $state(0);
let doubled = $derived(count * 2);
$effect(() => {
	/* side effects */
});

// ❌ AVOID old reactive syntax:
// let count = 0;
// $: doubled = count * 2;
```

### Package Manager

**ALWAYS use `pnpm`, NEVER use `npm`.** This is critical for monorepo workspace integrity.

### Code Patterns & Architecture

For detailed patterns, see:

- **Web App Patterns:** `/apps/web/CLAUDE.md` (routes, components, stores, services)
- **Worker Patterns:** `/apps/worker/CLAUDE.md` (jobs, queue, scheduler)
- **Web Architecture:** `/apps/web/docs/technical/architecture/`
- **API Documentation:** `/apps/web/docs/technical/api/`

### UI/Design & API Patterns (Web App)

**Critical requirements for web development:**

#### UI Design Requirements

- **Responsive Design:** ALL components must work on mobile and desktop
- **Dark Mode:** Every component requires light/dark mode support with `dark:` prefix
- **Style Guide:** Always consult `/apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md`
- **Design Philosophy:** High-end Apple-inspired aesthetic with high information density
- **Components:** Use Card system (Card, CardHeader, CardBody, CardFooter)

#### API Patterns

- **Supabase Access:** Use `locals.supabase` in API routes (`+server.ts`)
- **Admin Operations:** Import via `createAdminSupabaseClient` from `$lib/supabase/admin`
- **Response Format:** ALWAYS use `ApiResponse` wrapper from `$lib/utils/api-response`

**See `/apps/web/CLAUDE.md` for complete UI/Design and API patterns with code examples.**

## 🎯 Context for LLM Agents

### Determining Scope

**Ask yourself:** "Which app does this affect?"

- **Web-only** (UI, API routes, frontend features) → `/apps/web/` → See `/apps/web/CLAUDE.md`
- **Worker-only** (background jobs, email, cron) → `/apps/worker/` → See `/apps/worker/CLAUDE.md`
- **Both apps** (architecture, database, shared types) → `/docs/` or `/packages/`
- **Package** (shared code) → `/packages/[package-name]/`

### Feature-Specific Guidance

| Feature/System           | Where to Learn More                                            |
| ------------------------ | -------------------------------------------------------------- |
| **Brain Dump Flow**      | `/apps/web/docs/features/brain-dump/README.md`                 |
| **Calendar Integration** | `/apps/web/docs/features/calendar-integration/README.md`       |
| **Notification System**  | `/apps/web/docs/features/notifications/README.md`              |
| **Daily Briefs**         | `/apps/worker/docs/features/daily-briefs/README.md`            |
| **Queue System**         | `/apps/worker/CLAUDE.md` (Worker Service Architecture section) |
| **Database Schema**      | `/apps/web/docs/technical/database/schema.md`                  |

## 🧪 Testing & Quality

```bash
# Run all tests
pnpm test

# LLM tests (costs money - uses real OpenAI API)
cd apps/web && pnpm test:llm

# Pre-push validation (typecheck + test + lint + build)
pnpm pre-push
```

**Testing Documentation:**

- **Web Testing:** `/apps/web/docs/technical/testing/`
- **Worker Testing:** `/apps/worker/docs/development/testing/`
- **Testing Checklist:** `/apps/web/docs/development/TESTING_CHECKLIST.md`

## ⚙️ Environment Configuration

See **complete environment setup:**

- `/docs/operations/environment/DEPLOYMENT_ENV_CHECKLIST.md`

**Essential variables** (from `.env.example`):

```bash
# Supabase (required)
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
PRIVATE_SUPABASE_SERVICE_KEY=

# OpenAI (required)
OPENAI_API_KEY=

# Google OAuth (required)
PUBLIC_GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

## 📝 Development Workflow

### Before Committing

```bash
pnpm lint:fix       # Auto-fix formatting
pnpm typecheck      # Check types
pnpm test:run       # Run tests
```

### Before Pushing

```bash
pnpm pre-push       # Complete validation (typecheck + test + lint + build)
```

### Documentation Updates (Critical)

**After making code changes, AI agents and developers MUST update documentation:**

- Update feature docs in appropriate `/apps/*/docs/features/` directory
- Update component READMEs for UI changes
- Update API documentation for endpoint changes
- Mark progress with completion status and known issues
- Document key decisions and implementation patterns

**Why:** Creates audit trail, prevents duplicate work, preserves knowledge for future developers and AI agents.

**See `/apps/web/CLAUDE.md` Development Workflow section for detailed documentation update patterns.**

### Working with Turborepo

- Use `--filter` flag for specific apps: `pnpm build --filter=web`
- Force bypass cache: `pnpm build --force`
- See `/docs/MONOREPO_GUIDE.md` for complete workflows

## 📝 Documentation Standards

**IMPORTANT:** When creating documentation, follow these rules:

### Where to Put Documentation

- **Research/Investigation:** `/thoughts/shared/research/YYYY-MM-DD_HH-MM-SS_topic.md`
    - Format: Timestamped research docs with YAML frontmatter
    - See: `.claude/commands/research_codebase_generic.md`

- **Architecture (System-wide):** `/docs/architecture/`
    - ADRs: `/docs/architecture/decisions/ADR-NNN-topic.md`
    - Diagrams: `/docs/architecture/diagrams/`

- **Web App Docs:** `/apps/web/docs/features/[feature]/`
    - Feature specs, component docs, API docs, operations

- **Worker Docs:** `/apps/worker/docs/features/[feature]/`
    - Job specs, queue system, scheduler, operations

- **Package Docs:** `/packages/[package]/docs/`
    - Usage guides, implementation details

**Complete Guidelines:** `/docs/DOCUMENTATION_GUIDELINES.md`

### ❌ Do NOT Create

- Random files at root level (`architecture.md`, `notes.md`, `summary.md`)
- Docs outside the proper structure
- Research docs without timestamps or frontmatter

## 🔗 Additional Resources

### App-Specific Documentation

- **Web App (SvelteKit):** `/apps/web/CLAUDE.md` - Complete web development guide
- **Worker Service (Node.js):** `/apps/worker/CLAUDE.md` - Complete worker development guide

### Cross-Cutting Documentation

- **Documentation Guidelines:** `/docs/DOCUMENTATION_GUIDELINES.md` ⭐
- **Web-Worker Architecture:** `/docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md` ⭐
- **Queue System Flow:** `/docs/architecture/diagrams/QUEUE-SYSTEM-FLOW.md`
- **Deployment Topology:** `/docs/DEPLOYMENT_TOPOLOGY.md`
- **Monorepo Workflows:** `/docs/MONOREPO_GUIDE.md`
- **Task-Based Navigation:** `/docs/TASK_INDEX.md`
- **Documentation Hub:** `/docs/README.md`

### Integration Documentation

- **Twilio/SMS Integration:** `/docs/integrations/twilio/README.md`
- **Supabase Integration:** `/docs/integrations/supabase/`
- **Stripe Integration:** `/docs/integrations/stripe/`

### Technical Deep Dives

- **Web Technical Docs:** `/apps/web/docs/technical/`
- **Database Schema:** `/apps/web/docs/technical/database/`
- **API Reference:** `/apps/web/docs/technical/api/`
- **Deployment Runbooks:** `/apps/web/docs/technical/deployment/runbooks/`

---

**📘 This is a high-level navigation guide. For detailed implementation patterns, code conventions, and architectural decisions, see the app-specific CLAUDE.md files and documentation folders listed above.**
