# Daily Brief Worker Service

A background worker service for generating automated daily briefs using a Supabase-based queue system. Built with TypeScript and designed to integrate with your existing SvelteKit + Supabase application.

## Features

- 🔄 **Automated Brief Generation**: Schedule daily, weekly, or custom frequency briefs
- 📋 **Queue Management**: Reliable job processing with retry logic and error handling (Supabase-based)
- 🔔 **Real-time Notifications**: Notify users when briefs are ready via Supabase Realtime
- 🚀 **Manual Triggers**: Allow users to manually generate briefs immediately
- 📊 **Job Monitoring**: Track job status and history
- ⚡ **Scalable**: Process multiple briefs concurrently
- 💰 **Cost-effective**: No Redis/external queue service needed

## Architecture

```
SvelteKit App (Vercel) → API Calls → Railway Worker Service
                                            ↓
                                    Supabase Queue System
                                    (Database + Functions)
                                            ↓
                                    Background Processing
                                            ↓
                                    Real-time Notifications
```

## Setup Instructions

### 1. Prerequisites

- Node.js 18+ installed
- PNPM installed (`npm install -g pnpm`)
- Railway account
- Access to your Supabase project

### 2. Project Setup

Clone or create the project structure:

```bash
mkdir daily-brief-worker
cd daily-brief-worker

# Copy all the artifact files into your project
# Then install dependencies:
pnpm install
```

### 3. Database Migrations

Run these SQL migrations in your Supabase SQL editor:

```sql
-- 1. First run: migrations/002_supabase_queue_system.sql
-- 2. Then run: migrations/003_fix_claim_jobs_return_type.sql
```

These migrations add:

- Queue job management columns and indexes
- Atomic job claiming functions
- Stalled job recovery
- Job lifecycle management functions

### 4. Environment Configuration

Create a `.env` file:

```bash
cp .env.example .env
```

Fill in your environment variables:

```env
# Supabase (REQUIRED)
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PRIVATE_SUPABASE_SERVICE_KEY=your-service-role-key

# Port (optional, Railway will override)
PORT=3001
```

### 5. Local Development

```bash
# Build the project
pnpm build

# Run in development mode
pnpm dev

# Test the health endpoint
curl http://localhost:3001/health

# The response should include queue: 'supabase'
```

### 6. Deploy to Railway

#### Option A: Connect GitHub Repository

1. Push your code to GitHub
2. Go to [Railway](https://railway.app)
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Add environment variables in Railway dashboard:
   - `SUPABASE_URL`
   - `PRIVATE_SUPABASE_SERVICE_KEY`

#### Option B: Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and initialize
railway login
railway init

# Add environment variables
railway variables:set PUBLIC_SUPABASE_URL=your-url
railway variables:set PRIVATE_SUPABASE_SERVICE_KEY=your-key

# Deploy
railway up
```

### 7. Integration with SvelteKit App

Add these API routes to your SvelteKit app:

#### Manual Brief Generation

```typescript
// src/routes/api/briefs/generate/+server.ts
export async function POST({ request, locals }) {
  const { immediate = false, forceRegenerate = false } = await request.json();
  const userId = locals.user.id;

  const response = await fetch(`${WORKER_SERVICE_URL}/queue/brief`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      forceImmediate: immediate,
      forceRegenerate,
    }),
  });

  return response;
}
```

#### User Preferences Management

```typescript
// src/routes/api/briefs/preferences/+server.ts
export async function POST({ request, locals }) {
  const { frequency, dayOfWeek, timeOfDay, timezone } = await request.json();
  const userId = locals.user.id;

  await supabase.from("user_brief_preferences").upsert({
    user_id: userId,
    frequency,
    day_of_week: dayOfWeek,
    time_of_day: timeOfDay,
    timezone,
    is_active: true,
  });

  return json({ success: true });
}
```

### 8. Frontend Real-time Notifications

Add to your SvelteKit layout:

```typescript
// src/app.html or +layout.svelte
import { supabase } from "$lib/supabase";
import { onMount } from "svelte";

onMount(() => {
  if ($user) {
    const channel = supabase.channel(`user:${$user.id}`);

    channel
      .on("broadcast", { event: "brief_completed" }, (payload) => {
        // Show success notification
        showNotification("Your daily brief is ready!", {
          action: () => goto(`/projects?briefDate=${payload.briefDate}`),
        });
      })
      .on("broadcast", { event: "brief_failed" }, (payload) => {
        // Show error notification
        showNotification("Brief generation failed. Click to retry.", {
          type: "error",
          action: () => retryBrief(payload.jobId),
        });
      })
      .subscribe();

    return () => channel.unsubscribe();
  }
});
```

### 9. Testing the System

#### Test Manual Brief Generation

```bash
# Test manual brief generation
curl -X POST http://your-railway-url/queue/brief \
  -H "Content-Type: application/json" \
  -d '{"userId": "your-user-id", "forceImmediate": true}'

