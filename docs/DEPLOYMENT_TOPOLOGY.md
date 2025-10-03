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
- OpenAI API (AI processing)
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
**Build Command:** `pnpm build --filter=web`  
**Dependencies:**
- `@buildos/shared-types`
- `@buildos/supabase-client`

**Key Features:**
- Brain dump processing with SSE streaming
- Project and task management
- Calendar sync and analysis
- User authentication and profiles
- Payment processing (optional)

### Worker → Railway

**Location:** `/apps/worker/`  
**Documentation:** `/apps/worker/docs/`  
**Deployment Guide:** `/apps/worker/docs/RAILWAY_DEPLOYMENT.md`

**Purpose:**
- Background job processing (BullMQ with Supabase queue)
- Daily brief generation and email delivery
- Scheduled tasks via cron jobs
- Asynchronous operations offloaded from web

**Environment:** Long-running Node.js process  
**URL:** Railway private URL  
**Build Command:** `pnpm build --filter=worker`  
**Dependencies:**
- `@buildos/shared-types`
- `@buildos/supabase-client`
- `@buildos/twilio-service`

**Key Features:**
- Daily brief email generation
- Queue job processing
- Scheduled tasks (cron)
- Email delivery via Nodemailer
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
**Used By:** Worker (primarily)

Features:
- SMS sending
- Phone number validation
- Twilio webhook handling

### @buildos/config

**Location:** `/packages/config/`  
**Purpose:** Shared configuration (environment variables, constants)  
**Used By:** Web, Worker

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
Worker generates brief via OpenAI
    ↓
Worker sends email via Nodemailer
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

### Web ↔ Worker

- **Queue Jobs:** Web creates jobs in `queue_jobs` table (Supabase)
- **Status Updates:** Worker updates job status, web polls for changes
- **Webhooks:** Worker can notify web via webhooks (future)

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
OPENAI_API_KEY=               # OpenAI API key
```

### Web-Specific

```bash
PUBLIC_GOOGLE_CLIENT_ID=      # Google OAuth client ID
GOOGLE_CLIENT_SECRET=         # Google OAuth secret
ENABLE_STRIPE=false           # Enable Stripe payments
STRIPE_SECRET_KEY=            # Stripe API key (if enabled)
```

### Worker-Specific

```bash
PUBLIC_RAILWAY_WORKER_URL=    # Worker service URL
EMAIL_HOST=                   # SMTP host
EMAIL_USER=                   # SMTP username
EMAIL_PASS=                   # SMTP password
TWILIO_ACCOUNT_SID=           # Twilio account SID (optional)
TWILIO_AUTH_TOKEN=            # Twilio auth token (optional)
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

- [Monorepo Guide](MONOREPO_GUIDE.md) - Working with the monorepo
- [Web App Docs](/apps/web/docs/) - Web application details
- [Worker Docs](/apps/worker/docs/) - Worker service details
- [Task Index](TASK_INDEX.md) - Task-based navigation
