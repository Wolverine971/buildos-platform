// apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/finalization-guard.ts
import type { FastToolExecution } from '../stream-orchestrator/shared';
import { sanitizeAssistantFinalText } from '../stream-orchestrator/assistant-text-sanitization';
import {
	classifyToolExecution,
	didGatewayExecSucceed,
	isDuplicateWriteSkippedExecution
} from '../stream-orchestrator/tool-classification';

export type FinalizationGuardReason =
	| 'empty_after_tools'
	| 'lead_in_after_successful_writes'
	| 'lead_in_after_reads'
	| 'empty_after_successful_writes'
	| 'empty_after_failed_writes'
	| 'empty_after_reads'
	| 'incomplete_mutation_after_reads';

export type FinalizationGuardFinishedReason = 'synthesis_empty' | 'mutation_unfulfilled';

export type FinalizationGuardResult = {
	text: string;
	applied: boolean;
	reason?: FinalizationGuardReason;
	finishedReason?: FinalizationGuardFinishedReason;
};

type ApplyFinalizationGuardParams = {
	finalAssistantText?: string | null;
	assistantText?: string | null;
	toolExecutions?: FastToolExecution[] | null;
	// The user asked for a mutation this turn (explicit request or an identified write op).
	// When set and no write actually succeeded or failed, the turn ended before the
	// change was made — say so honestly instead of emitting the soothing
	// "I gathered context before the turn ended" read summary, which reads as a
	// completed answer and is the root of the "did you update it?" complaint pattern.
	mutationRequested?: boolean;
	expectedWriteToolNames?: string[];
};

type EvidenceItem = {
	id?: string;
	type?: string;
	title: string;
	stateKey?: string;
};

const LEAD_IN_PATTERNS = [
	/\b(i['’]?ll|i will|let me|i['’]?m going to|i am going to)\b/i,
	/\b(check|look up|inspect|pull up|search|find|update|create|make|verify)\b/i,
	/\b(give me|one moment|hang on)\b/i
];

function isLikelyLeadIn(text: string): boolean {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) return false;
	if (normalized.length > 260) return false;
	const lower = normalized.toLowerCase();
	if (
		lower.includes('updated') ||
		lower.includes('created') ||
		lower.includes('deleted') ||
		lower.includes('completed') ||
		lower.includes('finished') ||
		lower.includes('found')
	) {
		return false;
	}
	return LEAD_IN_PATTERNS.some((pattern) => pattern.test(normalized));
}

function plural(count: number, singular: string, pluralValue = `${singular}s`): string {
	return count === 1 ? singular : pluralValue;
}

function buildGuardText(params: {
	successfulWrites: number;
	failedWrites: number;
	successfulReads: number;
	failedReads: number;
	otherSuccesses: number;
	otherFailures: number;
	mutationIncomplete?: boolean;
	toolExecutions?: FastToolExecution[] | null;
}): {
	text: string;
	reason: FinalizationGuardReason;
	finishedReason?: FinalizationGuardFinishedReason;
} {
	const {
		successfulWrites,
		failedWrites,
		successfulReads,
		failedReads,
		otherSuccesses,
		otherFailures,
		mutationIncomplete
	} = params;

	// A write was requested but none was even attempted — the turn ran out of room
	// before the change happened. Be explicit that nothing was updated so the user
	// knows to continue, rather than reading a context summary as a finished result.
	if (mutationIncomplete) {
		const evidenceText = buildReadEvidenceFallbackText(params);
		if (successfulWrites > 0) {
			return {
				text: `I completed ${successfulWrites} requested ${plural(successfulWrites, 'change')}, but I was not able to complete every requested write before the turn ended. The remaining request stays pending.`,
				reason: 'incomplete_mutation_after_reads',
				finishedReason: 'mutation_unfulfilled'
			};
		}
		const lead =
			evidenceText ||
			'I gathered the context I needed but ran out of steps before making the change.';
		return {
			text: `${lead} I was not able to make the requested change before the turn ended, so nothing was updated. The request remains pending and can resume without repeating completed reads.`,
			reason: 'incomplete_mutation_after_reads',
			finishedReason: 'mutation_unfulfilled'
		};
	}

	if (successfulWrites > 0) {
		const writeText =
			successfulWrites === 1
				? 'I completed the requested change.'
				: `I completed ${successfulWrites} requested ${plural(successfulWrites, 'change')}.`;
		if (failedWrites > 0) {
			return {
				text: `${writeText} ${failedWrites} ${plural(failedWrites, 'write')} failed, so I did not claim those as completed.`,
				reason: 'lead_in_after_successful_writes'
			};
		}
		return {
			text: writeText,
			reason: 'empty_after_successful_writes'
		};
	}

	if (failedWrites > 0) {
		return {
			text:
				failedWrites === 1
					? 'I tried to make the requested change, but the tool call failed, so nothing was changed.'
					: `I tried to make the requested changes, but ${failedWrites} write ${plural(failedWrites, 'attempt')} failed, so nothing was changed.`,
			reason: 'empty_after_failed_writes'
		};
	}

	if (successfulReads > 0) {
		const failureSuffix =
			failedReads + otherFailures > 0
				? ` ${failedReads + otherFailures} ${plural(failedReads + otherFailures, 'tool call')} failed while gathering context.`
				: '';
		const evidenceText = buildReadEvidenceFallbackText(params);
		if (evidenceText) {
			return {
				text: `${evidenceText}${failureSuffix}`,
				reason: 'empty_after_reads'
			};
		}
		return {
			text: `I gathered the requested context, but the turn ended before a final response was produced.${failureSuffix}`,
			reason: 'empty_after_reads',
			finishedReason: 'synthesis_empty'
		};
	}

	if (otherSuccesses > 0) {
		return {
			text: 'I completed the tool work, but the turn ended before a final response was produced.',
			reason: 'empty_after_tools'
		};
	}

	return {
		text: 'I tried to complete the request, but the tool work failed before I could produce a final answer.',
		reason: 'empty_after_tools'
	};
}

