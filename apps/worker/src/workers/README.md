<!-- apps/worker/src/workers/README.md -->

# Workers Directory Structure

This directory contains the modular worker implementations for different job types.

## Structure

```
workers/
├── shared/          # Shared utilities and queue configuration
│   └── queue.ts     # Queue definitions and shared functions
├── brief/           # Brief generation worker
│   ├── briefWorker.ts    # Worker job processor
│   └── ontologyBriefGenerator.ts # Ontology daily brief generation logic
```

## Adding a New Worker

To add a new worker type:

1. Create a new directory under `workers/` for your worker type
2. Add your worker processor file (e.g., `myWorker.ts`) with a `processMyJob` function
3. Add your job data interface to `shared/queue.ts`
4. Create a new queue instance in `shared/queue.ts`
5. Add queue functions for your job type in `shared/queue.ts`
6. Update `src/worker.ts` to start your new worker
7. Add API endpoints in `src/index.ts` for queuing your jobs

## Job Types

### Brief Generation (`daily_brief`)

- Generates daily briefs for users
- Scheduled automatically via cron
- Can be triggered manually via API

## Database Schema

Jobs are tracked in the `brief_generation_jobs` table with the following key fields:

- `job_type`: Identifies the type of job ('generate_daily_brief', 'generate_brief_email', etc.)
- `queue_job_id`: References the BullMQ job ID
- `status`: Current job status ('pending', 'processing', 'completed', 'failed')
- `metadata`: JSON field for job-specific data
