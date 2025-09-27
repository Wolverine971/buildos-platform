# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Architecture Overview

This is a **Turborepo monorepo** for the BuildOS platform, an AI-powered productivity system designed for ADHD minds that transforms unstructured thoughts into actionable plans.

### Repository Structure
```
buildos-platform/
├── apps/
│   ├── web/              # Main SvelteKit application
│   └── worker/           # Background worker service for daily briefs
├── packages/
│   ├── shared-types/     # Shared TypeScript types across apps
│   └── supabase-client/  # Shared Supabase configuration
```

### Tech Stack
- **Monorepo**: Turborepo + pnpm workspaces
- **Web App**: SvelteKit 2 + Svelte 5 (uses new runes syntax)
- **Worker**: Node.js + Express + BullMQ (Supabase-based queue)
- **Database**: Supabase (PostgreSQL with Row Level Security)
- **AI**: OpenAI API with streaming support
- **Auth**: Supabase Auth with Google OAuth
- **Deployment**: Vercel (web) + Railway (worker)
- **Payments**: Stripe (optional, controlled by ENABLE_STRIPE flag)

## High-Level Architecture

### Core System: Brain Dump Flow

The brain dump is BuildOS's core innovation - users write stream-of-consciousness thoughts, and AI automatically extracts projects, tasks, and context.

**Processing Pipeline:**
1. **User Input** → Brain dump modal receives unstructured text
2. **Dual Processing** → AI processes in two stages for accuracy:
   - Context extraction (understanding overall intent)
   - Task extraction (identifying actionable items)
3. **Clarification** → Optional AI-generated questions to fill gaps
4. **Creation** → Projects and tasks are created/updated
5. **Organization** → Tasks grouped into phases and optionally scheduled

**Key Services:**
- `apps/web/src/lib/utils/braindump-processor.ts` - Main processing logic
- `apps/web/src/lib/services/promptTemplate.service.ts` - AI prompt management
- `apps/web/src/lib/services/phase-generation/` - Phase creation strategies

### Worker Service Architecture

The worker handles asynchronous background tasks using a Supabase-based queue system:

**Components:**
- **API Server**: REST endpoints for job creation and status
- **Queue Worker**: Processes jobs with progress tracking
- **Scheduler**: Cron-based automation for daily/weekly briefs
- **Supabase Queue**: Atomic job claiming without Redis

**Data Flow:**
```
User Request → API → Supabase Queue → Worker → Real-time Updates
                           ↑
                     Scheduler (Cron)
```

### Database Design

Core tables managed through Supabase:
- `profiles` - User data with timezone and preferences
- `projects` - User projects with rich context
- `tasks` - Actionable items with priorities
- `brain_dumps` - Raw input and processing history
- `daily_briefs` - Generated AI summaries
- `queue_jobs` - Background job tracking

## Key Development Patterns

### Svelte 5 Runes
The web app uses Svelte 5's new runes syntax:
```javascript
// Use these patterns:
$state()      // Instead of let for reactive state
$derived()    // For computed values
$effect()     // Instead of reactive statements
```

### API Service Pattern
Services extend `base/api-service.ts` for consistency:
- Automatic error handling and retry logic
- Type-safe responses
- Consistent interface across services

### Real-time Updates
Supabase real-time subscriptions enable live updates:
- Project changes sync across devices
- Brief generation progress tracking
- Collaborative features

### Turborepo Pipeline
Tasks are orchestrated through Turborepo:
- Parallel execution where possible
- Dependency-aware build order
- Shared caching across runs

## Environment Variables

Critical configuration (see `.env.example`):
```bash
# Supabase (required)
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
PRIVATE_SUPABASE_SERVICE_KEY=

# OpenAI (required for AI features)
OPENAI_API_KEY=

# Google OAuth (required for auth)
PUBLIC_GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Optional features
ENABLE_STRIPE=false     # Set to true for payments
PUBLIC_RAILWAY_WORKER_URL=  # Worker service URL
```

## Important Notes

### Package Management
**Always use pnpm, never npm**. This is enforced by package manager settings and is critical for workspace integrity.

### Testing Strategy
- **Unit tests**: Fast, mocked external services
- **LLM tests**: Test actual AI prompts (costs money)
- Run `pnpm test:llm` only when modifying prompts

### Before Committing
1. Run `pnpm lint:fix` to fix formatting
2. Ensure types pass with `pnpm typecheck`
3. Run tests with `pnpm test:run`

### Before Pushing
Run `pnpm pre-push` to validate everything (typecheck, tests, lint, and production build).

### Working with Turbo
- Use `--filter` flag to run commands for specific apps/packages
- Turbo caches results - use `--force` to bypass cache if needed
- Check `turbo.json` for task pipeline configuration