// apps/worker/src/workers/project-loop/projectLoopWorker.ts
//
// buildos_project_loop job processor. Runs a per-project reconciliation pass and
// writes reviewable suggestions to project_suggestions. It does NOT mutate the
// project — proposed changes are replayed by the web app on user approval.

import type {
	Json,
	ProjectAuditDeliveryConfidence,
	ProjectAuditDimension,
	ProjectAuditDimensionKey,
	ProjectAuditEvidenceRef,
	ProjectAuditRecommendation,
	ProjectAuditSuggestionRole,
	LoopOperation,
	ProjectLoopBrief,
	ProjectLoopJobMetadata,
	ProjectLoopRun,
	ProjectSuggestionEvidenceRef,
	ProjectSuggestionKind,
	ProposedSuggestion
} from '@buildos/shared-types';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { supabase } from '../../lib/supabase';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import { PROJECT_LOOPS_ENABLED } from '../../config/projectLoops';
import { logWorkerError } from '../../lib/errorLogger';
import { captureWorkerEvent } from '../../lib/posthog';
import {
	type LoopContext,
	type LoopDocument,
	type LoopPriorDecision,
	type LoopTask,
	type UsageEvent,
	generateDrift,
	generateDocOrganization,
	generateOutdatedDocs,
	generateProjectBrief,
	generateTaskConflicts,
	suggestionSuppressionKey
} from './generators';
import {
	buildHeuristicProjectLoopBrief,
	buildProjectLoopParentMap,
	buildScopedSuggestionFingerprint,
	extractProjectLoopSuggestionEntities,
	loadProjectLoopSuggestionEntityStates,
	MAX_PROJECT_LOOP_CONTEXT_DOCUMENTS,
	projectLoopDocumentRecencyMs,
	projectReviewSignalDedupKey,
	PROJECT_REVIEW_SIGNAL_QUEUE_MODE,
	PROJECT_REVIEW_SIGNAL_TRIGGER_REASON,
	type ProjectLoopScopedEntity,
	summarizeProjectLoopDocTree,
	syncInboxItemForProjectSuggestion
} from '@buildos/shared-agent-ops';
import {
	expireInboxItemsForProjectAuditChildSuggestions,
	syncInboxItemForProjectAudit
} from '@buildos/shared-agent-ops/inbox-index';
import {
	processProjectAuditTriggerEvaluationJob,
	queueProjectAuditFromWorker
} from './auditEnqueue';
import { enqueueProjectLoop } from './enqueue';

function isProjectAuditTriggerReason(
	value: ProjectLoopJobMetadata['triggerReason']
): value is Exclude<ProjectLoopJobMetadata['triggerReason'], 'end_of_day'> {
	return (
		value === 'scheduled' ||
		value === 'burst' ||
		value === 'critical_change' ||
		value === 'manual'
	);
}

const MAX_SUGGESTIONS = 25;
const MAX_AUDIT_CHILD_SUGGESTIONS = 8;
const PROJECT_LOOP_COST_CAP_USD = 0.35;
const COMPLETE_AUDIT_SYNTHESIS_COST_CAP_USD = 0.35;
const COMPLETE_AUDIT_SYNTHESIS_MODEL_USED = 'llm-audit-synthesis-v1';
const COMPLETE_AUDIT_DETERMINISTIC_MODEL_USED = 'deterministic-audit-v1';
const PRIOR_DECISION_LOOKBACK_DAYS = 60;
const COMPLETE_AUDIT_ACTIVITY_LOOKBACK_DAYS = 30;
const AUDIT_MEMORY_LOOKBACK_DAYS = 90;
const SUGGESTION_SUPPRESSION_LOOKBACK_DAYS = 60;
// Statuses whose suggestions should suppress a fresh duplicate: still-open items
// (pending/delegated), user dismissals (rejected), and already-applied work.
// 'superseded' and 'failed' are intentionally excluded — the user never got to
// act on those, so re-surfacing them after a fresh run is desirable.
const SUGGESTION_SUPPRESSION_STATUSES = ['pending', 'delegated', 'rejected', 'applied'];

