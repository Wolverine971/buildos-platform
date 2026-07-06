<!-- docs/DEPLOYMENT_TOPOLOGY.md -->

# BuildOS Deployment Topology

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      BuildOS Platform                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐                 ┌──────────────┐          │
│  │   Web App    │◄───────────────►│   Worker     │          │
│  │  (Vercel)    │    Webhooks     │  (Railway)   │          │
│  │  SvelteKit   │                 │   Express    │          │
│  └──────┬───────┘                 └──────┬───────┘          │
│         │                                │                  │
│         │      ┌──────────────┐          │                  │
│         └─────►│   Supabase   │◄─────────┘                  │
│                │   Database   │                             │
│                │   + Auth     │                             │
│                └──────────────┘                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘

External Services:
- Google OAuth (Authentication)
- Google Calendar API (Calendar sync)
- OpenRouter / OpenAI / Anthropic APIs (AI processing)
- Stripe (Payments - optional)
- Twilio (SMS - optional)
```

## Deployment Targets

### Web App → Vercel

**Location:** `/apps/web/`  
**Documentation:** `/apps/web/docs/`  
**Deployment Guide:** `/apps/web/docs/operations/deployment/`

**Purpose:**

- User-facing interface (brain dumps, projects, calendar, dashboard)
- SvelteKit API routes (SSE streaming, CRUD operations)
- Real-time updates via Supabase subscriptions
- Google Calendar integration (frontend + API)
- Stripe payments (optional, via `ENABLE_STRIPE` flag)

**Environment:** Serverless (Vercel Functions)  
**URL:** buildos.app  
**Build Command:** `pnpm build --filter=@buildos/web`  
**Dependencies:**

- `@buildos/shared-types`
- `@buildos/shared-agent-ops`
- `@buildos/shared-utils`
- `@buildos/smart-llm`
- `@buildos/supabase-client`
- `@buildos/twilio-service`

**Key Features:**

- Brain dump processing with SSE streaming
- Project and task management
- Calendar sync and analysis
- User authentication and profiles
- Payment processing (optional)

### Worker → Railway

**Location:** `/apps/worker/`  
**Documentation:** `/apps/worker/docs/`  
**Deployment Guide:** `/apps/worker/docs/deployment/RAILWAY_DEPLOYMENT.md`

**Purpose:**

- Background job processing with the Supabase queue
- Daily brief generation and notification fanout
- Scheduled tasks via cron jobs
- Asynchronous operations offloaded from web
- Authenticated worker API routes for enqueueing jobs, classification, status, and operations

**Environment:** Long-running Node.js process  
**URL:** Railway private URL  
**Build Command:** `pnpm build --filter=@buildos/worker`
**Dependencies:**

- `@buildos/shared-types`
- `@buildos/shared-agent-ops`
- `@buildos/shared-utils`
- `@buildos/smart-llm`
- `@buildos/supabase-client`
- `@buildos/twilio-service`

**Key Features:**

- Daily brief email generation
- Queue job processing
- Scheduled tasks (cron)
- Notification email delivery through worker-to-web webhooks
- SMS notifications via Twilio (optional)

## Shared Packages

### @buildos/shared-types

**Location:** `/packages/shared-types/`  
**Purpose:** TypeScript type definitions shared across apps  
**Used By:** Web, Worker

Key types:

- Database types (auto-generated from Supabase)
- Queue job types
- API request/response types
- Domain models

### @buildos/shared-agent-ops

**Location:** `/packages/shared-agent-ops/`  
**Purpose:** Agent operation, ontology, gateway, inbox, and project loop helpers shared across runtimes  
**Used By:** Web, Worker

### @buildos/shared-utils

**Location:** `/packages/shared-utils/`  
**Purpose:** Shared utilities and services  
**Used By:** Web, Worker, shared packages

### @buildos/supabase-client

**Location:** `/packages/supabase-client/`  
**Purpose:** Configured Supabase client for database access  
**Used By:** Web, Worker

Features:

- Pre-configured client with types
- Connection pooling
- Row Level Security (RLS) enforcement

### @buildos/twilio-service

**Location:** `/packages/twilio-service/`
**Purpose:** SMS service wrapper
**Used By:** Worker (primarily), Web (verification)
**Documentation:** [Twilio/SMS Integration](integrations/twilio/README.md)

Features:

- SMS sending via Twilio API
- Phone number verification
- Twilio webhook handling
- Template rendering
- User preference validation (quiet hours, opt-out)

### @buildos/smart-llm

**Location:** `/packages/smart-llm/`
**Purpose:** LLM service abstraction with provider routing
**Used By:** Web, Worker

### @buildos/mcp-server

**Location:** `/packages/buildos-mcp-server/`  
**Purpose:** Local stdio MCP bridge to the remote BuildOS connector  
**Used By:** Local MCP clients

## Data Flow Examples

### Brain Dump Processing

```
User (Browser)
    ↓
Web App (SvelteKit)
    ↓ (SSE stream)
OpenAI API
    ↓ (parsed operations)
Web App (validation)
    ↓ (confirmed operations)
Supabase Database
```

### Daily Brief Generation

```
Scheduler (Cron) → Worker
    ↓
Worker queries Supabase
    ↓
Worker generates brief via the configured LLM adapter
    ↓
Worker stores the brief and emits `brief.completed`
    ↓
Notification worker fans out email, SMS, push, and in-app delivery
    ↓
Worker calls web email webhook when email delivery is needed
    ↓
Job status updated in Supabase
    ↓
Web App polls for updates
```

### Calendar Sync

```
User connects Google Calendar (Web App)
    ↓
Google OAuth flow
    ↓
Calendar data fetched (Web App)
    ↓
Events stored in Supabase
    ↓
