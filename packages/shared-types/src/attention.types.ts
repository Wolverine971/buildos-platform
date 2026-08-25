// packages/shared-types/src/attention.types.ts
/**
 * Shared admission scale for deciding where an outcome belongs.
 *
 * `none` and `minor` remain in contextual history. `decision` and `urgent`
 * may compete for AI Inbox and notification attention according to policy.
 */
export type AttentionLevel = 'none' | 'minor' | 'decision' | 'urgent';
