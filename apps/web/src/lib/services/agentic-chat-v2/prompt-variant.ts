// apps/web/src/lib/services/agentic-chat-v2/prompt-variant.ts
//
// After the lite prompt consolidation (docs/specs/agentic-chat-lite-prompt-consolidation-2026-04-16.md),
// Lite is the only live prompt path. This file now exports the prompt-variant
// string labels used by observability, eval tooling, and historical snapshots.
// The legacy routing / admin-gating helpers were removed with the fastchat builder.
import { LITE_PROMPT_VARIANT as LITE_VARIANT } from '$lib/services/agentic-chat-lite/prompt/types';
import type { LitePromptVariant as LitePromptVariantType } from '$lib/services/agentic-chat-lite/prompt/types';

export const LITE_PROMPT_VARIANT = LITE_VARIANT;
export type LitePromptVariant = LitePromptVariantType;

/**
 * Legacy prompt variant label. The fastchat builder is gone; the constant
 * remains so historical prompt snapshots, eval reports, and dashboards can
 * still reference the string `'fastchat_prompt_v1'`. New sessions always
 * record `LITE_PROMPT_VARIANT`.
 */
export const FASTCHAT_PROMPT_VARIANT = 'fastchat_prompt_v1' as const;