Webhook notifications (Google → Web App)
    ↓
Calendar changes synced to database
```

## Communication Patterns

**For detailed diagrams and flows, see:** [Web-Worker Architecture](architecture/diagrams/WEB-WORKER-ARCHITECTURE.md)

### Web ↔ Worker

- **Queue Jobs:** Web enqueues asynchronous work either through worker API routes or shared
  Supabase queue helpers backed by `add_queue_job()` RPC
- **Worker API:** Railway exposes authenticated Express routes such as `/queue/brief`,
  `/queue/onboarding`, `/queue/chat/classify`, `/queue/braindump/process`, `/jobs/:jobId`,
  and `/queue/stats`
- **Worker Callbacks:** Worker-to-web callbacks use `PRIVATE_BUILDOS_WEBHOOK_SECRET` for
  notification email and calendar-sync webhooks
- **Status Updates:** Worker updates job status in Supabase; web reads status from API routes,
  queue records, and realtime subscriptions depending on the flow
- **Real-Time:** Supabase Realtime still handles live UI updates for supported flows

### Web ↔ Supabase

- **Authentication:** Supabase Auth with RLS
- **Real-time:** Supabase Realtime subscriptions for live updates
- **Storage:** Database for all persistent data

### Worker ↔ Supabase

- **Job Claiming:** Atomic job claiming via RPC functions
- **Queue Management:** Supabase-based queue (no Redis needed)
- **Data Access:** Same database as web app

## Environment Variables

### Shared (Both Apps)

```bash
PUBLIC_SUPABASE_URL=          # Supabase project URL
PUBLIC_SUPABASE_ANON_KEY=     # Supabase anonymous key
PRIVATE_SUPABASE_SERVICE_KEY= # Supabase service role key
```

### Web-Specific

```bash
PUBLIC_GOOGLE_CLIENT_ID=      # Google OAuth client ID
PRIVATE_GOOGLE_CLIENT_SECRET= # Google OAuth secret
PUBLIC_RAILWAY_WORKER_URL=    # Worker service URL
PRIVATE_RAILWAY_WORKER_TOKEN= # Shared bearer token for worker calls
PRIVATE_BUILDOS_WEBHOOK_SECRET= # Shared secret for worker-to-web callbacks
PRIVATE_ENABLE_STRIPE=false   # Enable Stripe payments
STRIPE_SECRET_KEY=            # Stripe API key (if enabled)
```

### Worker-Specific

```bash
PRIVATE_RAILWAY_WORKER_TOKEN= # Shared bearer token for worker calls
PRIVATE_BUILDOS_WEBHOOK_SECRET= # Shared secret for worker-to-web callbacks
PRIVATE_OPENROUTER_API_KEY=   # Worker LLM API key
PRIVATE_OPENAI_API_KEY=       # Optional OpenAI fallback / transcription API key
PUBLIC_APP_URL=               # Web app URL for generated links and callbacks
PRIVATE_TWILIO_ACCOUNT_SID=   # Twilio account SID (optional)
PRIVATE_TWILIO_AUTH_TOKEN=    # Twilio auth token (optional)
PRIVATE_TWILIO_MESSAGING_SERVICE_SID= # Twilio messaging service (optional)
```

See [Deployment Environment Checklist](operations/environment/DEPLOYMENT_ENV_CHECKLIST.md) for complete list.

## Scaling Considerations

### Web App (Vercel)

- **Auto-scaling:** Vercel automatically scales serverless functions
- **Edge Caching:** Static assets cached globally
- **Database:** Supabase handles connection pooling

### Worker (Railway)

- **Horizontal Scaling:** Can run multiple worker instances
- **Job Distribution:** Supabase queue ensures no duplicate processing
- **Resource Limits:** Railway provides fixed resources per instance

### Database (Supabase)

- **Connection Pooling:** PgBouncer for connection management
- **Read Replicas:** Available on higher tiers
- **Performance:** Indexed queries and RPC functions

## Monitoring & Observability

### Web App

- **Logs:** Vercel dashboard
- **Errors:** Error logging service (ErrorLoggerService)
- **Performance:** Vercel analytics

### Worker

- **Logs:** Railway dashboard
- **Queue Status:** Supabase `queue_jobs` table
- **Cron Jobs:** Scheduled task execution logs

### Database

- **Supabase Dashboard:** Query performance, active connections
- **Error Logs:** Database logs in Supabase
- **Realtime Monitoring:** Active subscriptions, connection count

## Disaster Recovery

### Web App

- **Deployment Rollback:** Vercel allows instant rollback to previous deployment
- **Database Backup:** Supabase automatic backups (daily)

### Worker

- **Deployment Rollback:** Railway deployment history
- **Job Recovery:** Failed jobs can be retried via Supabase

### Database

- **Point-in-time Recovery:** Supabase Pro tier feature
- **Manual Backups:** Export via Supabase CLI or pg_dump

## Related Documentation

### Architecture

- [Web-Worker Architecture](architecture/diagrams/WEB-WORKER-ARCHITECTURE.md) - Complete service communication patterns ⭐
- [Queue System Flow](architecture/diagrams/QUEUE-SYSTEM-FLOW.md) - Job processing diagrams
- [Monorepo Guide](MONOREPO_GUIDE.md) - Working with the monorepo

### App Documentation

- [Web App Docs](/apps/web/docs/) - Web application details
- [Worker Docs](/apps/worker/docs/) - Worker service details

### Integrations

- [Twilio/SMS Integration](integrations/twilio/README.md) - SMS notifications system
- [Supabase Integration](integrations/supabase/) - Database and auth
- [Stripe Integration](integrations/stripe/) - Payment processing

### Navigation

- [Task Index](TASK_INDEX.md) - Task-based navigation
