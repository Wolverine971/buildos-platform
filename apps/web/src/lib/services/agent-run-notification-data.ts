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
	ChangeSet,
	ProposedChange
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

const ENTITY_LABELS: Record<string, string> = {
	calendar_event: 'calendar event',
	document: 'document',
	goal: 'goal',
	milestone: 'milestone',
	output: 'output',
	plan: 'plan',
	project: 'project',
	risk: 'risk',
	task: 'task'
};

type AgentRunCardPreview = {
	projectName: string | null;
	activityLabel: string;
	targetLabel: string | null;
	preview: string;
	entityType: string | null;
};

function compactText(value: unknown, maxLength = 220): string | null {
	if (typeof value !== 'string') return null;
	const compact = value.replace(/\s+/g, ' ').trim();
	if (!compact) return null;
	return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeEntityType(value: unknown): string | null {
	const normalized = compactText(value, 80)
		?.toLowerCase()
		.replace(/^onto[._-]/, '')
		.replace(/[. -]+/g, '_');
	return normalized || null;
}

function entityLabel(entityType: string | null): string {
	if (!entityType) return 'item';
	return ENTITY_LABELS[entityType] ?? entityType.replace(/_/g, ' ');
}

function pluralizeEntity(entityType: string | null, count: number): string {
	const label = entityLabel(entityType);
	if (count === 1) return label;
	if (label.endsWith('y') && !/[aeiou]y$/.test(label)) return `${label.slice(0, -1)}ies`;
	if (label.endsWith('s')) return `${label}es`;
	return `${label}s`;
}

function capitalize(value: string): string {
	return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function changeTargetLabel(change: ProposedChange): string | null {
	const records = [change.after, change.before];
	const keys =
		change.entity_type === 'goal' || change.entity_type === 'project'
			? ['name', 'title']
			: ['title', 'name'];
	for (const record of records) {
		for (const key of keys) {
			const label = compactText(record?.[key], 100);
			if (label) return label;
		}
	}
	return null;
}

function operationParts(op: string): { action: string; entityType: string } | null {
	const parts = op.split('.').filter(Boolean);
	if (parts.length < 3 || parts[0] !== 'onto') return null;
	const action = parts.at(-1);
	const entityType = normalizeEntityType(parts[1]);
	if (!action || !entityType || !['create', 'update', 'delete'].includes(action)) return null;
	return { action, entityType };
}

function readProjectName(run: AgentRunRow): string | null {
	const relation = Array.isArray(run.project) ? run.project[0] : run.project;
	return compactText(relation?.name, 120);
}

/** Build the fixed-priority content shown on the incoming-message-style card. */
export function buildAgentRunCardPreview(
	run: AgentRunRow,
	result: RunResult | null = withProposedChangesFallback(
		run,
		parseAgentRunResult(run.result),
		parseAgentRunMetrics(run.metrics)
	)
): AgentRunCardPreview {
	const proposedChanges = result?.proposed_changes?.changes ?? [];
	const touches = result?.entities_touched ?? [];
	let activityLabel: string | null = null;
	let targetLabel: string | null = null;
	let entityType: string | null = null;

	if (proposedChanges.length > 0) {
		const firstChange = proposedChanges.at(0);
		if (!firstChange) throw new Error('Expected at least one proposed change');
		const entityTypes = new Set(
			proposedChanges.map((change) => normalizeEntityType(change.entity_type)).filter(Boolean)
		);
		const actions = new Set(proposedChanges.map((change) => change.action));
		entityType = entityTypes.size === 1 ? (Array.from(entityTypes)[0] ?? null) : 'multiple';

		if (proposedChanges.length === 1) {
			activityLabel = `${capitalize(firstChange.action)} ${entityLabel(entityType)}`;
			targetLabel = changeTargetLabel(firstChange);
		} else if (entityTypes.size === 1 && actions.size === 1) {
			activityLabel = `${capitalize(firstChange.action)} ${proposedChanges.length} ${pluralizeEntity(entityType, proposedChanges.length)}`;
		} else {
			activityLabel = `Review ${proposedChanges.length} proposed changes`;
			if (entityTypes.size > 0 && entityTypes.size <= 2) {
				targetLabel = Array.from(entityTypes)
					.map((type) => capitalize(pluralizeEntity(type, 2)))
					.join(' + ');
			}
		}
	} else if (touches.length > 0) {
		const firstTouch = touches.at(0);
		if (!firstTouch) throw new Error('Expected at least one entity touch');
		const entityTypes = new Set(
			touches.map((touch) => normalizeEntityType(touch.type)).filter(Boolean)
		);
		const actions = new Set(touches.map((touch) => touch.action.replace(/d$/, '')));
		entityType = entityTypes.size === 1 ? (Array.from(entityTypes)[0] ?? null) : 'multiple';
		if (touches.length === 1) {
			activityLabel = `${capitalize(firstTouch.action.replace(/d$/, ''))} ${entityLabel(entityType)}`;
			targetLabel = compactText(firstTouch.title, 100);
		} else if (entityTypes.size === 1 && actions.size === 1) {
			activityLabel = `${capitalize(Array.from(actions)[0] ?? 'change')} ${touches.length} ${pluralizeEntity(entityType, touches.length)}`;
		} else {
			activityLabel = `${touches.length} completed changes`;
		}
	} else {
		const operations = (run.allowed_ops ?? [])
			.map(operationParts)
			.filter((value): value is NonNullable<typeof value> => value !== null);
		const firstOperation = operations[0];
		if (
			firstOperation &&
			operations.every(
				(operation) =>
					operation.action === firstOperation.action &&
					operation.entityType === firstOperation.entityType
			)
		) {
			entityType = firstOperation.entityType;
			activityLabel = `${capitalize(firstOperation.action)} ${entityLabel(entityType)}`;
		}
	}

	const runCopy = `${run.label} ${run.goal}`.toLowerCase();
	if (!activityLabel && /\b(audit|project review|reconcile)\b/.test(runCopy)) {
		activityLabel = 'Project audit';
		entityType = 'audit';
	}

	activityLabel = activityLabel ?? compactText(run.label, 120) ?? 'Agent work';

	const firstRationale = proposedChanges
		.map((change) => compactText(change.rationale))
		.find((value): value is string => Boolean(value));
	const previewCandidates =
		run.status === 'failed'
			? [run.error, result?.error, result?.summary, run.goal]
			: proposedChanges.length > 0
				? [firstRationale, result?.answer, result?.summary, run.goal]
				: [result?.summary, result?.answer, run.expected_output, run.goal];
	const preview =
		previewCandidates
			.map((candidate) => compactText(candidate))
			.find((candidate): candidate is string => Boolean(candidate)) ?? 'Open for details.';

	return {
		projectName: readProjectName(run),
		activityLabel,
		targetLabel,
		preview,
		entityType
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
	const cardPreview = buildAgentRunCardPreview(run, result);
	return {
		runId: run.id,
		label: run.label,
		goal: run.goal,
		runStatus: run.status,
		trigger: run.trigger,
		contextType: run.context_type as AgentRunContextType,
		projectId: run.project_id,
		...cardPreview,
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
