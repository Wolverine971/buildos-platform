// apps/worker/src/workers/agentic-chat/concurrencyBounds.ts

/**
 * The original rollout contract allowed a second slot after the live smoke.
 * Keep that reviewed ceiling explicit so CHAT_CONCURRENCY cannot silently
 * inherit the general worker pool or grow without a new capacity review.
 *
 * This lives in its own leaf module on purpose: `capacity.ts` and
 * `providerCapacity.ts` are pure policy and must stay importable without
 * pulling `consumer.ts` -> `supabaseQueue.ts` -> `lib/supabase.ts`, which
 * throws at module load when Supabase env is absent.
 */
export const MAX_AGENTIC_CHAT_CONCURRENCY = 2;
