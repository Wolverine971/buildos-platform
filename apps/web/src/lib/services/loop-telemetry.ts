// apps/web/src/lib/services/loop-telemetry.ts
// Thinking-loop telemetry envelope. Event names and shape come from the loop
// synthesis (docs/product/thinking-loop-capture-structure-surface-decide-update-2026-07-07.md,
// "Metrics And Instrumentation Gaps"). Payloads carry IDs, counts, and stage
// transitions only — never user content (no titles, drafts, or capture text).
// Delegates to the PostHog wrapper, so every call is a safe no-op without a
// key or consent.
import { captureEvent } from './posthog';

/** Surfaces that emit loop events. Extend as more surfaces are instrumented. */
export type LoopSurface = 'today';

export type LoopEventName =
	| 'loop_surface_shown'
	| 'loop_surface_opened'
	| 'loop_receipt_viewed'
	| 'loop_capture_submitted'
	| 'loop_decision_made'
	| 'loop_chat_opened';

/** Flat values only — nested objects invite content leaking into analytics. */
export type LoopEventProperties = Record<string, string | number | boolean | null>;

export function trackLoopEvent(
	event: LoopEventName,
	surface: LoopSurface,
	properties: LoopEventProperties = {}
): void {
	captureEvent(event, { surface, actor_kind: 'user', ...properties });
}
