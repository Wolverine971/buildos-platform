// apps/worker/src/workers/agentic-chat/shared/concurrency-bounds.ts

/**
 * Reviewed ceiling for CHAT_CONCURRENCY (turns per worker process). It is a
 * ceiling, not the setting: Railway's CHAT_CONCURRENCY picks the value, and a
 * value above this refuses to boot, so it cannot silently inherit the general
 * worker pool or grow without a new capacity review.
 *
 * Raised 2 -> 8 on 2026-10-17 (audit S15). Turns spend ~87% of wall time waiting
 * on the model. The free load test (scripts/agentic-chat-concurrency-load.ts:
 * real queue -> executor -> provider adapter -> OpenRouter client -> publisher,
 * fake model and database) was flat from 2 to 32 turns in one process: turn time
 * unchanged, event-loop lag p99 ~3 ms, ~0.25% of a core and ~2 MB RSS per turn,
 * 0 failures. In production a replica idles near 200 MB of an 8 GB limit,
 * OpenRouter reports no request rate limit and logged 0 provider 429s since
 * 09-25. The limits that remain sit outside the process and scale with the
 * service-wide total (4 replicas x this): Supabase Realtime (Pro, ~2.3 broadcasts/s
 * per turn, ~10 preview frames/s while an answer streams), PostgREST on Micro
 * compute (~3.5 calls/s per turn, 60 max connections), and the upstream model
 * provider. 8 per process (32 service-wide) keeps each well inside its budget.
 *
 * This lives in its own leaf module on purpose: `capacity.ts` and
 * `providerCapacity.ts` are pure policy and must stay importable without
 * pulling `consumer.ts` -> `supabaseQueue.ts` -> `lib/supabase.ts`, which
 * throws at module load when Supabase env is absent.
 */
export const MAX_AGENTIC_CHAT_CONCURRENCY = 8;