function nowIso(): string {
	return new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseDecisionFeedback(value: unknown): {
	reason?: string | null;
	note?: string | null;
} {
	const record = asRecord(value);
	return {
		reason: asString(record?.reason),
		note: asString(record?.note)
	};
}

async function loadPriorDecisions(projectId: string): Promise<LoopPriorDecision[]> {
	const since = new Date(
		Date.now() - PRIOR_DECISION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
	).toISOString();
	// No user_feedback filter: dismissals now always carry synthetic feedback,
	// and applied cleanup carries none — but future runs still need to see that
	// work was already done so the model does not re-propose it.
	const { data, error } = await supabase
		.from('project_suggestions')
		.select('title, kind, status, user_feedback, decided_at, updated_at')
		.eq('project_id', projectId)
		.in('status', ['rejected', 'applied', 'delegated', 'superseded'])
		.gte('updated_at', since)
		.order('updated_at', { ascending: false })
		.limit(30);

	if (error) {
		console.warn(
			`[ProjectLoops] Failed to load prior decisions for project ${projectId}:`,
			error.message
		);
		return [];
	}

	return ((data ?? []) as Record<string, unknown>[])
		.map((row): LoopPriorDecision | null => {
			const title = asString(row.title);
			const kind = asString(row.kind);
			const status = asString(row.status);
			if (!title || !kind || !status) return null;
			const feedback = parseDecisionFeedback(row.user_feedback);
			return {
				title,
				kind,
				status,
				reason: feedback.reason,
				note: feedback.note,
				decided_at: asString(row.decided_at) ?? asString(row.updated_at)
			};
		})
		.filter((decision): decision is LoopPriorDecision => Boolean(decision));
}

/**
 * Suppression keys for the project's still-open and recently-decided suggestions,
 * so a fresh run does not re-emit a duplicate the user is already looking at (or
 * has already acted on). `rejected` keys are tracked separately so the caller can
 * count how often the model tries to re-surface something the user dismissed
 * (repeated-after-dismissal telemetry — audit Tier 1 #6).
 */
async function loadExistingSuggestionKeys(
	projectId: string
): Promise<{ all: Set<string>; rejected: Set<string> }> {
	const since = new Date(
		Date.now() - SUGGESTION_SUPPRESSION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
	).toISOString();
	const { data, error } = await supabase
		.from('project_suggestions')
		.select('kind, operations, status')
		.eq('project_id', projectId)
		.in('status', SUGGESTION_SUPPRESSION_STATUSES)
		.gte('created_at', since)
		.limit(500);

	if (error) {
		console.warn(
			`[ProjectLoops] Failed to load existing suggestion keys for project ${projectId}:`,
			error.message
		);
		return { all: new Set(), rejected: new Set() };
	}

	const all = new Set<string>();
	const rejected = new Set<string>();
	for (const row of (data ?? []) as Record<string, unknown>[]) {
		const key = suggestionSuppressionKey({
			kind: asString(row.kind) ?? '',
			operations: (row.operations as LoopOperation[] | null) ?? []
		});
		if (!key) continue;
		all.add(key);
		if (asString(row.status) === 'rejected') rejected.add(key);
	}
	return { all, rejected };
}

async function loadLoopContext(projectId: string): Promise<LoopContext | null> {
	const { data: projectRow, error: projectError } = await supabase
		.from('onto_projects')
		.select('id, name, description, doc_structure, deleted_at, archived_at')
		.eq('id', projectId)
		.maybeSingle();

	if (projectError) throw new Error(`Failed to load project: ${projectError.message}`);
	if (!projectRow || projectRow.deleted_at || projectRow.archived_at) return null;

	const { data: graphData, error: graphError } = await supabase.rpc(
		'load_project_graph_context',
		{ p_project_id: projectId }
	);
	if (graphError) throw new Error(`Failed to load project graph: ${graphError.message}`);

	const payload = graphData as any;
	const rawDocsAll: any[] = Array.isArray(payload?.documents) ? payload.documents : [];
	const rawTasks: any[] = Array.isArray(payload?.tasks) ? payload.tasks : [];
	const rawGoals: any[] = Array.isArray(payload?.goals) ? payload.goals : [];
	const rawEdges: any[] = Array.isArray(payload?.edges) ? payload.edges : [];
	const priorDecisions = await loadPriorDecisions(projectId);

	const parentMap = buildProjectLoopParentMap(projectRow.doc_structure);
	// Titles for the whole tree stay complete so the doc-tree summary never
	// degrades to raw UUIDs, but the document list fed into generator prompts is
	// capped to the most-recently-updated N (audit §6 / Tier 1 #8).
	const titleById = new Map<string, string>(
		rawDocsAll.map((d) => [d.id as string, (d.title as string) ?? 'Untitled'])
	);
	const rawDocs = [...rawDocsAll]
		.sort((a, b) => projectLoopDocumentRecencyMs(b) - projectLoopDocumentRecencyMs(a))
		.slice(0, MAX_PROJECT_LOOP_CONTEXT_DOCUMENTS);

	const documents: LoopDocument[] = rawDocs.map((d) => ({
		id: d.id,
		title: d.title ?? 'Untitled',
		type_key: d.type_key ?? null,
		state_key: d.state_key ?? null,
		description: d.description ?? null,
		updated_at: d.updated_at ?? d.created_at ?? null,
		parent_id: parentMap.get(d.id) ?? null
	}));

	const goalNameById = new Map<string, string>(
		rawGoals.map((goal) => [
			goal.id as string,
			(goal.name as string) ?? (goal.goal as string) ?? 'Untitled goal'
		])
	);
	const goalNamesByTaskId = new Map<string, Set<string>>();
	for (const edge of rawEdges) {
		if (edge?.rel !== 'supports_goal') continue;
		const taskId =
			edge.src_kind === 'task' ? edge.src_id : edge.dst_kind === 'task' ? edge.dst_id : null;
		const goalId =
			edge.src_kind === 'goal' ? edge.src_id : edge.dst_kind === 'goal' ? edge.dst_id : null;
		if (typeof taskId !== 'string' || typeof goalId !== 'string') continue;
		const goalName = goalNameById.get(goalId);
		if (!goalName) continue;
		const next = goalNamesByTaskId.get(taskId) ?? new Set<string>();
		next.add(goalName);
		goalNamesByTaskId.set(taskId, next);
	}

	const tasks: LoopTask[] = rawTasks
		.filter((t) => t.state_key !== 'done')
		.sort((a, b) => {
			const bMs = parseDateMs(b.updated_at ?? b.created_at) ?? 0;
			const aMs = parseDateMs(a.updated_at ?? a.created_at) ?? 0;
			return bMs - aMs || String(a.title ?? '').localeCompare(String(b.title ?? ''));
		})
		.slice(0, 20)
		.map((t) => ({
			id: t.id,
			title: t.title ?? 'Untitled',
			description: t.description ?? null,
			type_key: t.type_key ?? null,
			state_key: t.state_key ?? null,
			priority: typeof t.priority === 'number' ? t.priority : null,
			start_at: t.start_at ?? null,
			due_at: t.due_at ?? null,
			updated_at: t.updated_at ?? t.created_at ?? null,
			goal_names: Array.from(goalNamesByTaskId.get(t.id) ?? []).sort()
		}));

	return {
		projectId,
		projectName: projectRow.name ?? 'Untitled project',
		projectDescription: projectRow.description ?? null,
		goals: rawGoals.slice(0, 10).map((g) => ({
			name: g.name ?? g.goal ?? 'Untitled goal',
			description: g.description ?? null
		})),
		documents,
		docStructureSummary: summarizeProjectLoopDocTree(projectRow.doc_structure, titleById),
		tasks,
		priorDecisions
	};
}

async function failRun(
	runId: string,
	message: string,
	metrics?: { totalCost?: number }
): Promise<void> {
	const update: {
		status: 'failed';
		error_message: string;
		finished_at: string;
		cost_usd?: number;
	} = { status: 'failed', error_message: message, finished_at: nowIso() };
	if (metrics?.totalCost && metrics.totalCost > 0) {
		update.cost_usd = metrics.totalCost;
	}
	const { error } = await supabase.from('project_loop_runs').update(update).eq('id', runId);
	if (error) {
		console.error(
			`[ProjectLoops] Failed to persist failed status for run ${runId}: ${error.message}`
		);
	}
}

async function failQueuedRun(runId: string, message: string): Promise<void> {
	const { error } = await supabase
		.from('project_loop_runs')
		.update({ status: 'failed', error_message: message, finished_at: nowIso() })
		.eq('id', runId)
		.eq('status', 'queued');
	if (error) {
		console.error(
			`[ProjectLoops] Failed to persist failed status for queued run ${runId}: ${error.message}`
		);
	}
}

async function failCompleteAuditState({
	runId,
	auditId,
	message,
	runStatuses,
	auditStatuses
}: {
	runId: string;
	auditId: string;
	message: string;
	runStatuses?: string[];
	auditStatuses?: string[];
}): Promise<void> {
	const now = nowIso();
	const runUpdate = {
		status: 'failed' as const,
		error_message: message,
		finished_at: now
	};
	const auditUpdate = {
		status: 'failed' as const,
		error_message: message,
		finished_at: now
	};

	const runQuery = supabase.from('project_loop_runs').update(runUpdate).eq('id', runId);
	const auditQuery = supabase.from('project_audits').update(auditUpdate).eq('id', auditId);

	const [runResult, auditResult] = await Promise.all([
		runStatuses?.length ? runQuery.in('status', runStatuses) : runQuery,
		auditStatuses?.length ? auditQuery.in('status', auditStatuses) : auditQuery
	]);

	if (runResult.error) {
		console.error(
			`[ProjectAudits] Failed to persist failed status for run ${runId}: ${runResult.error.message}`
		);
	}
	if (auditResult.error) {
		console.error(
			`[ProjectAudits] Failed to persist failed status for audit ${auditId}: ${auditResult.error.message}`
		);
	}
}

async function supersedePendingSuggestionsForFailedRun(params: {
	runId: string;
	message: string;
}): Promise<number> {
	const result = {
		ok: false,
		applied_operations: 0,
		errors: [
			{
				tool: 'project_loop_run',
				error: params.message
			}
		]
	};
	const { data: updatedSuggestions, error } = await supabase
		.from('project_suggestions')
		.update({
			status: 'superseded',
			decided_at: nowIso(),
			result: result as unknown as Json
		})
		.eq('run_id', params.runId)
		.eq('status', 'pending')
		.select('*');

	if (error) {
		console.error(
			`[ProjectLoops] Failed to supersede pending suggestions for failed run ${params.runId}: ${error.message}`
		);
		return 0;
	}

	for (const suggestion of updatedSuggestions ?? []) {
		try {
			await syncInboxItemForProjectSuggestion({
				supabase: supabase as any,
				suggestion: suggestion as unknown as Record<string, unknown>
			});
		} catch (syncError) {
			console.warn(
				`⚠️ Failed to sync AI Inbox item for superseded failed-run suggestion ${suggestion.id}:`,
				syncError instanceof Error ? syncError.message : syncError
			);
		}
	}

	return (updatedSuggestions ?? []).length;
}

async function scheduleDebouncedProjectReviewSignalWakeup(params: {
	projectId: string;
	userId: string;
	signalId: string;
	dueAt: string;
}): Promise<void> {
	const { error } = await supabase.rpc('add_queue_job', {
		p_user_id: params.userId,
		p_job_type: 'buildos_project_loop',
		p_metadata: {
			mode: PROJECT_REVIEW_SIGNAL_QUEUE_MODE,
			signalId: params.signalId,
			projectId: params.projectId,
			userId: params.userId,
			triggerReason: PROJECT_REVIEW_SIGNAL_TRIGGER_REASON
		} as unknown as Json,
		p_priority: 8,
		p_scheduled_for: params.dueAt,
		p_dedup_key: `${projectReviewSignalDedupKey(params.projectId)}:retry:${params.dueAt.slice(0, 16)}`
	});

	if (error) {
		console.warn(
			`[ProjectLoops] Failed to reschedule debounced review signal ${params.signalId}: ${error.message}`
		);
	}
}

async function processDebouncedProjectReviewSignalJob(
	job: ProcessingJob<ProjectLoopJobMetadata>
): Promise<{ success: boolean; runId?: string; auditId?: string; skipped?: boolean }> {
	const { projectId, userId, signalId } = job.data;
	if (!projectId || !userId) {
		throw new Error('projectId and userId are required for debounced review signal jobs');
	}

	let query = (supabase as any)
		.from('project_review_signals')
		.select('*')
		.eq('project_id', projectId)
		.eq('status', 'pending');
	if (signalId) query = query.eq('id', signalId);
	const { data: signal, error: signalError } = await query
		.order('due_at', { ascending: true })
		.limit(1)
		.maybeSingle();

	if (signalError) {
		throw new Error(`Failed to load debounced project review signal: ${signalError.message}`);
	}
	if (!signal?.id) {
		await job.log('No pending debounced project review signal found; skipping.');
		return { success: true, skipped: true };
	}

	const pendingSignal = signal as ProjectReviewSignalRow;
	const dueMs = Date.parse(pendingSignal.due_at);
	const now = new Date();
	if (Number.isFinite(dueMs) && dueMs > now.getTime() + 1000) {
		await scheduleDebouncedProjectReviewSignalWakeup({
			projectId,
			userId,
			signalId: pendingSignal.id,
			dueAt: pendingSignal.due_at
		});
		await job.log(
			`Debounced project review signal ${pendingSignal.id} is not due until ${pendingSignal.due_at}; rescheduled.`
		);
		return { success: true, skipped: true };
	}

	const nowIso = now.toISOString();
	const { data: claimed, error: claimError } = await (supabase as any)
		.from('project_review_signals')
		.update({ status: 'processing', started_at: nowIso, queue_job_id: job.id })
		.eq('id', pendingSignal.id)
		.eq('status', 'pending')
		.lte('due_at', nowIso)
		.select('*')
		.maybeSingle();

	if (claimError) {
		throw new Error(`Failed to claim debounced project review signal: ${claimError.message}`);
	}
	if (!claimed?.id) {
		await job.log(
			`Debounced project review signal ${pendingSignal.id} was already claimed or deferred; skipping.`
		);
		return { success: true, skipped: true };
	}

	try {
		const [loopResult, auditResult] = await Promise.all([
			enqueueProjectLoop({
				projectId,
				userId,
				triggerReason: PROJECT_REVIEW_SIGNAL_TRIGGER_REASON
			}),
			queueProjectAuditFromWorker({
				projectId,
				userId,
				triggerReason: PROJECT_REVIEW_SIGNAL_TRIGGER_REASON
			})
		]);

		await (supabase as any)
			.from('project_review_signals')
			.update({
				status: 'completed',
				finished_at: new Date().toISOString(),
				processed_loop_run_id: loopResult.runId ?? null,
				processed_audit_id: auditResult.auditId ?? null,
				error_message: loopResult.reason ?? auditResult.reason ?? null
			})
			.eq('id', pendingSignal.id)
			.eq('status', 'processing');

		await job.log(
			`Debounced project review signal ${pendingSignal.id} processed: loop=${loopResult.reason ?? loopResult.runId ?? 'queued'}, audit=${auditResult.reason ?? auditResult.auditId ?? 'queued'}.`
		);
		return {
			success: true,
			runId: loopResult.runId,
			auditId: auditResult.auditId,
			skipped: !loopResult.queued && !auditResult.queued
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Debounced project review signal failed';
		await (supabase as any)
			.from('project_review_signals')
			.update({
				status: 'failed',
				error_message: message,
				finished_at: new Date().toISOString()
			})
			.eq('id', pendingSignal.id)
			.eq('status', 'processing');
		throw error;
	}
}

type AuditActivityRow = {
	entity_type: string | null;
	entity_id: string | null;
	action: string | null;
	created_at: string | null;
};

type AuditMetricSummary = {
	documentCount: number;
	taskCount: number;
	goalCount: number;
	openTaskCount: number;
	blockedTaskCount: number;
	staleDocumentCount: number;
	recentActivityCount: number;
};

type AuditRecommendationDecision = {
	title: string;
	status: string;
	reason?: string | null;
	note?: string | null;
	decided_at?: string | null;
};

type PriorAuditSummary = {
	id: string;
	status: string | null;
	delivery_confidence: string | null;
	summary: string | null;
	finished_at: string | null;
	created_at: string | null;
	unresolved_suggestion_count: number | null;
};

type AuditMemory = {
	priorAudits: PriorAuditSummary[];
	priorRecommendationDecisions: AuditRecommendationDecision[];
	unresolvedAuditRecommendationCount: number;
	openInboxCount: number;
};

type AuditChildSuggestionDraft = {
	role: ProjectAuditSuggestionRole;
	row: {
		run_id: string;
		project_id: string;
		kind: 'audit_recommendation';
		risk_tier: 1 | 2;
		title: string;
		rationale: string | null;
		why_now: string | null;
		confidence: number;
		evidence_refs: Json;
		preview: Json;
		operations: Json;
		freshness_state: 'fresh';
		reversible: false;
		undo_operations: Json;
		source_fingerprint: string | null;
		status: 'pending';
		sort_order: number;
	};
};

type AuditChildSuggestionResult = {
	generatedCount: number;
	unresolvedCount: number;
	warning?: string;
};

type CompleteAuditPacket = ReturnType<typeof buildCompleteAuditPacket>;

type ProjectReviewSignalRow = {
	id: string;
	project_id: string;
	user_id: string;
	status: string;
	due_at: string;
};

type RawAuditEvidenceRef = {
	entity_type?: unknown;
	entity_id?: unknown;
	label?: unknown;
	title?: unknown;
	reason?: unknown;
	excerpt?: unknown;
	updated_at?: unknown;
};

type RawAuditFinding = {
	title?: unknown;
	summary?: unknown;
	dimension?: unknown;
	rating?: unknown;
	evidence_refs?: unknown;
};

type RawAuditDimensionUpdate = {
	key?: unknown;
	rating?: unknown;
	summary?: unknown;
	uncertainty?: unknown;
	recommendations?: unknown;
	evidence_refs?: unknown;
};

type RawAuditRisk = {
	title?: unknown;
	summary?: unknown;
	severity?: unknown;
	dimension?: unknown;
	evidence_refs?: unknown;
};

type RawAuditOpenQuestion = {
	question?: unknown;
	dimension?: unknown;
	evidence_refs?: unknown;
};

type RawAuditRecommendation = {
	title?: unknown;
	summary?: unknown;
	role?: unknown;
	priority?: unknown;
	dimension?: unknown;
	target_entity_type?: unknown;
	target_entity_id?: unknown;
	evidence_refs?: unknown;
};

type RawAuditSynthesisEnvelope = {
	audit?: {
		delivery_confidence?: unknown;
		project_thesis?: unknown;
		summary?: unknown;
		top_findings?: unknown;
		dimension_updates?: unknown;
		risks?: unknown;
		open_questions?: unknown;
		recommendations?: unknown;
	};
};

type AuditSynthesisResult = {
	packet: CompleteAuditPacket;
	modelUsed: string;
	costUsd: number;
	warning?: string;
};

function parseDateMs(value: string | null | undefined): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function compactAuditText(value: string | null | undefined, maxLength: number): string | null {
	const normalized = value?.replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	return normalized.length <= maxLength
		? normalized
		: `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function auditEvidenceRef(params: {
	entity_type: ProjectAuditEvidenceRef['entity_type'];
	entity_id?: string | null;
	label: string;
	reason?: string;
	updated_at?: string | null;
}): ProjectAuditEvidenceRef {
	return {
		entity_type: params.entity_type,
		...(params.entity_id ? { entity_id: params.entity_id } : {}),
		label: params.label,
		...(params.reason ? { reason: params.reason } : {}),
		...(params.updated_at ? { updated_at: params.updated_at } : {})
	};
}

async function loadAuditRecentActivity(projectId: string): Promise<AuditActivityRow[]> {
	const since = new Date(
		Date.now() - COMPLETE_AUDIT_ACTIVITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
	).toISOString();
	const { data, error } = await supabase
		.from('onto_project_logs')
		.select('entity_type, entity_id, action, created_at')
		.eq('project_id', projectId)
		.gte('created_at', since)
		.order('created_at', { ascending: false })
		.limit(100);
	if (error) {
		console.warn(
			`[ProjectAudits] Failed to load recent activity for ${projectId}:`,
			error.message
		);
		return [];
	}
	return (data ?? []) as AuditActivityRow[];
}

async function loadAuditMemory(projectId: string): Promise<AuditMemory> {
	const since = new Date(
		Date.now() - AUDIT_MEMORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
	).toISOString();
	const [priorAuditsRes, priorRecommendationsRes, unresolvedRecommendationsRes, inboxRes] =
		await Promise.all([
			supabase
				.from('project_audits')
				.select(
					'id, status, delivery_confidence, summary, finished_at, created_at, unresolved_suggestion_count'
				)
				.eq('project_id', projectId)
				.in('status', ['ready', 'reviewed', 'superseded'])
				.order('created_at', { ascending: false })
				.limit(5),
			supabase
				.from('project_suggestions')
				.select('title, status, user_feedback, decided_at, updated_at')
				.eq('project_id', projectId)
				.eq('kind', 'audit_recommendation')
				.in('status', ['rejected', 'applied'])
				.gte('updated_at', since)
				.order('updated_at', { ascending: false })
				.limit(40),
			supabase
				.from('project_suggestions')
				.select('id')
				.eq('project_id', projectId)
				.eq('kind', 'audit_recommendation')
				.in('status', ['pending', 'delegated', 'failed'])
				.limit(100),
			supabase
				.from('inbox_items')
				.select('id')
				.eq('project_id', projectId)
				.in('status', ['pending', 'deciding', 'blocked'])
				.limit(100)
		]);

	if (priorAuditsRes.error) {
		console.warn(
			`[ProjectAudits] Failed to load prior audit summaries for ${projectId}:`,
			priorAuditsRes.error.message
		);
	}
	if (priorRecommendationsRes.error) {
		console.warn(
			`[ProjectAudits] Failed to load prior audit recommendation decisions for ${projectId}:`,
			priorRecommendationsRes.error.message
		);
	}
	if (unresolvedRecommendationsRes.error) {
		console.warn(
			`[ProjectAudits] Failed to load unresolved audit recommendations for ${projectId}:`,
			unresolvedRecommendationsRes.error.message
		);
	}
	if (inboxRes.error) {
		console.warn(
			`[ProjectAudits] Failed to load open inbox count for ${projectId}:`,
			inboxRes.error.message
		);
	}

	const priorRecommendationDecisions = (
		(priorRecommendationsRes.error ? [] : (priorRecommendationsRes.data ?? [])) as Record<
			string,
			unknown
		>[]
	)
		.map((row): AuditRecommendationDecision | null => {
			const title = asString(row.title);
			const status = asString(row.status);
			if (!title || !status) return null;
			const feedback = parseDecisionFeedback(row.user_feedback);
			return {
				title,
				status,
				reason: feedback.reason,
				note: feedback.note,
				decided_at: asString(row.decided_at) ?? asString(row.updated_at)
			};
		})
		.filter((item): item is AuditRecommendationDecision => Boolean(item));

	return {
		priorAudits: (priorAuditsRes.error
			? []
			: (priorAuditsRes.data ?? [])) as PriorAuditSummary[],
		priorRecommendationDecisions,
		unresolvedAuditRecommendationCount: unresolvedRecommendationsRes.error
			? 0
			: (unresolvedRecommendationsRes.data ?? []).length,
		openInboxCount: inboxRes.error ? 0 : (inboxRes.data ?? []).length
	};
}

function computeAuditMetrics(
	ctx: LoopContext,
	recentActivity: AuditActivityRow[]
): AuditMetricSummary {
	const nowMs = Date.now();
	const staleDocumentCount = ctx.documents.filter((doc) => {
		const updatedMs = parseDateMs(doc.updated_at);
		if (updatedMs === null) return true;
		return nowMs - updatedMs > 30 * 24 * 60 * 60 * 1000;
	}).length;
	const openTasks = ctx.tasks.filter((task) => task.state_key !== 'done');
	return {
		documentCount: ctx.documents.length,
		taskCount: ctx.tasks.length,
		goalCount: ctx.goals.length,
		openTaskCount: openTasks.length,
		blockedTaskCount: openTasks.filter((task) => task.state_key === 'blocked').length,
		staleDocumentCount,
		recentActivityCount: recentActivity.length
	};
}

function dimension(params: {
	key: ProjectAuditDimensionKey;
	name: string;
	rating: ProjectAuditDimension['rating'];
	summary: string;
	evidence_refs?: ReturnType<typeof auditEvidenceRef>[];
	recommendations?: string[];
	uncertainty?: string | null;
}): ProjectAuditDimension {
	return {
		key: params.key,
		name: params.name,
		rating: params.rating,
		summary: params.summary,
		evidence_refs: params.evidence_refs ?? [],
		...(params.recommendations?.length ? { recommendations: params.recommendations } : {}),
		...(params.uncertainty ? { uncertainty: params.uncertainty } : {})
	};
}

function withoutDimensionRecommendations(item: ProjectAuditDimension): ProjectAuditDimension {
	const next = { ...item };
	delete next.recommendations;
	return next;
}

function auditRecommendationRole(
	dimensionKey: string | undefined,
	priority: ProjectAuditRecommendation['priority']
): ProjectAuditSuggestionRole {
	if (dimensionKey === 'risk_decision_quality') return 'risk_follow_up';
	if (dimensionKey === 'documentation_quality' || dimensionKey === 'evidence_freshness') {
		return 'cleanup';
	}
	if (priority === 'high' || dimensionKey === 'dependency_readiness') return 'decision_point';
	return 'recommended_action';
}

function suggestionEvidenceType(
	type: ProjectAuditEvidenceRef['entity_type']
): ProjectSuggestionEvidenceRef['entity_type'] {
	if (
		type === 'project' ||
		type === 'goal' ||
		type === 'document' ||
		type === 'task' ||
		type === 'calendar_event' ||
		type === 'external'
	) {
		return type;
	}
	return 'unknown';
}

function auditEvidenceToSuggestionEvidence(
	ref: ProjectAuditEvidenceRef
): ProjectSuggestionEvidenceRef {
	return {
		entity_type: suggestionEvidenceType(ref.entity_type),
		...(ref.entity_id ? { entity_id: ref.entity_id } : {}),
		title: ref.label,
		...(ref.reason ? { reason: ref.reason } : {}),
		...(ref.excerpt ? { excerpt: ref.excerpt } : {}),
		...(ref.updated_at ? { updated_at: ref.updated_at } : {})
	};
}

function recommendationRiskTier(recommendation: ProjectAuditRecommendation): 1 | 2 {
	if (recommendation.priority === 'low') return 1;
	return 2;
}

function recommendationMemoryKey(value: string | null | undefined): string | null {
	const normalized = value
		?.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
	return normalized || null;
}

function asUnknownArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

const AUDIT_DIMENSION_KEYS = new Set<ProjectAuditDimensionKey>([
	'intent_clarity',
	'documentation_quality',
	'plan_integrity',
	'execution_health',
	'drift_scope_control',
	'risk_decision_quality',
	'dependency_readiness',
	'evidence_freshness'
]);

function asAuditDimensionKey(value: unknown): ProjectAuditDimensionKey | null {
	const key = asString(value);
	return key && AUDIT_DIMENSION_KEYS.has(key as ProjectAuditDimensionKey)
		? (key as ProjectAuditDimensionKey)
		: null;
}

function asAuditRating(value: unknown): ProjectAuditDimension['rating'] | null {
	const rating = asString(value);
	return rating === 'green' || rating === 'yellow' || rating === 'red' || rating === 'unknown'
		? rating
		: null;
}

function asDeliveryConfidence(value: unknown): ProjectAuditDeliveryConfidence | null {
	const confidence = asString(value);
	return confidence === 'green' ||
		confidence === 'yellow' ||
		confidence === 'red' ||
		confidence === 'unknown'
		? confidence
		: null;
}

function asRecommendationRole(value: unknown): ProjectAuditSuggestionRole | null {
	const role = asString(value);
	return role === 'recommended_action' ||
		role === 'risk_follow_up' ||
		role === 'cleanup' ||
		role === 'decision_point'
		? role
		: null;
}

function asRecommendationPriority(value: unknown): 'low' | 'medium' | 'high' | null {
	const priority = asString(value);
	return priority === 'low' || priority === 'medium' || priority === 'high' ? priority : null;
}

function auditEvidenceKey(
	ref: Pick<ProjectAuditEvidenceRef, 'entity_type' | 'entity_id' | 'label'>
): string {
	return `${ref.entity_type}:${ref.entity_id ?? ref.label.toLowerCase()}`;
}

function buildCompleteAuditPacket(params: {
	ctx: LoopContext;
	recentActivity: AuditActivityRow[];
	triggerReason: string;
	auditMemory?: AuditMemory;
}): {
	deliveryConfidence: ProjectAuditDeliveryConfidence;
	projectThesis: string | null;
	summary: string;
	topFindings: Record<string, unknown>[];
	topActions: Record<string, unknown>[];
	changeSummary: Record<string, unknown>;
	dimensions: ProjectAuditDimension[];
	risks: Record<string, unknown>[];
	openQuestions: Record<string, unknown>[];
	evidenceRefs: ReturnType<typeof auditEvidenceRef>[];
	recommendations: ProjectAuditRecommendation[];
} {
	const { ctx, recentActivity } = params;
	const metrics = computeAuditMetrics(ctx, recentActivity);
	const projectEvidence = [
		auditEvidenceRef({
			entity_type: 'project',
			entity_id: ctx.projectId,
			label: ctx.projectName,
			reason: 'Project record'
		})
	];
	const goalEvidence = ctx.goals.slice(0, 3).map((goal) =>
		auditEvidenceRef({
			entity_type: 'goal',
			label: goal.name,
			reason: goal.description ?? 'Project goal'
		})
	);
	const docEvidence = ctx.documents.slice(0, 5).map((doc) =>
		auditEvidenceRef({
			entity_type: 'document',
			entity_id: doc.id,
			label: doc.title,
			reason: doc.state_key ? `Document state: ${doc.state_key}` : 'Project document',
			updated_at: doc.updated_at
		})
	);
	const taskEvidence = ctx.tasks.slice(0, 5).map((task) =>
		auditEvidenceRef({
			entity_type: 'task',
			entity_id: task.id,
			label: task.title,
			reason: task.state_key ? `Task state: ${task.state_key}` : 'Project task',
			updated_at: task.updated_at
		})
	);

	const dimensions: ProjectAuditDimension[] = [
		dimension({
			key: 'intent_clarity',
			name: 'Intent clarity',
			rating: ctx.goals.length || ctx.projectDescription ? 'green' : 'yellow',
			summary:
				ctx.goals.length || ctx.projectDescription
					? 'The project has a stated goal or description to anchor review.'
					: 'The project needs a clearer stated goal before a high-confidence audit.',
			evidence_refs: [...projectEvidence, ...goalEvidence].slice(0, 4),
			recommendations:
				ctx.goals.length || ctx.projectDescription
					? []
					: ['Add a short project thesis or primary goal.']
		}),
		dimension({
			key: 'documentation_quality',
			name: 'Documentation quality',
			rating:
				metrics.documentCount >= 5
					? 'green'
					: metrics.documentCount > 0
						? 'yellow'
						: 'unknown',
			summary:
				metrics.documentCount >= 5
					? 'The project has enough active documents for a collaborator to inspect.'
					: metrics.documentCount > 0
						? 'The project has some documentation, but the document set is still thin.'
						: 'No project documents were available in the audit context.',
			evidence_refs: docEvidence,
			recommendations:
				metrics.documentCount >= 5 ? [] : ['Expand or consolidate project documentation.']
		}),
		dimension({
			key: 'plan_integrity',
			name: 'Plan integrity',
			rating:
				metrics.goalCount > 0 && metrics.taskCount > 0
					? 'green'
					: metrics.goalCount > 0 || metrics.taskCount > 0
						? 'yellow'
						: 'unknown',
			summary:
				metrics.goalCount > 0 && metrics.taskCount > 0
					? 'Goals and tasks are both present, so the plan has checkable structure.'
					: 'The audit needs both goals and task-level work to verify plan integrity.',
			evidence_refs: [...goalEvidence, ...taskEvidence].slice(0, 6),
			recommendations:
				metrics.goalCount > 0 && metrics.taskCount > 0
					? []
					: ['Connect the project goal to concrete tasks or milestones.']
		}),
		dimension({
			key: 'execution_health',
			name: 'Execution health',
			rating:
				metrics.blockedTaskCount >= 3
					? 'red'
					: metrics.openTaskCount > 0
						? 'green'
						: metrics.taskCount > 0
							? 'yellow'
							: 'unknown',
			summary:
				metrics.blockedTaskCount >= 3
					? `${metrics.blockedTaskCount} open tasks appear blocked.`
					: metrics.openTaskCount > 0
						? `${metrics.openTaskCount} open tasks are available for execution.`
						: 'No active task flow was visible in the audit context.',
			evidence_refs: taskEvidence,
			recommendations:
				metrics.blockedTaskCount >= 3
					? ['Resolve or re-scope blocked tasks before adding more work.']
					: metrics.openTaskCount > 0
						? []
						: ['Create or refresh the next execution tasks.']
		}),
		dimension({
			key: 'drift_scope_control',
			name: 'Drift and scope control',
			rating: metrics.recentActivityCount >= 20 ? 'yellow' : 'green',
			summary:
				metrics.recentActivityCount >= 20
					? 'Recent project activity is high enough that scope drift should be checked explicitly.'
					: 'Recent activity volume does not indicate obvious scope churn.',
			evidence_refs: recentActivity.slice(0, 5).map((row) =>
				auditEvidenceRef({
					entity_type: 'project_log',
					entity_id: row.entity_id,
					label: `${row.entity_type ?? 'entity'} ${row.action ?? 'changed'}`,
					reason: row.created_at ?? undefined
				})
			),
			recommendations:
				metrics.recentActivityCount >= 20
					? ['Review recent changes against the current project thesis.']
					: []
		}),
		dimension({
			key: 'risk_decision_quality',
			name: 'Risk and decision quality',
			rating: 'unknown',
			summary:
				'The basic audit packet does not yet load a dedicated risk and decision register.',
			evidence_refs: projectEvidence,
			uncertainty:
				'The next audit generation stage should include risks, decisions, and blockers explicitly.',
			recommendations: ['Add explicit risks, blockers, or decision points where they exist.']
		}),
		dimension({
			key: 'dependency_readiness',
			name: 'Dependency readiness',
			rating: 'unknown',
			summary:
				'The basic audit packet cannot yet verify stakeholders, handoffs, and calendar commitments.',
			evidence_refs: projectEvidence,
			uncertainty:
				'Calendar and dependency context should be added to the complete audit snapshot loader.',
			recommendations: ['Make external dependencies or handoffs visible in the project.']
		}),
		dimension({
			key: 'evidence_freshness',
			name: 'Evidence freshness',
			rating:
				metrics.staleDocumentCount === 0
					? 'green'
					: metrics.staleDocumentCount >= Math.max(3, metrics.documentCount / 2)
						? 'yellow'
						: 'green',
			summary:
				metrics.staleDocumentCount === 0
					? 'Visible documents appear recently touched or newly created.'
					: `${metrics.staleDocumentCount} documents look stale based on updated_at timestamps.`,
			evidence_refs: docEvidence,
			recommendations:
				metrics.staleDocumentCount === 0
					? []
					: ['Refresh stale core documents or mark them intentionally archival.']
		})
	];

	const suppressedRecommendationKeys = new Set(
		(params.auditMemory?.priorRecommendationDecisions ?? [])
			.map((decision) => recommendationMemoryKey(decision.title))
			.filter((key): key is string => Boolean(key))
	);
	const suppressedRecommendations: string[] = [];
	const memoryAdjustedDimensions = dimensions.map((item): ProjectAuditDimension => {
		const recommendations = item.recommendations ?? [];
		if (!recommendations.length) return item;
		const kept = recommendations.filter((recommendation) => {
			const key = recommendationMemoryKey(recommendation);
			if (key && suppressedRecommendationKeys.has(key)) {
				suppressedRecommendations.push(recommendation);
				return false;
			}
			return true;
		});
		if (kept.length === recommendations.length) return item;
		return kept.length
			? { ...item, recommendations: kept }
			: withoutDimensionRecommendations(item);
	});

	const nonGreen = memoryAdjustedDimensions.filter((item) => item.rating !== 'green');
	const redCount = memoryAdjustedDimensions.filter((item) => item.rating === 'red').length;
	const yellowCount = memoryAdjustedDimensions.filter((item) => item.rating === 'yellow').length;
	const unknownCount = memoryAdjustedDimensions.filter(
		(item) => item.rating === 'unknown'
	).length;
	const deliveryConfidence: ProjectAuditDeliveryConfidence =
		redCount > 0 ? 'red' : yellowCount > 0 ? 'yellow' : unknownCount >= 3 ? 'unknown' : 'green';
	const projectThesis =
		compactAuditText(ctx.projectDescription, 500) ??
		(ctx.goals[0]
			? compactAuditText(`${ctx.goals[0].name}: ${ctx.goals[0].description ?? ''}`, 500)
			: null);
	const topFindings = nonGreen.slice(0, 5).map((item) => ({
		dimension: item.key,
		rating: item.rating,
		title: item.name,
		summary: item.summary
	}));
	const recommendations = nonGreen.flatMap((item) =>
		(item.recommendations ?? []).slice(0, 2).map((recommendation) => {
			const priority: NonNullable<ProjectAuditRecommendation['priority']> =
				item.rating === 'red' ? 'high' : item.rating === 'yellow' ? 'medium' : 'low';
			return {
				title: recommendation,
				summary: item.summary,
				priority,
				role: auditRecommendationRole(item.key, priority),
				evidence_refs: item.evidence_refs.slice(0, 4),
				dimension: item.key
			};
		})
	);
	const topActions = recommendations.slice(0, 5);
	const summary =
		nonGreen.length > 0
			? `Complete audit generated ${nonGreen.length} non-green dimension${nonGreen.length === 1 ? '' : 's'} for ${ctx.projectName}.`
			: `Complete audit found no immediate non-green dimensions for ${ctx.projectName}.`;

	return {
		deliveryConfidence,
		projectThesis,
		summary,
		topFindings,
		topActions,
		changeSummary: {
			trigger_reason: params.triggerReason,
			recent_activity_count: metrics.recentActivityCount,
			recent_activity_window_days: COMPLETE_AUDIT_ACTIVITY_LOOKBACK_DAYS,
			document_count: metrics.documentCount,
			task_count: metrics.taskCount,
			goal_count: metrics.goalCount,
			prior_audit_count: params.auditMemory?.priorAudits.length ?? 0,
			prior_ready_audit_count:
				params.auditMemory?.priorAudits.filter((audit) => audit.status === 'ready')
					.length ?? 0,
			unresolved_audit_recommendation_count:
				params.auditMemory?.unresolvedAuditRecommendationCount ?? 0,
			open_inbox_count: params.auditMemory?.openInboxCount ?? 0,
			suppressed_recommendation_count: suppressedRecommendations.length,
			...(suppressedRecommendations.length
				? { suppressed_recommendations: suppressedRecommendations.slice(0, 8) }
				: {}),
			...(params.auditMemory?.priorAudits[0]?.summary
				? {
						previous_audit_summary: compactAuditText(
							params.auditMemory.priorAudits[0].summary,
							400
						)
					}
				: {})
		},
		dimensions: memoryAdjustedDimensions,
		risks: [],
		openQuestions: memoryAdjustedDimensions
			.filter((item) => item.rating === 'unknown')
			.map((item) => ({
				dimension: item.key,
				question: item.uncertainty ?? `More evidence needed for ${item.name}.`
			})),
		evidenceRefs: [...projectEvidence, ...goalEvidence, ...docEvidence, ...taskEvidence],
		recommendations
	};
}

function buildCompleteAuditEvidenceCatalog(params: {
	ctx: LoopContext;
	recentActivity: AuditActivityRow[];
	packet: CompleteAuditPacket;
}): ProjectAuditEvidenceRef[] {
	const refs: ProjectAuditEvidenceRef[] = [
		...params.packet.evidenceRefs,
		auditEvidenceRef({
			entity_type: 'project',
			entity_id: params.ctx.projectId,
			label: params.ctx.projectName,
			reason: 'Project record'
		}),
		...params.ctx.goals.slice(0, 10).map((goal) =>
			auditEvidenceRef({
				entity_type: 'goal',
				label: goal.name,
				reason: goal.description ?? 'Project goal'
			})
		),
		...params.ctx.documents.slice(0, MAX_PROJECT_LOOP_CONTEXT_DOCUMENTS).map((doc) =>
			auditEvidenceRef({
				entity_type: 'document',
				entity_id: doc.id,
				label: doc.title,
				reason: doc.state_key ? `Document state: ${doc.state_key}` : 'Project document',
				updated_at: doc.updated_at
			})
		),
		...params.ctx.tasks.slice(0, 30).map((task) =>
			auditEvidenceRef({
				entity_type: 'task',
				entity_id: task.id,
				label: task.title,
				reason: task.state_key ? `Task state: ${task.state_key}` : 'Project task',
				updated_at: task.updated_at
			})
		),
		...params.recentActivity.slice(0, 30).map((row) =>
			auditEvidenceRef({
				entity_type: 'project_log',
				entity_id: row.entity_id,
				label: `${row.entity_type ?? 'entity'} ${row.action ?? 'changed'}`,
				reason: row.created_at ?? undefined
			})
		)
	];

	const seen = new Set<string>();
	return refs.filter((ref) => {
		const key = auditEvidenceKey(ref);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function describeAuditEvidenceCatalog(catalog: ProjectAuditEvidenceRef[]): string {
	if (!catalog.length) return '(none)';
	return catalog
		.slice(0, 90)
		.map((ref, index) => {
			const id = ref.entity_id ? ` id=${ref.entity_id}` : '';
			const reason = ref.reason ? ` — ${compactAuditText(ref.reason, 120)}` : '';
			const updated = ref.updated_at ? ` updated=${ref.updated_at}` : '';
			return `${index + 1}. ${ref.entity_type}${id}: "${ref.label}"${updated}${reason}`;
		})
		.join('\n');
}

function describeAuditScaffold(packet: CompleteAuditPacket): string {
	return JSON.stringify(
		{
			delivery_confidence: packet.deliveryConfidence,
			project_thesis: packet.projectThesis,
			summary: packet.summary,
			dimensions: packet.dimensions.map((dimension) => ({
				key: dimension.key,
				rating: dimension.rating,
				summary: dimension.summary,
				recommendations: dimension.recommendations ?? []
			})),
			top_findings: packet.topFindings,
			recommendations: packet.recommendations.map((recommendation) => ({
				title: recommendation.title,
				priority: recommendation.priority,
				dimension: recommendation.dimension
			})),
			open_questions: packet.openQuestions
		},
		null,
		2
	);
}

function sanitizeAuditEvidenceRefs(
	value: unknown,
	catalog: ProjectAuditEvidenceRef[]
): ProjectAuditEvidenceRef[] {
	const byId = new Map<string, ProjectAuditEvidenceRef>();
	const byLabel = new Map<string, ProjectAuditEvidenceRef>();
	for (const ref of catalog) {
		if (ref.entity_id) byId.set(`${ref.entity_type}:${ref.entity_id}`, ref);
		byLabel.set(`${ref.entity_type}:${ref.label.toLowerCase()}`, ref);
	}

	const refs: ProjectAuditEvidenceRef[] = [];
	const seen = new Set<string>();
	for (const raw of asUnknownArray(value)) {
		const record = asRecord(raw) as RawAuditEvidenceRef | null;
		if (!record) continue;
		const entityType = asString(record.entity_type);
		if (!entityType) continue;
		const entityId = asString(record.entity_id);
		const label = asString(record.label) ?? asString(record.title);
		const match =
			(entityId ? byId.get(`${entityType}:${entityId}`) : null) ??
			(label ? byLabel.get(`${entityType}:${label.toLowerCase()}`) : null);
		if (!match) continue;
		const key = auditEvidenceKey(match);
		if (seen.has(key)) continue;
		seen.add(key);
		refs.push({
			...match,
			...(asString(record.reason) ? { reason: asString(record.reason) as string } : {}),
			...(asString(record.excerpt) ? { excerpt: asString(record.excerpt) as string } : {})
		});
	}
	return refs.slice(0, 6);
}

function sanitizeAuditFindings(
	value: unknown,
	catalog: ProjectAuditEvidenceRef[]
): Record<string, unknown>[] {
	return asUnknownArray(value)
		.map((raw): Record<string, unknown> | null => {
			const record = asRecord(raw) as RawAuditFinding | null;
			if (!record) return null;
			const title = compactAuditText(asString(record.title), 180);
			const summary = compactAuditText(asString(record.summary), 700);
			const evidenceRefs = sanitizeAuditEvidenceRefs(record.evidence_refs, catalog);
			if (!title || !summary || evidenceRefs.length === 0) return null;
			const dimension = asAuditDimensionKey(record.dimension);
			const rating = asAuditRating(record.rating);
			return {
				title,
				summary,
				...(dimension ? { dimension } : {}),
				...(rating ? { rating } : {}),
				evidence_refs: evidenceRefs
			};
		})
		.filter((item): item is Record<string, unknown> => Boolean(item))
		.slice(0, 8);
}

function sanitizeAuditDimensionUpdates(
	value: unknown,
	catalog: ProjectAuditEvidenceRef[]
): Map<ProjectAuditDimensionKey, Partial<ProjectAuditDimension>> {
	const updates = new Map<ProjectAuditDimensionKey, Partial<ProjectAuditDimension>>();
	for (const raw of asUnknownArray(value)) {
		const record = asRecord(raw) as RawAuditDimensionUpdate | null;
		if (!record) continue;
		const key = asAuditDimensionKey(record.key);
		const summary = compactAuditText(asString(record.summary), 900);
		const evidenceRefs = sanitizeAuditEvidenceRefs(record.evidence_refs, catalog);
		if (!key || !summary || evidenceRefs.length === 0) continue;
		const recommendations = asUnknownArray(record.recommendations)
			.map((item) => compactAuditText(asString(item), 180))
			.filter((item): item is string => Boolean(item))
			.slice(0, 4);
		updates.set(key, {
			summary,
			evidence_refs: evidenceRefs,
			...(asAuditRating(record.rating) ? { rating: asAuditRating(record.rating)! } : {}),
			...(compactAuditText(asString(record.uncertainty), 400)
				? { uncertainty: compactAuditText(asString(record.uncertainty), 400) }
				: {}),
			...(recommendations.length ? { recommendations } : {})
		});
	}
	return updates;
}

function sanitizeAuditRisks(
	value: unknown,
	catalog: ProjectAuditEvidenceRef[]
): Record<string, unknown>[] {
	return asUnknownArray(value)
		.map((raw): Record<string, unknown> | null => {
			const record = asRecord(raw) as RawAuditRisk | null;
			if (!record) return null;
			const title = compactAuditText(asString(record.title), 180);
			const summary = compactAuditText(asString(record.summary), 700);
			const evidenceRefs = sanitizeAuditEvidenceRefs(record.evidence_refs, catalog);
			if (!title || !summary || evidenceRefs.length === 0) return null;
			const severity = asString(record.severity);
			const dimension = asAuditDimensionKey(record.dimension);
			return {
				title,
				summary,
				severity:
					severity === 'low' || severity === 'medium' || severity === 'high'
						? severity
						: 'unknown',
				...(dimension ? { dimension } : {}),
				evidence_refs: evidenceRefs
			};
		})
		.filter((item): item is Record<string, unknown> => Boolean(item))
		.slice(0, 8);
}

function sanitizeAuditOpenQuestions(
	value: unknown,
	catalog: ProjectAuditEvidenceRef[]
): Record<string, unknown>[] {
	return asUnknownArray(value)
		.map((raw): Record<string, unknown> | null => {
			const record = asRecord(raw) as RawAuditOpenQuestion | null;
			if (!record) return null;
			const question = compactAuditText(asString(record.question), 260);
			const evidenceRefs = sanitizeAuditEvidenceRefs(record.evidence_refs, catalog);
			if (!question || evidenceRefs.length === 0) return null;
			const dimension = asAuditDimensionKey(record.dimension);
			return {
				question,
				...(dimension ? { dimension } : {}),
				evidence_refs: evidenceRefs
			};
		})
		.filter((item): item is Record<string, unknown> => Boolean(item))
		.slice(0, 8);
}

function sanitizeAuditRecommendations(
	value: unknown,
	catalog: ProjectAuditEvidenceRef[]
): ProjectAuditRecommendation[] {
	return asUnknownArray(value)
		.map((raw): ProjectAuditRecommendation | null => {
			const record = asRecord(raw) as RawAuditRecommendation | null;
			if (!record) return null;
			const title = compactAuditText(asString(record.title), 180);
			const summary = compactAuditText(asString(record.summary), 700);
			const evidenceRefs = sanitizeAuditEvidenceRefs(record.evidence_refs, catalog);
			if (!title || !summary || evidenceRefs.length === 0) return null;
			return {
				title,
				summary,
				evidence_refs: evidenceRefs,
				...(asRecommendationRole(record.role)
					? { role: asRecommendationRole(record.role)! }
					: {}),
				...(asRecommendationPriority(record.priority)
					? { priority: asRecommendationPriority(record.priority)! }
					: {}),
				...(asAuditDimensionKey(record.dimension)
					? { dimension: asAuditDimensionKey(record.dimension)! }
					: {}),
				...(asString(record.target_entity_type)
					? { target_entity_type: asString(record.target_entity_type)! }
					: {}),
				...(asString(record.target_entity_id)
					? { target_entity_id: asString(record.target_entity_id)! }
					: {})
			};
		})
		.filter((item): item is ProjectAuditRecommendation => Boolean(item))
		.slice(0, 12);
}

function mergeAuditRecommendations(
	synthesized: ProjectAuditRecommendation[],
	deterministic: ProjectAuditRecommendation[]
): ProjectAuditRecommendation[] {
	const seen = new Set<string>();
	const merged: ProjectAuditRecommendation[] = [];
	for (const recommendation of [...synthesized, ...deterministic]) {
		const key = recommendationMemoryKey(recommendation.title);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		merged.push(recommendation);
		if (merged.length >= 12) break;
	}
	return merged;
}

export function applyCompleteAuditSynthesis(
	packet: CompleteAuditPacket,
	rawAudit: RawAuditSynthesisEnvelope['audit'],
	evidenceCatalog: ProjectAuditEvidenceRef[]
): CompleteAuditPacket {
	const audit = asRecord(rawAudit);
	if (!audit) return packet;

	const dimensionUpdates = sanitizeAuditDimensionUpdates(
		audit.dimension_updates,
		evidenceCatalog
	);
	const dimensions = packet.dimensions.map((dimensionItem) => {
		const update = dimensionUpdates.get(dimensionItem.key);
		return update ? { ...dimensionItem, ...update } : dimensionItem;
	});

	const topFindings = sanitizeAuditFindings(audit.top_findings, evidenceCatalog);
	const risks = sanitizeAuditRisks(audit.risks, evidenceCatalog);
	const openQuestions = sanitizeAuditOpenQuestions(audit.open_questions, evidenceCatalog);
	const recommendations = sanitizeAuditRecommendations(audit.recommendations, evidenceCatalog);
	const summary = compactAuditText(asString(audit.summary), 1000);
	const projectThesis = compactAuditText(asString(audit.project_thesis), 700);
	const deliveryConfidence = asDeliveryConfidence(audit.delivery_confidence);
	const synthesisCounts = {
		finding_count: topFindings.length,
		dimension_update_count: dimensionUpdates.size,
		risk_count: risks.length,
		open_question_count: openQuestions.length,
		recommendation_count: recommendations.length
	};
	const hasGroundedSynthesis =
		synthesisCounts.finding_count +
			synthesisCounts.dimension_update_count +
			synthesisCounts.risk_count +
			synthesisCounts.open_question_count +
			synthesisCounts.recommendation_count >
		0;
	if (!hasGroundedSynthesis) return packet;

	return {
		...packet,
		...(deliveryConfidence ? { deliveryConfidence } : {}),
		...(projectThesis ? { projectThesis } : {}),
		...(summary ? { summary } : {}),
		topFindings: topFindings.length ? topFindings : packet.topFindings,
		dimensions,
		risks,
		openQuestions: openQuestions.length ? openQuestions : packet.openQuestions,
		recommendations: mergeAuditRecommendations(recommendations, packet.recommendations),
		topActions: mergeAuditRecommendations(recommendations, packet.recommendations).slice(
			0,
			5
		) as unknown as Record<string, unknown>[],
		changeSummary: {
			...packet.changeSummary,
			synthesis_model: COMPLETE_AUDIT_SYNTHESIS_MODEL_USED,
			...synthesisCounts
		}
	};
}

async function synthesizeCompleteAuditPacket(params: {
	llm: SmartLLMService;
	ctx: LoopContext;
	recentActivity: AuditActivityRow[];
	packet: CompleteAuditPacket;
	userId: string;
	chatSessionId?: string | null;
	runId: string;
	auditId: string;
	onUsage: (event: UsageEvent) => Promise<void>;
}): Promise<AuditSynthesisResult> {
	let costUsd = 0;
	const onUsage = async (event: UsageEvent): Promise<void> => {
		costUsd += event.totalCost ?? 0;
		await params.onUsage(event);
	};
	const evidenceCatalog = buildCompleteAuditEvidenceCatalog({
		ctx: params.ctx,
		recentActivity: params.recentActivity,
		packet: params.packet
	});
	const systemPrompt = [
		'You are a BuildOS Complete Project Audit reviewer.',
		'Use only the evidence catalog provided. Do not invent entities, dates, blockers, or decisions.',
		'Every finding, dimension update, risk, open question, and recommendation MUST cite evidence_refs from the catalog.',
		'Focus on coherence: duplicated work, missing decisions, overloaded scope, stale evidence, blockers, and unclear dependencies.',
		'Do not create mutation operations. Recommendations should be review follow-ups, not direct writes.',
		'If evidence is insufficient, say so as an open question with the closest supporting evidence.',
		'',
		'Return ONLY JSON:',
		'{ "audit": {',
		'  "delivery_confidence": "green"|"yellow"|"red"|"unknown",',
		'  "project_thesis": string|null,',
		'  "summary": string,',
		'  "top_findings": [{"title": string, "summary": string, "dimension": string, "rating": "green"|"yellow"|"red"|"unknown", "evidence_refs": [{"entity_type": string, "entity_id": string|null, "label": string}]}],',
		'  "dimension_updates": [{"key": string, "rating": "green"|"yellow"|"red"|"unknown", "summary": string, "uncertainty": string|null, "recommendations": string[], "evidence_refs": [{"entity_type": string, "entity_id": string|null, "label": string}]}],',
		'  "risks": [{"title": string, "summary": string, "severity": "low"|"medium"|"high", "dimension": string, "evidence_refs": [{"entity_type": string, "entity_id": string|null, "label": string}]}],',
		'  "open_questions": [{"question": string, "dimension": string, "evidence_refs": [{"entity_type": string, "entity_id": string|null, "label": string}]}],',
		'  "recommendations": [{"title": string, "summary": string, "role": "recommended_action"|"risk_follow_up"|"cleanup"|"decision_point", "priority": "low"|"medium"|"high", "dimension": string, "target_entity_type": string|null, "target_entity_id": string|null, "evidence_refs": [{"entity_type": string, "entity_id": string|null, "label": string}]}]',
		'} }'
	].join('\n');
	const userPrompt = [
		`Project: ${params.ctx.projectName}`,
		`Description: ${params.ctx.projectDescription ?? '(none)'}`,
		'',
		'Deterministic audit scaffold:',
		describeAuditScaffold(params.packet),
		'',
		'Evidence catalog:',
		describeAuditEvidenceCatalog(evidenceCatalog),
		'',
		'Recent activity:',
		params.recentActivity.length
			? params.recentActivity
					.slice(0, 30)
					.map(
						(row) =>
							`- ${row.created_at ?? 'unknown'} ${row.entity_type ?? 'entity'}:${row.entity_id ?? 'unknown'} ${row.action ?? 'changed'}`
					)
					.join('\n')
			: '(none)'
	].join('\n');

	try {
		const raw = await params.llm.getJSONResponse<RawAuditSynthesisEnvelope>({
			systemPrompt,
			userPrompt,
			userId: params.userId,
			profile: 'balanced',
			validation: { retryOnParseError: true, maxRetries: 2 },
			operationType: 'project_audit_synthesis',
			projectId: params.ctx.projectId,
			chatSessionId: params.chatSessionId ?? undefined,
			metadata: {
				project_loop: true,
				project_audit: true,
				project_loop_run_id: params.runId,
				project_audit_id: params.auditId,
				project_loop_generator: 'project_audit_synthesis',
				onto_project_id: params.ctx.projectId
			},
			onUsage
		});
		return {
			packet: applyCompleteAuditSynthesis(params.packet, raw?.audit, evidenceCatalog),
			modelUsed: COMPLETE_AUDIT_SYNTHESIS_MODEL_USED,
			costUsd
		};
	} catch (error) {
		return {
			packet: params.packet,
			modelUsed: COMPLETE_AUDIT_DETERMINISTIC_MODEL_USED,
			costUsd,
			warning: error instanceof Error ? error.message : 'Complete audit LLM synthesis failed'
		};
	}
}

function buildAuditChildSuggestionDrafts(params: {
	auditId: string;
	runId: string;
	projectId: string;
	packet: CompleteAuditPacket;
}): AuditChildSuggestionDraft[] {
	const fallbackEvidence = params.packet.evidenceRefs
		.slice(0, 4)
		.map(auditEvidenceToSuggestionEvidence);
	const seenTitles = new Set<string>();

	return params.packet.recommendations
		.slice(0, MAX_AUDIT_CHILD_SUGGESTIONS)
		.map((recommendation, index): AuditChildSuggestionDraft | null => {
			const title = compactAuditText(recommendation.title, 200);
			if (!title) return null;
			const titleKey = title.toLowerCase();
			if (seenTitles.has(titleKey)) return null;
			seenTitles.add(titleKey);

			const role =
				recommendation.role ??
				auditRecommendationRole(recommendation.dimension, recommendation.priority);
			const evidenceRefs = recommendation.evidence_refs?.length
				? recommendation.evidence_refs.map(auditEvidenceToSuggestionEvidence)
				: fallbackEvidence;
			const summary =
				compactAuditText(recommendation.summary, 600) ??
				'This follow-up came from the latest complete project audit.';

			return {
				role,
				row: {
					run_id: params.runId,
					project_id: params.projectId,
					kind: 'audit_recommendation',
					risk_tier: recommendationRiskTier(recommendation),
					title,
					rationale: summary,
					why_now: `Complete audit follow-up${recommendation.dimension ? ` for ${recommendation.dimension}` : ''}.`,
					confidence:
						recommendation.priority === 'high'
							? 0.78
							: recommendation.priority === 'medium'
								? 0.68
								: 0.58,
					evidence_refs: evidenceRefs as unknown as Json,
					preview: {
						kind: 'generic',
						summary,
						impact: 'Review this audit recommendation and decide whether it needs project work.'
					} as unknown as Json,
					operations: [] as unknown as Json,
					freshness_state: 'fresh',
					reversible: false,
					undo_operations: [] as unknown as Json,
					source_fingerprint: null,
					status: 'pending',
					sort_order: index
				}
			};
		})
		.filter((draft): draft is AuditChildSuggestionDraft => Boolean(draft));
}

async function createAuditChildSuggestions(params: {
	auditId: string;
	runId: string;
	projectId: string;
	packet: CompleteAuditPacket;
}): Promise<AuditChildSuggestionResult> {
	const drafts = buildAuditChildSuggestionDrafts(params);
	if (!drafts.length) return { generatedCount: 0, unresolvedCount: 0 };

	const { data: insertedSuggestions, error: insertError } = await supabase
		.from('project_suggestions')
		.insert(drafts.map((draft) => draft.row))
		.select('*');
	if (insertError) {
		throw new Error(`Failed to insert audit child suggestions: ${insertError.message}`);
	}

	const suggestions = insertedSuggestions ?? [];
	if (!suggestions.length) return { generatedCount: 0, unresolvedCount: 0 };

	const linkRows = suggestions.map((suggestion, index) => ({
		audit_id: params.auditId,
		suggestion_id: suggestion.id,
		role: drafts[index]?.role ?? 'recommended_action'
	}));
	const { error: linkError } = await supabase.from('project_audit_suggestions').insert(linkRows);
	if (linkError) {
		const failedResult = {
			ok: false,
			applied_operations: 0,
			errors: [{ tool: 'project_audit_suggestions', error: linkError.message }]
		};
		await supabase
			.from('project_suggestions')
			.update({
				status: 'failed',
				result: failedResult as unknown as Json
			})
			.in(
				'id',
				suggestions.map((suggestion) => suggestion.id)
			);
		throw new Error(`Failed to link audit child suggestions: ${linkError.message}`);
	}

	return {
		generatedCount: suggestions.length,
		unresolvedCount: suggestions.filter((suggestion) =>
			['pending', 'delegated', 'failed'].includes(String(suggestion.status ?? 'pending'))
		).length
	};
}

async function supersedeOlderReadyAudits(params: {
	projectId: string;
	auditId: string;
	now: string;
}): Promise<{ supersededAuditCount: number; supersededSuggestionCount: number }> {
	const { data: oldAudits, error: oldAuditsError } = await supabase
		.from('project_audits')
		.select('id')
		.eq('project_id', params.projectId)
		.neq('id', params.auditId)
		.eq('status', 'ready');
	if (oldAuditsError) {
		console.warn(
			`[ProjectAudits] Failed to load older ready audits for ${params.projectId}:`,
			oldAuditsError.message
		);
		return { supersededAuditCount: 0, supersededSuggestionCount: 0 };
	}

	const oldAuditIds = ((oldAudits ?? []) as Record<string, unknown>[])
		.map((audit) => asString(audit.id))
		.filter((id): id is string => Boolean(id));
	if (!oldAuditIds.length) return { supersededAuditCount: 0, supersededSuggestionCount: 0 };

	const { error: auditUpdateError } = await supabase
		.from('project_audits')
		.update({
			status: 'superseded',
			superseded_by: params.auditId,
			unresolved_suggestion_count: 0
		})
		.in('id', oldAuditIds);
	if (auditUpdateError) {
		console.warn(
			`[ProjectAudits] Failed to supersede older audits for ${params.projectId}:`,
			auditUpdateError.message
		);
		return { supersededAuditCount: 0, supersededSuggestionCount: 0 };
	}

	for (const oldAuditId of oldAuditIds) {
		try {
			await syncInboxItemForProjectAudit({
				supabase: supabase as any,
				auditId: oldAuditId
			});
			await expireInboxItemsForProjectAuditChildSuggestions({
				supabase: supabase as any,
				auditId: oldAuditId,
				reason: 'Grouped into a superseded complete project audit packet'
			});
		} catch (syncError) {
			console.warn(
				`⚠️ Failed to sync AI Inbox item for superseded audit ${oldAuditId}:`,
				syncError instanceof Error ? syncError.message : syncError
			);
		}
	}

	const { data: links, error: linksError } = await supabase
		.from('project_audit_suggestions')
		.select('suggestion_id')
		.in('audit_id', oldAuditIds);
	if (linksError) {
		console.warn(
			`[ProjectAudits] Failed to load child suggestions for superseded audits:`,
			linksError.message
		);
		return { supersededAuditCount: oldAuditIds.length, supersededSuggestionCount: 0 };
	}

	const suggestionIds = Array.from(
		new Set(
			((links ?? []) as Record<string, unknown>[])
				.map((link) => asString(link.suggestion_id))
				.filter((id): id is string => Boolean(id))
		)
	);
	if (!suggestionIds.length) {
		return { supersededAuditCount: oldAuditIds.length, supersededSuggestionCount: 0 };
	}

	const result = {
		ok: false,
		applied_operations: 0,
		errors: [
			{
				tool: 'project_audit_supersede',
				error: 'Superseded by a newer complete project audit.'
			}
		]
	};
	const { data: updatedSuggestions, error: suggestionUpdateError } = await supabase
		.from('project_suggestions')
		.update({
			status: 'superseded',
			decided_at: params.now,
			result: result as unknown as Json
		})
		.in('id', suggestionIds)
		.eq('status', 'pending')
		.select('*');
	if (suggestionUpdateError) {
		console.warn(
			`[ProjectAudits] Failed to supersede child suggestions for older audits:`,
			suggestionUpdateError.message
		);
		return { supersededAuditCount: oldAuditIds.length, supersededSuggestionCount: 0 };
	}

	for (const suggestion of updatedSuggestions ?? []) {
		try {
			await syncInboxItemForProjectSuggestion({
				supabase: supabase as any,
				suggestion: suggestion as unknown as Record<string, unknown>
			});
		} catch (syncError) {
			console.warn(
				`⚠️ Failed to sync AI Inbox item for superseded audit suggestion ${suggestion.id}:`,
				syncError instanceof Error ? syncError.message : syncError
			);
		}
	}

	return {
		supersededAuditCount: oldAuditIds.length,
		supersededSuggestionCount: (updatedSuggestions ?? []).length
	};
}

async function processCompleteProjectAuditJob(
	job: ProcessingJob<ProjectLoopJobMetadata>
): Promise<{ success: boolean; runId?: string; auditId?: string; skipped?: boolean }> {
	const { runId, projectId, auditId, triggerReason } = job.data;
	if (!runId || !projectId || !auditId) {
		throw new Error('runId, projectId, and auditId are required for complete audit jobs');
	}

	await job.log(`Complete project audit started for project ${projectId} (audit ${auditId})`);

	try {
		const claimStartedAt = nowIso();
		const { data: claimedAudit, error: claimAuditError } = await supabase
			.from('project_audits')
			.update({ status: 'running', started_at: claimStartedAt })
			.eq('id', auditId)
			.eq('loop_run_id', runId)
			.eq('status', 'queued')
			.select('id')
			.maybeSingle();
		if (claimAuditError) {
			throw new Error(`Failed to claim project audit: ${claimAuditError.message}`);
		}
		if (!claimedAudit) {
			const message = `Project audit ${auditId} was not queued for run ${runId}; skipping duplicate execution.`;
			await job.log(message);
			await failQueuedRun(runId, message);
			return { success: true, runId, auditId, skipped: true };
		}

		const { data: claimedRun, error: claimRunError } = await supabase
			.from('project_loop_runs')
			.update({ status: 'running', started_at: claimStartedAt })
			.eq('id', runId)
			.eq('status', 'queued')
			.select('*')
			.maybeSingle();
		if (claimRunError) {
			throw new Error(`Failed to claim audit loop run: ${claimRunError.message}`);
		}
		if (!claimedRun) {
			const message = `Project audit ${auditId} was claimed but loop run ${runId} was not queued; failing inconsistent audit/run state.`;
			await job.log(message);
			await failCompleteAuditState({
				runId,
				auditId,
				message,
				runStatuses: ['queued', 'running'],
				auditStatuses: ['running']
			});
			return { success: true, runId, auditId, skipped: true };
		}
		const auditRun = claimedRun as Record<string, unknown>;
		const auditUserId = asString(auditRun.user_id) ?? asString(job.data.userId);
		const auditChatSessionId = asString(auditRun.chat_session_id);

		await job.updateProgress({ current: 1, total: 6, message: 'Loading audit context' });
		const ctx = await loadLoopContext(projectId);
		if (!ctx) {
			const message = 'Project inactive or archived; complete audit skipped.';
			const now = nowIso();
			await Promise.all([
				supabase
					.from('project_audits')
					.update({ status: 'failed', error_message: message, finished_at: now })
					.eq('id', auditId),
				supabase
					.from('project_loop_runs')
					.update({ status: 'failed', error_message: message, finished_at: now })
					.eq('id', runId)
			]);
			return { success: true, runId, auditId, skipped: true };
		}
		await job.updateProgress({ current: 2, total: 6, message: 'Computing audit metrics' });
		const [recentActivity, auditMemory] = await Promise.all([
			loadAuditRecentActivity(projectId),
			loadAuditMemory(projectId)
		]);

		await job.updateProgress({ current: 3, total: 6, message: 'Building audit packet' });
		const deterministicPacket = buildCompleteAuditPacket({
			ctx,
			recentActivity,
			triggerReason,
			auditMemory
		});
		let synthesisResult: AuditSynthesisResult = {
			packet: deterministicPacket,
			modelUsed: COMPLETE_AUDIT_DETERMINISTIC_MODEL_USED,
			costUsd: 0
		};
		if (auditUserId) {
			await job.updateProgress({ current: 4, total: 6, message: 'Synthesizing audit' });
			const llm = new SmartLLMService({
				supabase,
				appName: 'BuildOS Complete Project Audit Worker'
			});
			synthesisResult = await synthesizeCompleteAuditPacket({
				llm,
				ctx,
				recentActivity,
				packet: deterministicPacket,
				userId: auditUserId,
				chatSessionId: auditChatSessionId,
				runId,
				auditId,
				onUsage: async () => undefined
			});
			if (synthesisResult.warning) {
				await job.log(
					`Complete audit LLM synthesis failed; using deterministic packet: ${synthesisResult.warning}`
				);
				console.warn(
					`[ProjectAudits] Complete audit ${auditId} synthesis failed:`,
					synthesisResult.warning
				);
			}
			if (synthesisResult.costUsd > COMPLETE_AUDIT_SYNTHESIS_COST_CAP_USD) {
				await job.log(
					`Complete audit synthesis cost $${synthesisResult.costUsd.toFixed(4)} exceeded the soft cap $${COMPLETE_AUDIT_SYNTHESIS_COST_CAP_USD.toFixed(2)}.`
				);
			}
		} else {
			await job.log('Complete audit synthesis skipped: missing audit user id.');
		}
		const packet = synthesisResult.packet;

		await job.updateProgress({ current: 5, total: 6, message: 'Creating audit follow-ups' });
		let childSuggestions: AuditChildSuggestionResult = {
			generatedCount: 0,
			unresolvedCount: 0
		};
		try {
			childSuggestions = await createAuditChildSuggestions({
				auditId,
				runId,
				projectId,
				packet
			});
		} catch (error) {
			const warning =
				error instanceof Error
					? error.message
					: 'Failed to create audit follow-up suggestions';
			childSuggestions = { generatedCount: 0, unresolvedCount: 0, warning };
			await job.log(`Complete audit follow-up creation failed: ${warning}`);
			console.warn(
				`[ProjectAudits] Complete audit ${auditId} follow-up creation failed:`,
				warning
			);
		}

		await job.updateProgress({ current: 6, total: 6, message: 'Persisting audit packet' });
		const now = nowIso();
		const changeSummary = {
			...packet.changeSummary,
			...(synthesisResult.warning ? { synthesis_warning: synthesisResult.warning } : {}),
			...(childSuggestions.warning
				? { child_suggestion_warning: childSuggestions.warning }
				: {})
		};
		const { error: auditUpdateError } = await supabase
			.from('project_audits')
			.update({
				status: 'ready',
				delivery_confidence: packet.deliveryConfidence,
				project_thesis: packet.projectThesis,
				summary: packet.summary,
				top_findings: packet.topFindings as unknown as Json,
				top_actions: packet.topActions as unknown as Json,
				change_summary: changeSummary as Json,
				dimensions: packet.dimensions as unknown as Json,
				risks: packet.risks as unknown as Json,
				open_questions: packet.openQuestions as unknown as Json,
				evidence_refs: packet.evidenceRefs as unknown as Json,
				recommendations: packet.recommendations as unknown as Json,
				generated_suggestion_count: childSuggestions.generatedCount,
				unresolved_suggestion_count: childSuggestions.unresolvedCount,
				model_used: synthesisResult.modelUsed,
				cost_usd: synthesisResult.costUsd || 0,
				finished_at: now
			})
			.eq('id', auditId);
		if (auditUpdateError) {
			throw new Error(`Failed to persist project audit: ${auditUpdateError.message}`);
		}

		try {
			await syncInboxItemForProjectAudit({
				supabase: supabase as any,
				auditId
			});
			await expireInboxItemsForProjectAuditChildSuggestions({
				supabase: supabase as any,
				auditId
			});
		} catch (syncError) {
			console.warn(
				`⚠️ Failed to sync AI Inbox item for project audit ${auditId}:`,
				syncError instanceof Error ? syncError.message : syncError
			);
		}

		const superseded = await supersedeOlderReadyAudits({
			projectId,
			auditId,
			now
		});
		if (superseded.supersededAuditCount > 0) {
			await job.log(
				`Superseded ${superseded.supersededAuditCount} older ready audit${superseded.supersededAuditCount === 1 ? '' : 's'} and ${superseded.supersededSuggestionCount} pending follow-up${superseded.supersededSuggestionCount === 1 ? '' : 's'}.`
			);
		}

		const { error: runUpdateError } = await supabase
			.from('project_loop_runs')
			.update({
				status: 'completed',
				summary: packet.summary,
				suggestion_count: childSuggestions.generatedCount,
				cost_usd: synthesisResult.costUsd || 0,
				finished_at: now
			})
			.eq('id', runId);
		if (runUpdateError) {
			throw new Error(`Failed to complete audit loop run: ${runUpdateError.message}`);
		}

		if (auditUserId) {
			const changeSummaryRecord = changeSummary as Record<string, unknown>;
			captureWorkerEvent(auditUserId, 'project_audit_ready', {
				project_id: projectId,
				audit_id: auditId,
				run_id: runId,
				trigger_reason: triggerReason,
				audit_depth: job.data.auditDepth ?? 'standard',
				delivery_confidence: packet.deliveryConfidence,
				generated_suggestion_count: childSuggestions.generatedCount,
				unresolved_suggestion_count: childSuggestions.unresolvedCount,
				suppressed_recommendation_count:
					typeof changeSummaryRecord.suppressed_recommendation_count === 'number'
						? changeSummaryRecord.suppressed_recommendation_count
						: 0,
				superseded_audit_count: superseded.supersededAuditCount,
				superseded_suggestion_count: superseded.supersededSuggestionCount,
				model_used: synthesisResult.modelUsed,
				cost_usd: synthesisResult.costUsd
			});
		}

		await job.log(`Complete project audit ${auditId} is ready.`);
		return { success: true, runId, auditId };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Complete project audit failed';
		await failCompleteAuditState({ runId, auditId, message });
		await supersedePendingSuggestionsForFailedRun({ runId, message });
		throw error;
	}
}

export async function processProjectLoopJob(job: ProcessingJob<ProjectLoopJobMetadata>): Promise<{
	success: boolean;
	runId?: string;
	auditId?: string;
	suggestionCount?: number;
	skipped?: boolean;
}> {
	const { runId, projectId } = job.data;

	if (!PROJECT_LOOPS_ENABLED) {
		await job.log('Project loops disabled (ENABLE_PROJECT_LOOPS); skipping.');
		if (runId) await failRun(runId, 'feature_disabled');
		return { success: true, skipped: true };
	}

	if (job.data.mode === 'complete_audit_trigger_evaluation') {
		const { userId, triggerReason, auditDepth } = job.data;
		if (!projectId || !userId || !triggerReason) {
			throw new Error(
				'projectId, userId, and triggerReason are required for audit trigger jobs'
			);
		}
		if (!isProjectAuditTriggerReason(triggerReason)) {
			throw new Error(`Unsupported complete audit trigger reason: ${triggerReason}`);
		}
		const result = await processProjectAuditTriggerEvaluationJob({
			projectId,
			userId,
			triggerReason,
			auditDepth
		});
		await job.log(
			result.queued
				? `Complete audit queued after delayed ${triggerReason} trigger evaluation.`
				: `Complete audit trigger evaluation finished without queueing: ${result.reason ?? result.decision ?? 'no reason'}`
		);
		return {
			success: true,
			runId: result.runId,
			auditId: result.auditId,
			skipped: !result.queued
		};
	}

	if (job.data.mode === PROJECT_REVIEW_SIGNAL_QUEUE_MODE) {
		return processDebouncedProjectReviewSignalJob(job);
	}

	if (!runId || !projectId) {
		throw new Error('runId and projectId are required');
	}

	if (job.data.mode === 'complete_audit') {
		return processCompleteProjectAuditJob(job);
	}

	await job.log(`Project loop started for project ${projectId} (run ${runId})`);

	// Status-fenced claim: atomically move the run from `queued` → `running`.
	// The stall sweeper (reset_stalled_jobs) can requeue a slow `processing`
	// queue job and start a SECOND concurrent execution of this same runId. Only
	// the execution that flips the row out of `queued` owns the work; any other
	// execution updates 0 rows here and returns without side effects, preventing
	// duplicate project_suggestions / inbox items. Mirrors agentRunWorker's
	// conditional-status claim.
	const { data: claimedRun, error: claimError } = await supabase
		.from('project_loop_runs')
		.update({ status: 'running', started_at: nowIso() })
		.eq('id', runId)
		.eq('status', 'queued')
		.select('*')
		.maybeSingle();

	if (claimError) throw new Error(`Failed to claim loop run: ${claimError.message}`);
	if (!claimedRun) {
		await job.log(
			`Project loop run ${runId} not claimed (already running/terminal); skipping to avoid duplicate execution.`
		);
		return { success: true, runId, skipped: true };
	}
	const run = claimedRun as ProjectLoopRun;

	// Heartbeat touches queue_jobs.updated_at so the 5-min stall sweeper never
	// sees this job as idle across the ~5 sequential LLM calls below. updateProgress
	// swallows its own failures, but guard defensively so a heartbeat never crashes
	// the loop.
	let heartbeatStep = 0;
	const HEARTBEAT_TOTAL = 8;
	const heartbeat = async (message: string): Promise<void> => {
		heartbeatStep += 1;
		try {
			await job.updateProgress({
				current: Math.min(heartbeatStep, HEARTBEAT_TOTAL),
				total: HEARTBEAT_TOTAL,
				message
			});
		} catch (progressError) {
			console.warn(
				`[ProjectLoops] Heartbeat failed for run ${runId}:`,
				progressError instanceof Error ? progressError.message : progressError
			);
		}
	};

	await heartbeat('Loading project context');

	let totalCost = 0;
	let totalPromptTokens = 0;
	let totalCompletionTokens = 0;
	let totalTokens = 0;
	let lastUsage: UsageEvent | null = null;
	const onUsage = async (event: UsageEvent) => {
		totalCost += event.totalCost ?? 0;
		totalPromptTokens += event.promptTokens ?? 0;
		totalCompletionTokens += event.completionTokens ?? 0;
		totalTokens += event.totalTokens ?? 0;
		lastUsage = event;
	};

	try {
		const ctx = await loadLoopContext(projectId);
		if (!ctx) {
			await job.log('Project inactive/archived; nothing to reconcile.');
			const { error: inactiveError } = await supabase
				.from('project_loop_runs')
				.update({
					status: 'completed',
					summary: 'Project inactive or archived; no suggestions.',
					suggestion_count: 0,
					finished_at: nowIso()
				})
				.eq('id', runId);
			if (inactiveError) {
				console.error(
					`[ProjectLoops] Failed to persist completed status for inactive run ${runId}: ${inactiveError.message}`
				);
				throw new Error(
					`Failed to persist completed status for run ${runId}: ${inactiveError.message}`
				);
			}
			return { success: true, runId, suggestionCount: 0 };
		}

		const llm = new SmartLLMService({
			supabase,
			appName: 'BuildOS Project Loop Worker'
		});
		// Freshness fingerprints are now scoped per suggestion (see the stamp block
		// below), so the whole-project fingerprint is no longer used on this path.
		const skippedGenerators: string[] = [];
		const runGenerator = async (
			label: string,
			generator: () => Promise<ProposedSuggestion[]>
		): Promise<ProposedSuggestion[]> => {
			if (totalCost >= PROJECT_LOOP_COST_CAP_USD) {
				skippedGenerators.push(label);
				await job.log(
					`Skipping ${label}; project loop cost cap reached ($${totalCost.toFixed(4)})`
				);
				return [];
			}
			// Heartbeat before each LLM generator so the stall sweeper never
			// reclaims this job mid-run.
			await heartbeat(`Generating ${label}`);
			return generator();
		};

		// The brief is now under the same cost cap as the reconciliation
		// generators. It runs first, so on a healthy run the cap is not yet
		// reached and the LLM brief is produced; if a prior cost ever pushes past
		// the cap we fall back to the zero-cost heuristic brief instead of
		// starving the suggestion generators that follow (audit §3 / Tier 1 #8).
		let brief: ProjectLoopBrief;
		if (totalCost >= PROJECT_LOOP_COST_CAP_USD) {
			skippedGenerators.push('project brief');
			await job.log(
				`Skipping LLM project brief; cost cap reached ($${totalCost.toFixed(4)}) — using heuristic brief.`
			);
			brief = buildHeuristicProjectLoopBrief(ctx);
		} else {
			await heartbeat('Generating project brief');
			brief = await generateProjectBrief({
				llm,
				ctx,
				userId: run.user_id,
				chatSessionId: run.chat_session_id ?? undefined,
				runId,
				onUsage
			});
		}

		const docOrg = await runGenerator('doc organization', () =>
			generateDocOrganization({
				llm,
				ctx,
				userId: run.user_id,
				chatSessionId: run.chat_session_id ?? undefined,
				runId,
				onUsage
			})
		);
		const outdated = await runGenerator('outdated docs', () =>
			generateOutdatedDocs({
				llm,
				ctx,
				userId: run.user_id,
				chatSessionId: run.chat_session_id ?? undefined,
				runId,
				onUsage
			})
		);
		const drift = await runGenerator('drift', () =>
			generateDrift({
				llm,
				ctx,
				userId: run.user_id,
				chatSessionId: run.chat_session_id ?? undefined,
				runId,
				onUsage
			})
		);
		const taskConflicts = await runGenerator('task conflicts', () =>
			generateTaskConflicts({
				llm,
				ctx,
				userId: run.user_id,
				chatSessionId: run.chat_session_id ?? undefined,
				runId,
				onUsage
			})
		);

		// Deterministic pre-insert suppression: drop proposals that duplicate a
		// suggestion the user is already looking at or has already decided, keyed
		// on the entities they touch (not their regenerated titles). This is the
		// only reliable guard against the loop re-flagging the same undecided task
		// pair or doc every run — prompt suppression has never had feedback data to
		// work with. See project-loops-flow-audit-2026-07-04 §3/§4.
		const generated: ProposedSuggestion[] = [
			...outdated,
			...taskConflicts,
			...docOrg,
			...drift
		];
		const existingKeys = await loadExistingSuggestionKeys(projectId);
		const seenThisRunKeys = new Set<string>();
		let suppressedCount = 0;
		let repeatedAfterDismissalCount = 0;
		const proposed: ProposedSuggestion[] = [];
		for (const suggestion of generated) {
			if (proposed.length >= MAX_SUGGESTIONS) break;
			const key = suggestionSuppressionKey(suggestion);
			if (key && (existingKeys.all.has(key) || seenThisRunKeys.has(key))) {
				suppressedCount += 1;
				// The model re-proposed something the user already dismissed — the
				// signal that prompt-only suppression is unreliable (audit Tier 1 #6).
				if (existingKeys.rejected.has(key)) repeatedAfterDismissalCount += 1;
				continue;
			}
			if (key) seenThisRunKeys.add(key);
			proposed.push(suggestion);
		}
		if (suppressedCount) {
			await job.log(
				`Suppressed ${suppressedCount} duplicate suggestion${
					suppressedCount === 1 ? '' : 's'
				} already open or previously decided for this project${
					repeatedAfterDismissalCount
						? ` (${repeatedAfterDismissalCount} previously dismissed)`
						: ''
				}.`
			);
		}

		if (proposed.length) {
			await heartbeat('Writing suggestions');

			// Stamp each suggestion with a freshness fingerprint scoped to just the
			// entities its operations mutate (Tier 1 #4). Batch-load every referenced
			// entity once, then hash each suggestion's subset. Suggestions that mutate
			// nothing concrete (drift, audit follow-ups) get a null fingerprint and
			// therefore no freshness guard. The web approval check recomputes this the
			// same way, so the two are directly comparable.
			const allTaskIds = new Set<string>();
			const allDocIds = new Set<string>();
			for (const s of proposed) {
				const refs = extractProjectLoopSuggestionEntities(s.operations);
				refs.taskIds.forEach((id) => allTaskIds.add(id));
				refs.docIds.forEach((id) => allDocIds.add(id));
			}
			const scopedStates = await loadProjectLoopSuggestionEntityStates(supabase, projectId, {
				taskIds: [...allTaskIds],
				docIds: [...allDocIds]
			});
			const scopedStateByKey = new Map<string, ProjectLoopScopedEntity>(
				scopedStates.map((e) => [`${e.kind}:${e.id}`, e])
			);
			const scopedFingerprintFor = (s: ProposedSuggestion): string | null => {
				const refs = extractProjectLoopSuggestionEntities(s.operations);
				const entities: ProjectLoopScopedEntity[] = [];
				for (const id of refs.taskIds) {
					const entity = scopedStateByKey.get(`task:${id}`);
					if (entity) entities.push(entity);
				}
				for (const id of refs.docIds) {
					const entity = scopedStateByKey.get(`document:${id}`);
					if (entity) entities.push(entity);
				}
				return buildScopedSuggestionFingerprint(entities);
			};

			const rows = proposed.map((s, index) => ({
				run_id: runId,
				project_id: projectId,
				kind: s.kind,
				risk_tier: s.risk_tier,
				title: s.title,
				rationale: s.rationale ?? null,
				why_now: s.why_now ?? null,
				confidence: s.confidence ?? null,
				evidence_refs: (s.evidence_refs ?? []) as unknown as Json,
				preview: (s.preview ?? null) as unknown as Json | null,
				operations: s.operations as unknown as Json,
				freshness_state: s.freshness_state ?? 'fresh',
				reversible: s.reversible ?? null,
				undo_operations: (s.undo_operations ?? null) as unknown as Json | null,
				source_fingerprint: scopedFingerprintFor(s),
				status: 'pending' as const,
				sort_order: s.sort_order ?? index
			}));
			const { data: insertedSuggestions, error: insertError } = await supabase
				.from('project_suggestions')
				.insert(rows)
				.select('*');
			if (insertError)
				throw new Error(`Failed to insert suggestions: ${insertError.message}`);
			for (const suggestion of insertedSuggestions ?? []) {
				try {
					await syncInboxItemForProjectSuggestion({
						supabase: supabase as any,
						suggestion: suggestion as unknown as Record<string, unknown>
					});
				} catch (syncError) {
					console.warn(
						`⚠️ Failed to sync AI Inbox item for project suggestion ${suggestion.id}:`,
						syncError instanceof Error ? syncError.message : syncError
					);
				}
			}
		}

		const countKind = (kind: ProjectSuggestionKind): number =>
			proposed.filter((s) => s.kind === kind).length;
		const summaryBase = proposed.length
			? `${proposed.length} suggestion${proposed.length === 1 ? '' : 's'}: ${countKind('doc_org')} organization, ${countKind('doc_outdated')} outdated-doc, ${countKind('drift')} drift, ${countKind('task_conflict')} task-conflict.`
			: 'No reconciliation suggestions — project looks tidy.';
		const summaryWithSuppressed = suppressedCount
			? `${summaryBase} Suppressed ${suppressedCount} duplicate${suppressedCount === 1 ? '' : 's'}.`
			: summaryBase;
		const summary = skippedGenerators.length
			? `${summaryWithSuppressed} Skipped ${skippedGenerators.join(', ')} after cost cap.`
			: summaryWithSuppressed;

		const { error: terminalError } = await supabase
			.from('project_loop_runs')
			.update({
				status: proposed.length ? 'waiting_review' : 'completed',
				brief: brief as unknown as Json,
				summary,
				suggestion_count: proposed.length,
				cost_usd: totalCost || null,
				finished_at: nowIso()
			})
			.eq('id', runId);
		if (terminalError) {
			// The suggestions were written but the run row is still `running`.
			// Fail loudly and surface it through the catch path so the job does
			// NOT report success against a run row stuck in a non-terminal state.
			console.error(
				`[ProjectLoops] Failed to persist terminal status for run ${runId}: ${terminalError.message}`
			);
			throw new Error(
				`Failed to persist terminal status for run ${runId}: ${terminalError.message}`
			);
		}

		// Suggestion-lifecycle telemetry: the "generated" end of the loop that the
		// AI Inbox decide events complete on the web side (audit Tier 1 #6). Lets us
		// tell whether the loop is helping or nagging.
		captureWorkerEvent(run.user_id, 'project_suggestion_generated', {
			project_id: projectId,
			run_id: runId,
			trigger_reason: run.trigger_reason,
			generated_count: generated.length,
			inserted_count: proposed.length,
			suppressed_count: suppressedCount,
			repeated_after_dismissal_count: repeatedAfterDismissalCount,
			skipped_generators: skippedGenerators,
			doc_org_count: countKind('doc_org'),
			doc_outdated_count: countKind('doc_outdated'),
			drift_count: countKind('drift'),
			task_conflict_count: countKind('task_conflict'),
			cost_usd: totalCost
		});

		await job.log(`Project loop completed: ${summary}`);
		return { success: true, runId, suggestionCount: proposed.length };
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		const usageForError = lastUsage as UsageEvent | null;
		await job.log(`Project loop failed: ${message}`);
		await failRun(runId, message, { totalCost });
		await supersedePendingSuggestionsForFailedRun({ runId, message });
		await logWorkerError(error, {
			userId: run.user_id,
			projectId,
			operationType: 'project_loop_run',
			tableName: 'project_loop_runs',
			recordId: runId,
			llmProvider: usageForError?.model?.split('/')[0],
			llmModel: usageForError?.model,
			llmPromptTokens: totalPromptTokens,
			llmCompletionTokens: totalCompletionTokens,
			llmTotalTokens: totalTokens,
			severity: 'error',
			operationPayload: {
				runId,
				projectId,
				queueJobId: job.id,
				chatSessionId: run.chat_session_id,
				triggerReason: run.trigger_reason,
				totalCostUsd: totalCost,
				totalPromptTokens,
				totalCompletionTokens,
				totalTokens,
				lastModel: usageForError?.model ?? null
			},
			metadata: {
				errorSource: 'project_loop_worker',
				runId,
				projectId,
				queueJobId: job.id,
				chatSessionId: run.chat_session_id,
				triggerReason: run.trigger_reason,
				totalCostUsd: totalCost,
				costCapUsd: PROJECT_LOOP_COST_CAP_USD,
				totalPromptTokens,
				totalCompletionTokens,
				totalTokens,
				lastModel: usageForError?.model ?? null
			}
		});
		throw error;
	}
}