function buildReadEvidenceFallbackText(params: {
	successfulWrites: number;
	failedWrites: number;
	successfulReads: number;
	failedReads: number;
	otherSuccesses: number;
	otherFailures: number;
	toolExecutions?: FastToolExecution[] | null;
}): string {
	const executions = params.toolExecutions ?? [];
	const workspaceText = buildWorkspaceOverviewFallbackText(executions);
	if (workspaceText) {
		return workspaceText;
	}
	const evidence = collectEvidenceItems(executions).slice(0, 5);
	const notes = collectReadFailureNotes(executions).slice(0, 2);
	if (evidence.length === 0 && notes.length === 0) {
		return '';
	}

	const parts = ['I gathered context before the turn ended.'];
	if (evidence.length > 0) {
		parts.push(`Found: ${evidence.map(formatEvidenceItem).join('; ')}.`);
	}
	if (notes.length > 0) {
		parts.push(`Also: ${notes.join('; ')}.`);
	}
	return parts.join(' ');
}

type WorkspaceProjectFallback = {
	name: string;
	copies: number;
	overdue: number;
	dueSoon: number;
	blocked: number;
	recent: number;
	nextStep: string | null;
	firstIndex: number;
};

function buildWorkspaceOverviewFallbackText(executions: FastToolExecution[]): string {
	const payload = [...executions]
		.reverse()
		.map((execution) => execution.result.result)
		.find(
			(result): result is Record<string, unknown> =>
				Boolean(result) &&
				typeof result === 'object' &&
				!Array.isArray(result) &&
				(result as Record<string, unknown>).scope === 'workspace' &&
				Array.isArray((result as Record<string, unknown>).projects)
		);
	if (!payload) return '';

	const projects = Array.isArray(payload.projects) ? payload.projects : [];
	const snapshot =
		payload.snapshot && typeof payload.snapshot === 'object' && !Array.isArray(payload.snapshot)
			? (payload.snapshot as Record<string, unknown>)
			: null;
	const returnedProjects =
		typeof payload.projects_returned === 'number'
			? payload.projects_returned
			: typeof snapshot?.returned_projects === 'number'
				? snapshot.returned_projects
				: projects.length;
	const totalProjects =
		typeof snapshot?.total_accessible_projects === 'number'
			? snapshot.total_accessible_projects
			: returnedProjects;
	const maybeMore =
		typeof payload.maybe_more === 'boolean'
			? payload.maybe_more
			: Boolean(snapshot?.has_more_projects);

	const grouped = new Map<string, WorkspaceProjectFallback>();
	projects.forEach((project, index) => {
		if (!project || typeof project !== 'object' || Array.isArray(project)) return;
		const record = project as Record<string, unknown>;
		const name = typeof record.name === 'string' ? record.name.trim() : '';
		if (!name) return;
		const counts =
			record.counts && typeof record.counts === 'object' && !Array.isArray(record.counts)
				? (record.counts as Record<string, unknown>)
				: {};
		const existing = grouped.get(name) ?? {
			name,
			copies: 0,
			overdue: 0,
			dueSoon: 0,
			blocked: 0,
			recent: 0,
			nextStep: null,
			firstIndex: index
		};
		existing.copies += 1;
		existing.overdue += numberValue(counts.overdue_tasks);
		existing.dueSoon += numberValue(counts.due_soon_tasks);
		existing.blocked += numberValue(counts.blocked_tasks);
		existing.recent += Array.isArray(record.recent_activity)
			? record.recent_activity.length
			: 0;
		if (!existing.nextStep && typeof record.next_step_short === 'string') {
			const nextStep = record.next_step_short.trim();
			existing.nextStep = nextStep || null;
		}
		grouped.set(name, existing);
	});

	const topProjects = Array.from(grouped.values())
		.sort((a, b) => {
			const aScore = a.overdue * 5 + a.dueSoon * 4 + a.blocked * 3 + a.recent;
			const bScore = b.overdue * 5 + b.dueSoon * 4 + b.blocked * 3 + b.recent;
			return bScore - aScore || a.firstIndex - b.firstIndex;
		})
		.slice(0, 6)
		.map(formatWorkspaceProjectFallback)
		.filter(Boolean);

	const snapshotText = maybeMore
		? `showing ${returnedProjects} of ${totalProjects} accessible projects`
		: `showing ${returnedProjects} accessible ${returnedProjects === 1 ? 'project' : 'projects'}`;
	const parts = [
		`I loaded a workspace overview before the turn ended: ${snapshotText}. Snapshot totals cover only the returned projects.`
	];
	if (topProjects.length > 0) {
		parts.push(`Top signals: ${topProjects.join('; ')}.`);
	}
	return parts.join(' ');
}

