# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

⚠️ **IMPORTANT**: This is a BuildOS platform codebase. ALWAYS use `pnpm` (never `npm`). The project uses Svelte 5 with new runes syntax (`$state`, `$derived`, `$effect`) - not the old reactive syntax.

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

## Code Patterns and Conventions

### Route Structure

```
/                        # Dashboard (auth-aware)
/projects               # Project list
/projects/[id]          # Project detail with tasks
/projects/[id]/notes    # Project notes
/briefs                 # AI-generated daily briefs
/profile                # User settings
/auth/*                 # Authentication flows
/api/*                  # REST endpoints
/admin/*                # Admin dashboard (protected)
```

### Component Naming Conventions

- **Domain Components**: `[Domain][Action/Type].svelte`
  - `BrainDumpModal.svelte`, `ProjectHeader.svelte`, `TasksList.svelte`
- **UI Components**: Generic, reusable (`/lib/components/ui/`)
  - `Modal.svelte`, `Button.svelte`, `Toast.svelte`
- **Skeleton Components**: Loading states
  - `ProjectCardSkeleton.svelte`, `TaskListSkeleton.svelte`

### State Management

#### Store Architecture

- **Unified stores** for complex flows: `brain-dump-v2.store.ts`
- **Domain stores**: `project.store.ts`, `dashboard.store.ts`
- **UI stores**: `toast.store.ts`, `modal.store.ts`
- **Optimistic updates** in project/dashboard stores
- **Session persistence** for processing state

#### Svelte 5 Patterns

```javascript
// ✅ Use these patterns:
let count = $state(0);
let doubled = $derived(count * 2);
$effect(() => {
  /* side effects */
});

// ❌ Avoid old syntax:
// let count = 0;
// $: doubled = count * 2;
```

### API Service Pattern

All services extend `base/api-service.ts`:

```typescript
class MyService extends ApiService {
  private static instance: MyService;
  private cache: CacheManager;

  // Singleton pattern
  public static getInstance(): MyService {
    if (!this.instance) {
      this.instance = new MyService();
    }
    return this.instance;
  }
}
```

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

### AI/LLM Integration

**Model Routing Strategy:**

- Primary: DeepSeek (cost-effective, $0.14/1M tokens)
- Fallback: Qwen → Claude Haiku → GPT-4o
- Premium: Claude Sonnet/Opus for complex tasks

**Dual Processing Pattern:**

```typescript
// For brain dumps > 800 chars or complex projects
const [contextResult, tasksResult] = await Promise.allSettled([
  extractProjectContext(brainDump),
  extractTasks(brainDump),
]);
```

**Smart LLM Service (`/lib/services/llm/`):**

- Automatic model selection based on complexity
- Native JSON mode support for compatible models
- SSE streaming for real-time progress updates
- Cost tracking and optimization

### Database Patterns

**67 tables** with comprehensive Row Level Security (RLS):

- User isolation: `auth.uid() = user_id`
- Optimized RPC functions to eliminate N+1 queries
- Safe enum migrations for type safety
- Automatic `updated_at` triggers

**Key RPC Functions:**

```sql
-- Optimized project statistics
get_project_statistics(p_project_id, p_user_id)
-- Projects with task counts
get_projects_with_stats(p_user_id, p_status, p_search, p_limit, p_offset)
```

### Error Handling

**Centralized Error Logger:**

```typescript
ErrorLoggerService.getInstance().logError(error, {
  userId: user.id,
  projectId: project?.id,
  operation: "brain_dump_processing",
});
```

**Error Types:**

- `brain_dump_processing`, `api_error`, `database_error`
- `validation_error`, `llm_error`, `calendar_sync_error`

**User Feedback:**

- Toast notifications for all user-facing errors
- Context-aware messages with actionable guidance
- Error boundaries to prevent UI crashes

### Testing Strategy

**Test Categories:**

```bash
# Regular unit/integration tests
pnpm test            # All tests (excludes LLM)
pnpm test:watch      # Watch mode

# LLM tests (costs money, separate config)
pnpm test:llm        # Real OpenAI API calls
pnpm test:llm:verbose

# Worker-specific
cd apps/worker && pnpm test:scheduler

# Full validation before push
pnpm pre-push        # typecheck + test + lint + build
```

