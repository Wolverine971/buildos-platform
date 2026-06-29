// apps/web/src/lib/services/agent-run-notification-data.ts
//
// Pure builders that map an `agent_runs` row into the notification-store shapes.
// Shared by `agent-run-notification.bridge.ts` (Run Stack) and the Work Panel,
// so both render the same `AgentRunMinimizedView` / `AgentRunModalContent`.

import type {
	AgentRunStatus,
	AgentRunContextType,
	AgentRunScopeMode,
	AgentRunMetrics,
	RunResult,
	ChangeSet
} from '@buildos/shared-types';
import type { AgentRunNotification, UiNotificationStatus } from '$lib/types/notification.types';
import type { AgentRunRow } from './agentRunsRealtime.service';

export function parseAgentRunResult(value: AgentRunRow['result']): RunResult | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as unknown as RunResult;
}

export function parseAgentRunMetrics(value: AgentRunRow['metrics']): AgentRunMetrics | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as unknown as AgentRunMetrics;
}

function parseAgentRunChangeSet(value: AgentRunRow['change_set']): ChangeSet | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const changes = (value as { changes?: unknown }).changes;
	return Array.isArray(changes) ? (value as unknown as ChangeSet) : null;
}

function zeroMetrics(): AgentRunMetrics {
	return {
		tokens: 0,
		cost_usd: 0,
		tool_calls: 0,
		duration_ms: 0
	};
}

function withProposedChangesFallback(
	run: AgentRunRow,
	result: RunResult | null,
	metrics: AgentRunMetrics | null
): RunResult | null {
	const changeSet = parseAgentRunChangeSet(run.change_set);
	if (!changeSet) return result;
	if (result) {
		return result.proposed_changes ? result : { ...result, proposed_changes: changeSet };
	}
	if (run.status !== 'proposal_ready') return null;
	return {
		run_id: run.id,
		label: run.label,
		status: 'proposal_ready',
		summary: run.goal,
		answer: run.expected_output ?? run.goal,
		entities_touched: [],
		proposed_changes: changeSet,
		metrics: metrics ?? zeroMetrics()
	};
}

export function toUiAgentRunStatus(status: AgentRunStatus): UiNotificationStatus {
	switch (status) {
		case 'completed':
			return 'success';
		case 'partial':
			return 'warning';
		case 'failed':
			return 'error';
		case 'cancelled':
			return 'cancelled';
		default:
			return 'processing';
	}
}

export function agentRunStatusMessage(
	status: AgentRunStatus,
	error: string | null,
	result: RunResult | null
): string {
	switch (status) {
		case 'queued':
			return 'Queued…';
		case 'running':
			return 'Working…';
		case 'paused':
			return 'Paused';
		case 'needs_input':
			return 'Needs your input';
		case 'proposal_ready':
			return 'Changes proposed — review';
		case 'completed':
			return result?.summary?.trim() || 'Done';
		case 'partial':
			return result?.summary?.trim() || 'Finished partially';
		case 'failed':
			return error?.trim() || result?.error?.trim() || 'Run failed';
		case 'cancelled':
			return 'Cancelled';
		default:
			return 'Working…';
	}
}

export function buildAgentRunNotificationData(run: AgentRunRow): AgentRunNotification['data'] {
	const parsedResult = parseAgentRunResult(run.result);
	const parsedMetrics = parseAgentRunMetrics(run.metrics);
	const metrics = parsedMetrics ?? parsedResult?.metrics ?? null;
	const result = withProposedChangesFallback(run, parsedResult, metrics);
	return {
		runId: run.id,
		label: run.label,
		goal: run.goal,
		runStatus: run.status,
		trigger: run.trigger,
		contextType: run.context_type as AgentRunContextType,
		projectId: run.project_id,
		parentSessionId: run.parent_session_id,
		scopeMode: run.scope_mode as AgentRunScopeMode,
		reviewRequired: run.review_required,
		runCreatedAt: run.created_at,
		startedAt: run.started_at,
		completedAt: run.completed_at,
		result,
		metrics,
		entityCount: result?.entities_touched?.length ?? 0,
		error: run.error
	};
}

export function buildAgentRunProgress(run: AgentRunRow): AgentRunNotification['progress'] {
	const result = parseAgentRunResult(run.result);
	return { type: 'indeterminate', message: agentRunStatusMessage(run.status, run.error, result) };
}

/**
 * Build a full (transient) AgentRunNotification from a run row — used by the
 * Work Panel to render `AgentRunModalContent` for history runs that aren't in
 * the live notification store. Not added to the store.
 */
export function synthesizeAgentRunNotification(
	run: AgentRunRow,
	actions: AgentRunNotification['actions'] = {}
): AgentRunNotification {
	const now = Date.now();
	return {
		id: `workpanel:${run.id}`,
		type: 'agent-run',
		status: toUiAgentRunStatus(run.status),
		createdAt: now,
		updatedAt: now,
		isMinimized: false,
		isPersistent: false,
		autoCloseMs: null,
		data: buildAgentRunNotificationData(run),
		progress: buildAgentRunProgress(run),
		actions
	};
}
