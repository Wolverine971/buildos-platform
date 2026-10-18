// apps/web/src/lib/components/agent/duplicate-check-strip.ts
// Polling limits for DuplicateCheckStrip.svelte. A check over two busy projects
// takes 2–4 minutes (measured 2026-10-17), so the strip keeps polling until it
// finishes: every 3 s for the first minute, then every 10 s, for up to 15 minutes.
export const DUPLICATE_CHECK_POLL_MS = 3000;
export const DUPLICATE_CHECK_SLOW_POLL_MS = 10_000;
/** Polls at the fast rate (20 × 3 s = 1 minute) before slowing down. */
export const DUPLICATE_CHECK_FAST_POLLS = 20;
/** 20 fast polls + 84 slow ones ≈ 15 minutes; after that the strip says it's still going. */
export const DUPLICATE_CHECK_MAX_POLLS = 104;
/** Top groups a card shows; the review panel has the rest. */
export const DUPLICATE_CHECK_GROUP_LIMIT = 3;

/** Delay before the next poll, given how many polls have run. */
export function duplicateCheckPollDelay(polls: number): number {
	return polls < DUPLICATE_CHECK_FAST_POLLS
		? DUPLICATE_CHECK_POLL_MS
		: DUPLICATE_CHECK_SLOW_POLL_MS;
}