**Mock Patterns:**

- Supabase: Chain-able mock objects
- LLM: Structured response fixtures
- Test data: `/lib/utils/__tests__/fixtures/`

### Performance Optimizations

**Progressive Loading:**

- Lazy component loading with dynamic imports
- Skeleton states for perceived performance
- Background data fetching

**Caching Strategy:**

- Service-level: LRU cache with TTL
- HTTP: ETag support, conditional requests
- Database: RPC functions for bulk operations

**Bundle Optimization:**

```javascript
// vite.config.ts manual chunks
'ui-vendor': ['lucide-svelte', '@tiptap/*'],
'utils': ['date-fns', 'tailwind-merge'],
'ai-vendor': ['openai', '@anthropic-ai/*']
```

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

## Common Gotchas and Solutions

### Svelte 5 Migration Issues

```javascript
// ❌ Old reactive syntax (will break)
export let value;
$: doubled = value * 2;

// ✅ New runes syntax
let { value } = $props();
let doubled = $derived(value * 2);
```

### State Store Access

```javascript
// ❌ Direct store access (deprecated)
$brainDumpStore.someValue;

// ✅ Use derived with store
let storeState = $derived($brainDumpV2Store);
let value = $derived(storeState?.someValue);
```

### API Response Handling

```typescript
// Always check success flag
const response = await fetch("/api/endpoint");
const data = await response.json();

if (!data.success) {
  toastService.error(data.error || "Operation failed");
  return;
}
```

### Supabase RLS

```typescript
// Always include user_id in queries
const { data, error } = await supabase
  .from("projects")
  .select("*")
  .eq("user_id", user.id); // Required by RLS
```

### Form Validation

```typescript
// Use validation schemas from:
// /lib/utils/operations/validation-schemas.ts
const isValid = validateField("projects", "name", value);
```

## File Organization

```
apps/web/src/
├── routes/                # SvelteKit routes
│   ├── (app)/            # Authenticated routes
│   ├── auth/             # Auth flows
│   ├── api/              # REST endpoints
│   └── admin/            # Admin routes
├── lib/
│   ├── components/       # Svelte components
│   │   ├── ui/          # Generic UI
│   │   ├── brain-dump/  # Brain dump feature
│   │   ├── project/     # Project management
│   │   └── [domain]/    # Domain-specific
│   ├── services/         # Business logic
│   │   ├── base/        # Base classes
│   │   ├── llm/         # AI services
│   │   └── [domain].service.ts
│   ├── stores/           # Svelte stores
│   ├── utils/            # Utilities
│   │   ├── operations/  # DB operations
│   │   └── prompts/     # AI prompts
│   └── types/            # TypeScript types
```

## API Endpoint Patterns

### RESTful Conventions

```
GET    /api/projects          # List
POST   /api/projects          # Create
GET    /api/projects/[id]     # Read
PATCH  /api/projects/[id]     # Update
DELETE /api/projects/[id]     # Delete
```

### Streaming Endpoints

```
POST /api/braindumps/stream       # SSE for long content
POST /api/braindumps/stream-short # SSE for short content
GET  /api/daily-briefs/progress   # SSE for generation progress
```

### Background Jobs

```
POST /api/brief-jobs          # Queue job
GET  /api/brief-jobs/[id]     # Check status
POST /api/queue/cleanup       # Maintenance
```

## Quick Reference

### Key Services

- `BrainDumpProcessor` - Core AI processing
- `ProjectService` - Project CRUD operations
- `SmartLLMService` - Intelligent model routing
- `ErrorLoggerService` - Centralized error tracking
- `DashboardDataService` - Optimistic updates

### Key Stores

- `brain-dump-v2.store.ts` - Unified brain dump state
- `project.store.ts` - Project management with caching
- `dashboard.store.ts` - Dashboard data with optimistic updates
- `toast.store.ts` - User notifications

### Key Database Functions

- `get_project_statistics()` - Project metrics
- `get_projects_with_stats()` - Optimized project list
- `complete_queue_job()` - Job completion
- `reset_stalled_jobs()` - Job recovery

### Performance Commands

```bash
# Bundle analysis
pnpm build:analyze

# Development with profiling
cd apps/web && pnpm dev:profile

# Fast dev without type checking
pnpm dev:fast
```
