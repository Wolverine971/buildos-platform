<!-- apps/worker/docs/features/daily-briefs/README.md -->

# Daily Briefs Feature

Scheduled generation and delivery of daily email briefs summarizing user's projects and tasks.

## Documentation in This Folder

- `daily-brief-exponential-backoff-spec.md` - Retry logic and exponential backoff specification

## Overview

Daily briefs:

1. Run on a cron schedule (hourly)
2. Process users based on their timezone preferences
3. Generate AI-powered summaries
4. Deliver via email with retry logic

## Key Files

**Services:**

- `/apps/worker/src/services/dailyBrief/` - Daily brief generation and email delivery

**Jobs:**

- `/apps/worker/src/jobs/daily-brief.ts` - Job handler

**Scheduler:**

- `/apps/worker/src/scheduler/daily-brief-scheduler.ts` - Cron configuration

## Retry Logic

Uses exponential backoff for failed deliveries:

- Initial retry: 1 minute
- Subsequent retries: Exponential increase
- Max retries: 5 attempts
- Documented in: `daily-brief-exponential-backoff-spec.md`

## Related Documentation

- Worker overview: `/apps/worker/docs/README.md`
- Queue system: `/apps/worker/docs/features/queue-system/README.md`
