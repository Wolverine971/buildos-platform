// apps/web/src/lib/services/agentic-chat-v2/turn-admission.ts
import type { Json } from '@buildos/shared-types';

export const DEFAULT_PROGRESS_STALE_RECLAIM_MS = 120_000;
export const DEFAULT_RECENT_PROGRESS_GRACE_MS = 60_000;

export type ChatHistoryMessageRow = {
	id: string;
	role: string;
	content: string;
	metadata: Json | null;
	created_at: string | null;
};

export type ChatHistoryAttachmentRow = {
	message_id: string;
	asset_id: string | null;
	project_id: string | null;
	attachment_kind: string;
	media_type: string;
	role: string | null;
	display_order: number | null;
	metadata: Record<string, unknown> | null;
	asset: Record<string, unknown> | null;
};

export type ChatHistoryToolExecutionRow = {
	message_id: string | null;
	provider_tool_call_id?: string | null;
	tool_name: string;
	gateway_op: string | null;
	sequence_index: number | null;
	success: boolean;
	error_message: string | null;
	arguments: Json;
	result: Json | null;
};

/**
 * Bounded model-facing history captured before the current message. Worker
 * admission returns it inline; the query path in `session-service` rebuilds the
 * same shape row for row so both lineages project identically.
 */
export type ChatHistorySnapshot = {
	messages: ChatHistoryMessageRow[];
	attachments: ChatHistoryAttachmentRow[];
	interrupted_tool_executions: ChatHistoryToolExecutionRow[];
	loaded_skill_executions: ChatHistoryToolExecutionRow[];
};

/**
 * Pure reclaim rule for a running turn (exported for tests):
 * - progress silent >= progressStaleReclaimMs -> reclaim (dead turn);
 * - past max duration AND progress not fresh -> reclaim (bounded lock);
 * - otherwise the turn keeps its lock. `last_progress_at` may be null for
 *   turns started before the heartbeat existed; started_at stands in.
 */
export function shouldReclaimRunningTurn(params: {
	nowMs: number;
	startedAtMs: number;
	lastProgressAtMs: number | null;
	detachedTurnMaxDurationMs: number;
	progressStaleReclaimMs?: number;
	recentProgressGraceMs?: number;
}): boolean {
	const progressStaleReclaimMs =
		params.progressStaleReclaimMs ?? DEFAULT_PROGRESS_STALE_RECLAIM_MS;
	const recentProgressGraceMs = params.recentProgressGraceMs ?? DEFAULT_RECENT_PROGRESS_GRACE_MS;
	const ageMs = Math.max(0, params.nowMs - params.startedAtMs);
	const progressReferenceMs = params.lastProgressAtMs ?? params.startedAtMs;
	const progressAgeMs = Math.max(0, params.nowMs - progressReferenceMs);

	if (progressAgeMs >= progressStaleReclaimMs) return true;
	return ageMs >= params.detachedTurnMaxDurationMs && progressAgeMs >= recentProgressGraceMs;
}