function numberValue(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatWorkspaceProjectFallback(project: WorkspaceProjectFallback): string {
	const signals = [
		project.overdue > 0 ? `${project.overdue} overdue` : null,
		project.dueSoon > 0 ? `${project.dueSoon} due soon` : null,
		project.blocked > 0 ? `${project.blocked} blocked` : null,
		project.recent > 0 ? `${project.recent} recent changes` : null
	].filter(Boolean);
	const copyText = project.copies > 1 ? ` (${project.copies} copies)` : '';
	const signalText = signals.length > 0 ? signals.join(', ') : 'no urgent counts in snapshot';
	const nextStep = project.nextStep ? `, next: ${project.nextStep}` : '';
	return `${project.name}${copyText} - ${signalText}${nextStep}`;
}

function collectEvidenceItems(executions: FastToolExecution[]): EvidenceItem[] {
	const items: EvidenceItem[] = [];
	const seen = new Set<string>();
	const addItem = (item: EvidenceItem): void => {
		const title = item.title.trim();
		if (!title) return;
		const key = item.id?.trim() || `${item.type ?? ''}:${title.toLowerCase()}`;
		if (seen.has(key)) return;
		seen.add(key);
		items.push({ ...item, title });
	};

	for (const execution of executions) {
		if (execution.result.success !== true) continue;
		collectEvidenceFromPayload(execution.result.result, addItem);
	}

	return items;
}

function collectEvidenceFromPayload(
	payload: unknown,
	addItem: (item: EvidenceItem) => void,
	collectionType?: string
): void {
	if (!payload || typeof payload !== 'object') return;

	if (Array.isArray(payload)) {
		for (const item of payload) {
			collectEvidenceFromPayload(item, addItem, collectionType);
		}
		return;
	}

	const record = payload as Record<string, unknown>;
	const type =
		normalizeEntityType(record.type ?? record.entity_type ?? record.kind) ?? collectionType;
	const title =
		typeof record.title === 'string'
			? record.title
			: typeof record.name === 'string'
				? record.name
				: '';
	if (type && title) {
		addItem({
			id: typeof record.id === 'string' ? record.id : undefined,
			type,
			title,
			stateKey:
				typeof record.state_key === 'string'
					? record.state_key
					: typeof record.status === 'string'
						? record.status
						: undefined
		});
	}

	for (const [key, nested] of Object.entries(record)) {
		const nestedCollectionType = collectionTypeForKey(key);
		if (nestedCollectionType || key === 'results') {
			collectEvidenceFromPayload(nested, addItem, nestedCollectionType);
		}
	}
}

function collectReadFailureNotes(executions: FastToolExecution[]): string[] {
	const notes: string[] = [];
	for (const execution of executions) {
		const payload = execution.result.result;
		if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
		const record = payload as Record<string, unknown>;
		const status = typeof record.status === 'string' ? record.status : '';
		if (status !== 'not_found' && status !== 'wrong_entity_kind') continue;
		const message = typeof record.message === 'string' ? record.message.trim() : '';
		if (!message) continue;
		notes.push(message.replace(/\s+/g, ' '));
	}
	return notes;
}

function formatEvidenceItem(item: EvidenceItem): string {
	const typeText = item.type ? `${item.type} ` : '';
	const stateText = item.stateKey ? ` (${item.stateKey})` : '';
	return `${typeText}"${item.title}"${stateText}`;
}

function normalizeEntityType(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return null;
	if (normalized === 'doc') return 'document';
	if (normalized.endsWith('s')) return normalized.slice(0, -1);
	return normalized;
}

function collectionTypeForKey(key: string): string | undefined {
	if (key === 'project') return 'project';
	if (key === 'projects') return 'project';
	if (key === 'task') return 'task';
	if (key === 'tasks') return 'task';
	if (key === 'document') return 'document';
	if (key === 'documents') return 'document';
	if (key === 'goal') return 'goal';
	if (key === 'goals') return 'goal';
	if (key === 'plan') return 'plan';
	if (key === 'plans') return 'plan';
	if (key === 'milestone') return 'milestone';
	if (key === 'milestones') return 'milestone';
	if (key === 'risk') return 'risk';
	if (key === 'risks') return 'risk';
	return undefined;
}

export function applyFinalizationGuard(
	params: ApplyFinalizationGuardParams
): FinalizationGuardResult {
	const toolExecutions = params.toolExecutions ?? [];
	const finalText = sanitizeAssistantFinalText(params.finalAssistantText ?? '').trim();
	const assistantText = sanitizeAssistantFinalText(params.assistantText ?? '').trim();
	const candidate = finalText || assistantText;

	if (toolExecutions.length === 0) {
		return { text: candidate, applied: false };
	}

	let successfulWrites = 0;
	let failedWrites = 0;
	let successfulReads = 0;
	let failedReads = 0;
	let otherSuccesses = 0;
	let otherFailures = 0;
	const successfulWriteToolNames = new Set<string>();

	for (const execution of toolExecutions) {
		if (isDuplicateWriteSkippedExecution(execution)) continue;
		const category = classifyToolExecution(execution);
		// Gateway writes return `success: true` whenever the handler didn't throw,
		// even when the envelope carries `ok: false`. Judge success on the ok-aware
		// check so an `{ ok: false }` write is not counted as completed.
		const success = didGatewayExecSucceed(execution);
		if (category === 'write') {
			if (success) {
				successfulWrites += 1;
				successfulWriteToolNames.add(execution.toolCall.function?.name?.trim() ?? '');
			} else failedWrites += 1;
		} else if (category === 'read_discovery') {
			if (success) successfulReads += 1;
			else failedReads += 1;
		} else if (success) {
			otherSuccesses += 1;
		} else {
			otherFailures += 1;
		}
	}

	// A requested mutation that never ran (no write succeeded or failed) must not be
	// papered over with a lead-in like "let me update that" — the change did not happen.
	const expectedWriteToolNames = Array.from(new Set(params.expectedWriteToolNames ?? []));
	const mutationIncomplete =
		params.mutationRequested === true &&
		(expectedWriteToolNames.length > 0
			? expectedWriteToolNames.some((toolName) => !successfulWriteToolNames.has(toolName))
			: successfulWrites === 0 && failedWrites === 0);
	const shouldReplaceWriteLeadIn = successfulWrites > 0 && candidate && isLikelyLeadIn(candidate);
	const shouldReplaceReadLeadIn =
		successfulWrites === 0 && successfulReads > 0 && candidate && isLikelyLeadIn(candidate);
	const shouldReplaceMutationLeadIn =
		mutationIncomplete && Boolean(candidate) && isLikelyLeadIn(candidate);
	const shouldReplaceLeadIn =
		shouldReplaceWriteLeadIn || shouldReplaceReadLeadIn || shouldReplaceMutationLeadIn;
	const shouldSynthesizeEmpty = !candidate;

	if (!shouldReplaceLeadIn && !shouldSynthesizeEmpty) {
		return { text: candidate, applied: false };
	}

	const synthesized = buildGuardText({
		successfulWrites,
		failedWrites,
		successfulReads,
		failedReads,
		otherSuccesses,
		otherFailures,
		mutationIncomplete,
		toolExecutions
	});

	if (synthesized.reason === 'incomplete_mutation_after_reads') {
		return {
			text: synthesized.text,
			applied: true,
			reason: synthesized.reason,
			finishedReason: synthesized.finishedReason
		};
	}

	return {
		text: synthesized.text,
		applied: true,
		reason: shouldReplaceWriteLeadIn
			? 'lead_in_after_successful_writes'
			: shouldReplaceReadLeadIn
				? 'lead_in_after_reads'
				: synthesized.reason,
		finishedReason: synthesized.finishedReason
	};
}
