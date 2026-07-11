// apps/web/src/lib/services/loop-telemetry.ts
// Thinking-loop telemetry envelope. Event names and shape come from the loop
// synthesis (docs/product/thinking-loop-capture-structure-surface-decide-update-2026-07-07.md,
// "Metrics And Instrumentation Gaps"). Payloads carry IDs, counts, and stage
// transitions only — never user content (no titles, drafts, or capture text).
// Delegates to the PostHog wrapper, so every call is a safe no-op without a
// key or consent.
import { captureEvent } from './posthog';

/** Surfaces that emit loop events. Extend as more surfaces are instrumented. */
export type LoopSurface = 'today' | 'onboarding';

export type LoopEventName =
	| 'loop_surface_shown'
	| 'loop_surface_opened'
	| 'loop_receipt_viewed'
	| 'loop_capture_submitted'
	| 'loop_decision_made'
	| 'loop_chat_opened'
	// Activation first-run funnel (tasker/26 WP-4). Fired from onboarding only;
	// same envelope rules: IDs/counts/flags, never capture text.
	| 'first_capture_started'
	| 'first_capture_submitted'
	| 'first_capture_skipped'
	| 'first_structure_generated'
	| 'first_project_created'
	| 'first_project_reviewed'
	| 'first_project_opened';

/** Flat values only — nested objects invite content leaking into analytics. */
export type LoopEventProperties = Record<string, string | number | boolean | null>;

export function trackLoopEvent(
	event: LoopEventName,
	surface: LoopSurface,
	properties: LoopEventProperties = {}
): void {
	captureEvent(event, { surface, actor_kind: 'user', ...properties });
}
