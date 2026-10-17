// apps/web/src/lib/components/agent/duplicate-check-strip.ts
// Polling limits for DuplicateCheckStrip.svelte (a check takes under a minute).

export const DUPLICATE_CHECK_POLL_MS = 3000;
/** 40 polls × 3 s = 2 minutes; then the strip links to the run page instead. */
export const DUPLICATE_CHECK_MAX_POLLS = 40;
/** Top groups a card shows; the run page has the rest. */
export const DUPLICATE_CHECK_GROUP_LIMIT = 3;
