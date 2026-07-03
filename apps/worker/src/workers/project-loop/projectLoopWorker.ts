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
	ProjectLoopBrief,
	ProjectLoopJobMetadata,
	ProjectLoopRun,
	ProposedSuggestion
} from '@buildos/shared-types';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { supabase } from '../../lib/supabase';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import { PROJECT_LOOPS_ENABLED } from '../../config/projectLoops';
import { logWorkerError } from '../../lib/errorLogger';
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
	generateTaskConflicts
} from './generators';
import {
	buildProjectLoopParentMap,
	buildProjectLoopSourceFingerprint,
	summarizeProjectLoopDocTree,
	syncInboxItemForProjectSuggestion
} from '@buildos/shared-agent-ops';

const MAX_SUGGESTIONS = 25;
const PROJECT_LOOP_COST_CAP_USD = 0.35;
const PRIOR_DECISION_LOOKBACK_DAYS = 60;
const COMPLETE_AUDIT_ACTIVITY_LOOKBACK_DAYS = 30;

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
	const { data, error } = await supabase
		.from('project_suggestions')
		.select('title, kind, status, user_feedback, decided_at, updated_at')
		.eq('project_id', projectId)
		.in('status', ['rejected', 'applied', 'delegated', 'superseded'])
		.not('user_feedback', 'is', null)
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
	const rawDocs: any[] = Array.isArray(payload?.documents) ? payload.documents : [];
	const rawTasks: any[] = Array.isArray(payload?.tasks) ? payload.tasks : [];
	const rawGoals: any[] = Array.isArray(payload?.goals) ? payload.goals : [];
	const priorDecisions = await loadPriorDecisions(projectId);

	const parentMap = buildProjectLoopParentMap(projectRow.doc_structure);
	const titleById = new Map<string, string>(
		rawDocs.map((d) => [d.id as string, (d.title as string) ?? 'Untitled'])
	);

	const documents: LoopDocument[] = rawDocs.map((d) => ({
		id: d.id,
		title: d.title ?? 'Untitled',
		type_key: d.type_key ?? null,
		state_key: d.state_key ?? null,
		description: d.description ?? null,
		updated_at: d.updated_at ?? d.created_at ?? null,
		parent_id: parentMap.get(d.id) ?? null
	}));

	const tasks: LoopTask[] = rawTasks
		.filter((t) => t.state_key !== 'done')
		.slice(0, 20)
		.map((t) => ({
			id: t.id,
			title: t.title ?? 'Untitled',
			description: t.description ?? null,
			state_key: t.state_key ?? null,
			updated_at: t.updated_at ?? t.created_at ?? null
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

function buildCompleteAuditPacket(params: {
	ctx: LoopContext;
	recentActivity: AuditActivityRow[];
	triggerReason: string;
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
	recommendations: Record<string, unknown>[];
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

	const nonGreen = dimensions.filter((item) => item.rating !== 'green');
	const redCount = dimensions.filter((item) => item.rating === 'red').length;
	const yellowCount = dimensions.filter((item) => item.rating === 'yellow').length;
	const unknownCount = dimensions.filter((item) => item.rating === 'unknown').length;
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
		(item.recommendations ?? []).slice(0, 2).map((recommendation) => ({
			title: recommendation,
			summary: item.summary,
			priority: item.rating === 'red' ? 'high' : item.rating === 'yellow' ? 'medium' : 'low',
			dimension: item.key
		}))
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
			goal_count: metrics.goalCount
		},
		dimensions,
		risks: [],
		openQuestions: dimensions
			.filter((item) => item.rating === 'unknown')
			.map((item) => ({
				dimension: item.key,
				question: item.uncertainty ?? `More evidence needed for ${item.name}.`
			})),
		evidenceRefs: [...projectEvidence, ...goalEvidence, ...docEvidence, ...taskEvidence],
		recommendations
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

	const { data: claimedRun, error: claimRunError } = await supabase
		.from('project_loop_runs')
		.update({ status: 'running', started_at: nowIso() })
		.eq('id', runId)
		.eq('status', 'queued')
		.select('*')
		.maybeSingle();
	if (claimRunError) throw new Error(`Failed to claim audit loop run: ${claimRunError.message}`);
	if (!claimedRun) {
		await job.log(`Audit loop run ${runId} not claimed; skipping duplicate execution.`);
		return { success: true, runId, auditId, skipped: true };
	}

	const { data: claimedAudit, error: claimAuditError } = await supabase
		.from('project_audits')
		.update({ status: 'running', started_at: nowIso() })
		.eq('id', auditId)
		.eq('status', 'queued')
		.select('id')
		.maybeSingle();
	if (claimAuditError) {
		await failRun(runId, `Failed to claim project audit: ${claimAuditError.message}`);
		throw new Error(`Failed to claim project audit: ${claimAuditError.message}`);
	}
	if (!claimedAudit) {
		await job.log(`Project audit ${auditId} not claimed; skipping duplicate execution.`);
		return { success: true, runId, auditId, skipped: true };
	}

	try {
		await job.updateProgress({ current: 1, total: 4, message: 'Loading audit context' });
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

		await job.updateProgress({ current: 2, total: 4, message: 'Computing audit metrics' });
		const recentActivity = await loadAuditRecentActivity(projectId);

		await job.updateProgress({ current: 3, total: 4, message: 'Building audit packet' });
		const packet = buildCompleteAuditPacket({
			ctx,
			recentActivity,
			triggerReason
		});
		const now = nowIso();

		await job.updateProgress({ current: 4, total: 4, message: 'Persisting audit packet' });
		const { error: auditUpdateError } = await supabase
			.from('project_audits')
			.update({
				status: 'ready',
				delivery_confidence: packet.deliveryConfidence,
				project_thesis: packet.projectThesis,
				summary: packet.summary,
				top_findings: packet.topFindings as unknown as Json,
				top_actions: packet.topActions as unknown as Json,
				change_summary: packet.changeSummary as Json,
				dimensions: packet.dimensions as unknown as Json,
				risks: packet.risks as unknown as Json,
				open_questions: packet.openQuestions as unknown as Json,
				evidence_refs: packet.evidenceRefs as unknown as Json,
				recommendations: packet.recommendations as unknown as Json,
				generated_suggestion_count: 0,
				unresolved_suggestion_count: 0,
				model_used: 'deterministic-audit-v0',
				cost_usd: 0,
				finished_at: now
			})
			.eq('id', auditId);
		if (auditUpdateError) {
			throw new Error(`Failed to persist project audit: ${auditUpdateError.message}`);
		}

		const { error: runUpdateError } = await supabase
			.from('project_loop_runs')
			.update({
				status: 'completed',
				summary: packet.summary,
				suggestion_count: 0,
				cost_usd: 0,
				finished_at: now
			})
			.eq('id', runId);
		if (runUpdateError) {
			throw new Error(`Failed to complete audit loop run: ${runUpdateError.message}`);
		}

		await job.log(`Complete project audit ${auditId} is ready.`);
		return { success: true, runId, auditId };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Complete project audit failed';
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
		const sourceFingerprint = buildProjectLoopSourceFingerprint(ctx);
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

		await heartbeat('Generating project brief');
		const brief: ProjectLoopBrief = await generateProjectBrief({
			llm,
			ctx,
			userId: run.user_id,
			chatSessionId: run.chat_session_id ?? undefined,
			runId,
			onUsage
		});

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

		const proposed: ProposedSuggestion[] = [
			...outdated,
			...taskConflicts,
			...docOrg,
			...drift
		].slice(0, MAX_SUGGESTIONS);

		if (proposed.length) {
			await heartbeat('Writing suggestions');
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
				source_fingerprint: s.source_fingerprint ?? sourceFingerprint,
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

		const summaryBase = proposed.length
			? `${proposed.length} suggestion${proposed.length === 1 ? '' : 's'}: ${docOrg.length} organization, ${outdated.length} outdated-doc, ${drift.length} drift, ${taskConflicts.length} task-conflict.`
			: 'No reconciliation suggestions — project looks tidy.';
		const summary = skippedGenerators.length
			? `${summaryBase} Skipped ${skippedGenerators.join(', ')} after cost cap.`
			: summaryBase;

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

		await job.log(`Project loop completed: ${summary}`);
		return { success: true, runId, suggestionCount: proposed.length };
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		const usageForError = lastUsage as UsageEvent | null;
		await job.log(`Project loop failed: ${message}`);
		await failRun(runId, message, { totalCost });
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
