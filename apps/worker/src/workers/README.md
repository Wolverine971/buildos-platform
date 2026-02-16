<!-- apps/worker/src/workers/README.md -->

# Workers Directory

This directory contains worker processors for queue job types handled by `apps/worker/src/worker.ts`.

## Current Worker Domains

- `brief/` - Daily brief generation + email delivery jobs
- `notification/` - Notification sends and project activity batch flush
- `ontology/` - Ontology jobs, including `build_project_context_snapshot`
- `project-icon/` - Project icon generation (`generate_project_icon`)
- `onboarding/` - Onboarding analysis jobs
- `chat/` - Chat session classification jobs
- `braindump/` - Ontology braindump processing jobs
- `voice-notes/` - Voice note transcription jobs
- `homework/`, `tree-agent/` - Agent runtime jobs
- `shared/` - Adapters and shared worker helpers

## Adding a New Worker

1. Create a folder under `workers/` and implement a processor.
2. Register the processor in `apps/worker/src/worker.ts` via `queue.process(jobType, handler)`.
3. Add typed metadata/result contracts in `packages/shared-types/src/queue-types.ts`.
4. Update metadata validation in `packages/shared-types/src/validation.ts`.
5. Add or update queueing service code in web/server routes.
6. Add tests for route enqueue behavior and worker processing behavior.

## Queue Storage

Jobs are persisted in the queue tables behind the `add_queue_job` RPC and processed by `SupabaseQueue`.
Primary routing field is `job_type`, with structured `metadata` validated in shared-types.