# Check job status
curl http://your-railway-url/jobs/job-id

# View queue statistics
curl http://your-railway-url/queue/stats
```

#### Test Scheduled Briefs

```sql
-- Add user preference via Supabase
INSERT INTO user_brief_preferences (user_id, frequency, time_of_day, timezone)
VALUES ('your-user-id', 'daily', '09:00:00', 'America/New_York');
```

## API Endpoints

### Worker Service Endpoints

- `GET /health` - Health check with queue stats
- `POST /queue/brief` - Queue a brief generation job
- `POST /queue/phases` - Queue phases generation job
- `POST /queue/onboarding` - Queue onboarding analysis job
- `GET /jobs/:jobId` - Get job status
- `GET /users/:userId/jobs` - Get user's jobs
- `GET /queue/stats` - Get queue statistics

### Request/Response Examples

#### Queue Brief

```json
// Request
POST /queue/brief
{
  "userId": "user-123",
  "forceImmediate": true,
  "briefDate": "2024-01-15"
}

// Response
{
  "success": true,
  "jobId": "brief-user-123-2024-01-15",
  "scheduledFor": "2024-01-15T00:00:00Z",
  "briefDate": "2024-01-15"
}
```

## Configuration Options

### User Brief Preferences

```typescript
interface UserBriefPreference {
  frequency: "daily" | "weekly" | "custom";
  day_of_week?: number; // 0-6, for weekly briefs
  time_of_day: string; // HH:MM:SS format
  timezone: string; // IANA timezone
  is_active: boolean;
}
```

### Job Options

```typescript
interface BriefJobData {
  userId: string;
  briefDate?: string; // Date in YYYY-MM-DD format
  timezone?: string; // User's timezone
  options?: {
    includeProjects?: string[];
    excludeProjects?: string[];
    customTemplate?: string;
    forceRegenerate?: boolean;
  };
}
```

## Queue System Details

### How It Works

1. **Job Creation**: Jobs are added to `queue_jobs` table with status 'pending'
2. **Atomic Claiming**: Worker claims jobs using PostgreSQL's `FOR UPDATE SKIP LOCKED`
3. **Processing**: Jobs are processed with progress tracking
4. **Completion**: Jobs marked as completed/failed with results
5. **Retry Logic**: Failed jobs retry with exponential backoff
6. **Stalled Recovery**: Stuck jobs automatically recovered after 5 minutes

### Monitoring

```sql
-- View queue depth
SELECT job_type, status, COUNT(*)
FROM queue_jobs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY job_type, status;

-- View average processing time
SELECT job_type,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_seconds
FROM queue_jobs
WHERE status = 'completed'
GROUP BY job_type;

-- Find failed jobs
SELECT * FROM queue_jobs
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;
```

## Troubleshooting

### Common Issues

1. **"structure of query does not match function result type"**
   - Run migration `003_fix_claim_jobs_return_type.sql`

2. **Jobs stuck in 'pending'**
   - Check worker is running: `curl /health`
   - Check for errors in logs

3. **Jobs not being claimed**
   - Verify database migrations applied
   - Check Supabase service role key is correct

4. **Notification Issues**
   - Verify Supabase Realtime is enabled
   - Check channel subscription in frontend

### Performance Tuning

- Adjust `pollInterval` in worker.ts (default: 5 seconds)
- Modify `batchSize` for concurrent processing (default: 5)
- Adjust `stalledTimeout` for job recovery (default: 5 minutes)

## Cost Analysis

### Before (with Redis)

- Railway: ~$5-10/month
- Upstash Redis: $10-50/month
- **Total**: $15-60/month

### After (Supabase-only)

- Railway: ~$5-10/month
- Supabase: Already included
- **Total**: $5-10/month
- **Savings**: $10-50/month

## Security Notes

- Service role key is only used in the worker service
- RLS policies protect user data
- Queue jobs are user-scoped
- HTTPS enforced in production
- No external dependencies (Redis removed)

## Migration from Redis

If migrating from the old Redis-based system:

1. Run database migrations
2. Update environment variables (remove Redis URLs)
3. Deploy new code
4. Old jobs will complete, new jobs use Supabase

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes and test locally
4. Deploy to a staging Railway service
5. Submit a pull request

## License

MIT License - see LICENSE file for details
