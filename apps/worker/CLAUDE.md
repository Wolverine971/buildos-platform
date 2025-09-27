# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a background worker service for generating automated daily briefs. It processes asynchronous jobs using a Supabase-based queue system and integrates with a SvelteKit + Supabase application.

## Essential Commands

### Development

```bash
# Install dependencies (uses PNPM)
pnpm install

# Run in development mode with hot reload
pnpm dev

# Run specific components in watch mode
pnpm worker      # Worker only
pnpm scheduler   # Scheduler only
```

### Testing

```bash
# Run tests in watch mode
pnpm test

# Run tests once
pnpm test:run

# Generate coverage report
pnpm test:coverage

# Run scheduler-specific tests
pnpm test:scheduler
```

### Build & Production

```bash
# Build TypeScript to dist/
pnpm build

# Run production build
pnpm start

# Lint code
pnpm lint

# Clean build artifacts
pnpm clean
```

## Architecture Overview

### Core Components

1. **API Server** (`src/index.ts`): Express server providing REST endpoints for brief generation and job status
2. **Worker** (`src/worker.ts`): Supabase queue worker that processes brief generation jobs with progress tracking
3. **Scheduler** (`src/scheduler.ts`): Cron-based scheduler for automated daily/weekly brief generation
4. **Queue** (`src/lib/supabaseQueue.ts`): Supabase-based queue management with atomic job claiming

### Data Flow

```
User Request → API Server → Supabase Queue → Worker → Supabase → Real-time Notification
                                  ↑
                            Scheduler (Cron)
```

### Key Design Patterns

- **Queue-based Processing**: All brief generation is async via Supabase queue
- **Timezone-aware Scheduling**: Uses date-fns-tz to handle user timezones correctly
- **Real-time Updates**: Leverages Supabase Realtime for instant notifications
- **Multi-project Consolidation**: Single brief can aggregate multiple user projects
- **Failure Recovery**: Exponential backoff with configurable retry attempts

## Database Schema

The service expects these Supabase tables:

- `profiles`: User data with timezone information
- `projects`: User projects with tasks and notes
- `queue_jobs`: Job tracking and status
- `queue_job_projects`: Many-to-many relationship for multi-project briefs

## Environment Configuration

### Required Variables:

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PORT=3001  # Optional, defaults to 3001
```

### Optional Queue Configuration:

```bash
# Core Queue Settings
QUEUE_POLL_INTERVAL=5000          # Job polling interval (ms)
QUEUE_BATCH_SIZE=5                # Max concurrent jobs
QUEUE_STALLED_TIMEOUT=300000      # Job stall timeout (ms)

# Retry & Progress
QUEUE_MAX_RETRIES=3               # Max retry attempts
QUEUE_ENABLE_PROGRESS_TRACKING=true # Enable progress updates

# Health & Monitoring
QUEUE_ENABLE_HEALTH_CHECKS=true   # Enable health monitoring
QUEUE_STATS_UPDATE_INTERVAL=60000 # Stats logging interval (ms)

# Performance
QUEUE_WORKER_TIMEOUT=600000       # Max job execution time (ms)
QUEUE_ENABLE_CONCURRENT_PROCESSING=true # Concurrent processing
```

The system automatically uses environment-specific defaults:

- **Development**: Faster polling, smaller batches, more frequent stats
- **Production**: Optimized for throughput, less frequent monitoring
- **Custom**: Override any setting via environment variables

See `.env.example` for complete configuration options.

## Testing Strategy

- Unit tests focus on scheduler logic and timezone handling
- Use Vitest with TypeScript support
- Test files follow `*.test.ts` pattern
- Manual testing utilities available in `tests/manual-test.ts`

## Deployment Notes

- Deployed on Railway with Nixpacks builder
- Health checks configured at `/health`
- Automatic restarts on failure
- Supabase-based queue (no Redis needed)
- Requires Node.js 18+ runtime
- Database migrations required before deployment

## Common Development Tasks

### Adding New Job Types

1. Define job data interface in `src/workers/shared/queueUtils.ts`
2. Add processor logic in `src/worker.ts`
3. Create API endpoint in `src/index.ts`
4. Register processor with queue.process()

### Modifying Schedule Logic

1. Edit cron patterns in `src/scheduler.ts`
2. Update timezone calculations if needed
3. Add tests in `tests/scheduler.test.ts`

### Debugging Queue Issues

- Monitor job status in `queue_jobs` table
- Check `/queue/stats` endpoint for metrics
- Review worker logs for processing errors
- Use SQL queries to inspect queue state
