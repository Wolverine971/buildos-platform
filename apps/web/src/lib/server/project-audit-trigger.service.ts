// apps/web/src/lib/server/project-audit-trigger.service.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { addQueueJobWithPublicId } from '$lib/server/queue-job-id';
import { createLogger } from '$lib/utils/logger';
import type {
	Json,
	ProjectAuditDepth,
	ProjectAuditMaturitySnapshot,
	ProjectAuditSizeClass,
	ProjectAuditTriggerDecision,
	ProjectAuditTriggerReason,
	ProjectAuditTriggerSnapshot
} from '@buildos/shared-types';
import {
	isProjectAuditBaselineEligible,
	loadProjectAuditSnapshot,
	type ProjectAuditActivityRow,
	type ProjectAuditSnapshot
} from './project-audit-snapshot.service';

type AnySupabase = any;

const logger = createLogger('ProjectAuditTrigger');

const SCHEDULED_AUDIT_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;
const COMPLETE_AUDIT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const BURST_QUIET_PERIOD_MS = 2 * 60 * 60 * 1000;

type ActiveAuditRow = {
	id: string;
	status: string | null;
	created_at: string | null;
};

type LastAuditRow = {
	id: string;
	status: string | null;
	finished_at: string | null;
	created_at: string | null;
	project_snapshot_fingerprint?: string | null;
};

export type ProjectAuditTriggerEvaluationDraft = {
	project_id: string;
	user_id: string;
	evaluated_at: string;
	decision: ProjectAuditTriggerDecision;
	trigger_reason: ProjectAuditTriggerReason;
	eligible: boolean;
	project_size_class: ProjectAuditSizeClass;
	maturity_snapshot: ProjectAuditMaturitySnapshot;
	burst_score: number | null;
	changed_entity_count: number | null;
	major_change_count: number | null;
	last_audit_id: string | null;
	quiet_until: string | null;
	cooldown_until: string | null;
	reason_summary: string;
	created_audit_id?: string | null;
	created_loop_run_id?: string | null;
};

export type ProjectAuditTriggerEvaluationResult = {
	evaluation: ProjectAuditTriggerEvaluationDraft;
	snapshot: ProjectAuditSnapshot | null;
	activeAuditId?: string | null;
	lastAudit?: LastAuditRow | null;
};

export type QueueProjectAuditResult = {
	queued: boolean;
	auditId?: string;
	runId?: string;
	jobId?: string;
	evaluationId?: string;
	decision: ProjectAuditTriggerDecision;
	reason: string;
	evaluation: ProjectAuditTriggerEvaluationDraft;
};

type BurstMetrics = {
	score72h: number;
	score7d: number;
	changedEntities72h: number;
	changedEntities7d: number;
	majorChanges72h: number;
	lastMajorMutationAt: string | null;
	quietUntil: string | null;
};

function parseDateMs(value: string | null | undefined): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function addMsIso(value: string | null | undefined, ms: number): string | null {
	const parsed = parseDateMs(value);
	return parsed === null ? null : new Date(parsed + ms).toISOString();
}

function scoreAuditActivity(row: ProjectAuditActivityRow): number {
	const action = row.action ?? '';
	const entityType = row.entity_type ?? '';
	const source = row.change_source ?? '';

	if (entityType === 'project') return action === 'updated' ? 5 : 3;
	if (entityType === 'goal') return 5;
	if (entityType === 'milestone') return 5;
	if (entityType === 'risk') return 4;
	if (entityType === 'calendar_event' || entityType === 'event') return 2;
	if (source === 'doc_tree_move') return 3;

	if (entityType === 'document') {
		if (action === 'created') return 2;
		if (action === 'deleted') return 4;
		if (action === 'updated') return 3;
	}

	if (entityType === 'task') {
		if (action === 'created') return 1;
		if (action === 'deleted') return 3;
		if (action === 'updated') return 1;
	}

	if (action === 'created') return 2;
	if (action === 'deleted') return 3;
	if (action === 'updated') return 1;
	return 1;
}

function isMajorAuditChange(row: ProjectAuditActivityRow): boolean {
	const score = scoreAuditActivity(row);
	if (score >= 5) return true;
	const source = row.change_source ?? '';
	return [
		'project_scope_update',
		'goal_rewrite',
		'milestone_date_move',
		'document_archive',
		'bulk_task_update'
	].includes(source);
}

function computeBurstMetrics(rows: ProjectAuditActivityRow[], now: Date): BurstMetrics {
	const since72h = now.getTime() - 72 * 60 * 60 * 1000;
	const since7d = now.getTime() - 7 * 24 * 60 * 60 * 1000;
	const changed72h = new Set<string>();
	const changed7d = new Set<string>();
	let score72h = 0;
	let score7d = 0;
	let majorChanges72h = 0;
	let lastMajorMutationMs: number | null = null;

	for (const row of rows) {
		const createdMs = parseDateMs(row.created_at);
		if (createdMs === null) continue;
		const entityKey = `${row.entity_type ?? 'unknown'}:${row.entity_id ?? row.id ?? createdMs}`;
		const score = scoreAuditActivity(row);

		if (createdMs >= since7d) {
			score7d += score;
			changed7d.add(entityKey);
		}
		if (createdMs >= since72h) {
			score72h += score;
			changed72h.add(entityKey);
			if (isMajorAuditChange(row)) {
				majorChanges72h += 1;
				lastMajorMutationMs = Math.max(lastMajorMutationMs ?? 0, createdMs);
			}
		}
	}

	const lastMajorMutationAt =
		lastMajorMutationMs === null ? null : new Date(lastMajorMutationMs).toISOString();
	return {
		score72h,
		score7d,
		changedEntities72h: changed72h.size,
		changedEntities7d: changed7d.size,
		majorChanges72h,
		lastMajorMutationAt,
		quietUntil: lastMajorMutationAt
			? addMsIso(lastMajorMutationAt, BURST_QUIET_PERIOD_MS)
			: null
	};
}

function changedEntityCountSince(
	rows: ProjectAuditActivityRow[],
	sinceIso: string | null,
	now: Date
): number {
	const sinceMs = parseDateMs(sinceIso) ?? now.getTime() - SCHEDULED_AUDIT_INTERVAL_MS;
	const changed = new Set<string>();
	for (const row of rows) {
		const createdMs = parseDateMs(row.created_at);
		if (createdMs === null || createdMs < sinceMs) continue;
		changed.add(`${row.entity_type ?? 'unknown'}:${row.entity_id ?? row.id ?? createdMs}`);
	}
	return changed.size;
}

function latestAuditTimestamp(audit: LastAuditRow | null): string | null {
	return audit?.finished_at ?? audit?.created_at ?? null;
}

function reasonForIneligible(snapshot: ProjectAuditSnapshot | null): string {
	if (!snapshot) return 'Project is unavailable or archived.';
	const reasons = snapshot.maturity.ineligible_reasons;
	if (!reasons.length) return 'Project is eligible for a complete audit.';
	return `Project is below complete-audit baseline: ${reasons.join(', ')}.`;
}

function isAutomatedReason(reason: ProjectAuditTriggerReason): boolean {
	return reason !== 'manual';
}

function isMediumOrLarger(sizeClass: ProjectAuditSizeClass): boolean {
	return sizeClass === 'medium' || sizeClass === 'large' || sizeClass === 'strategic';
}

function passesBurstThreshold(snapshot: ProjectAuditSnapshot, burst: BurstMetrics): boolean {
	const total = Math.max(1, snapshot.maturity.entity_counts.total);
	const touchedRatio7d = burst.changedEntities7d / total;

	if (snapshot.sizeClass === 'small_eligible') {
		return burst.score72h >= 10 && burst.changedEntities72h / total >= 0.25;
	}
	if (snapshot.sizeClass === 'medium') {
		return burst.score72h >= 16 || burst.changedEntities7d >= 12;
	}
	if (snapshot.sizeClass === 'large') {
		return burst.score7d >= 24 || touchedRatio7d >= 0.15;
	}
	if (snapshot.sizeClass === 'strategic') {
		return burst.score7d >= 24 || touchedRatio7d >= 0.15 || burst.majorChanges72h >= 2;
	}
	return false;
}

function auditSizeClassForInsert(
	sizeClass: ProjectAuditSizeClass
): Exclude<ProjectAuditSizeClass, 'below_baseline'> {
	return sizeClass === 'below_baseline' ? 'small_eligible' : sizeClass;
}

async function loadActiveAudit(
	supabase: AnySupabase,
	projectId: string
): Promise<ActiveAuditRow | null> {
	const { data, error } = await supabase
		.from('project_audits')
		.select('id, status, created_at')
		.eq('project_id', projectId)
		.in('status', ['queued', 'running'])
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (error) throw error;
	return (data ?? null) as ActiveAuditRow | null;
}

async function loadLastAudit(
	supabase: AnySupabase,
	projectId: string
): Promise<LastAuditRow | null> {
	const { data, error } = await supabase
		.from('project_audits')
		.select('id, status, finished_at, created_at, project_snapshot_fingerprint')
		.eq('project_id', projectId)
		.in('status', ['ready', 'reviewed', 'superseded'])
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (error) throw error;
	return (data ?? null) as LastAuditRow | null;
}

export async function evaluateProjectAuditTrigger(params: {
	supabase: AnySupabase;
	projectId: string;
	userId: string;
	triggerReason: ProjectAuditTriggerReason;
	now?: Date;
}): Promise<ProjectAuditTriggerEvaluationResult> {
	const now = params.now ?? new Date();
	const evaluatedAt = now.toISOString();
	const manualBypass = params.triggerReason === 'manual';
	const snapshot = await loadProjectAuditSnapshot({
		supabase: params.supabase,
		projectId: params.projectId,
		manualBypass,
		now
	});
	const burst = snapshot ? computeBurstMetrics(snapshot.recentActivity, now) : null;
	const activeAudit = snapshot ? await loadActiveAudit(params.supabase, params.projectId) : null;
	const lastAudit = snapshot ? await loadLastAudit(params.supabase, params.projectId) : null;
	const baselineEligible = snapshot ? isProjectAuditBaselineEligible(snapshot.maturity) : false;
	const eligible = manualBypass ? baselineEligible : Boolean(snapshot && baselineEligible);
	const sizeClass = snapshot?.sizeClass ?? 'below_baseline';
	const lastAuditAt = latestAuditTimestamp(lastAudit);
	const cooldownUntil =
		lastAuditAt && params.triggerReason !== 'critical_change'
			? addMsIso(lastAuditAt, COMPLETE_AUDIT_COOLDOWN_MS)
			: null;

	const base = {
		project_id: params.projectId,
		user_id: params.userId,
		evaluated_at: evaluatedAt,
		trigger_reason: params.triggerReason,
		eligible,
		project_size_class: sizeClass,
		maturity_snapshot:
			snapshot?.maturity ??
			({
				project_age_days: null,
				active_or_planning: false,
				activity_day_count: 0,
				has_goal_or_substantial_description: false,
				content_thresholds_met: 0,
				content_threshold_flags: {
					active_documents: false,
					substantial_document: false,
					non_deleted_tasks: false,
					goals_milestones_or_success_criteria: false,
					dated_commitment: false,
					total_entities: false
				},
				entity_counts: {
					documents: 0,
					tasks: 0,
					goals: 0,
					milestones: 0,
					risks: 0,
					plans: 0,
					events: 0,
					total: 0
				},
				ineligible_reasons: ['project_unavailable'],
				manual_bypass: manualBypass
			} satisfies ProjectAuditMaturitySnapshot),
		burst_score: burst ? Math.max(burst.score72h, burst.score7d) : null,
		changed_entity_count: burst
			? Math.max(burst.changedEntities72h, burst.changedEntities7d)
			: null,
		major_change_count: burst?.majorChanges72h ?? null,
		last_audit_id: lastAudit?.id ?? null,
		quiet_until: burst?.quietUntil ?? null,
		cooldown_until: cooldownUntil
	};

	const result = (
		decision: ProjectAuditTriggerDecision,
		reasonSummary: string,
		overrides: Partial<ProjectAuditTriggerEvaluationDraft> = {}
	): ProjectAuditTriggerEvaluationResult => ({
		evaluation: {
			...base,
			...overrides,
			decision,
			reason_summary: reasonSummary
		},
		snapshot,
		activeAuditId: activeAudit?.id ?? null,
		lastAudit
	});

	if (!snapshot) {
		return result('skipped_ineligible', reasonForIneligible(snapshot));
	}

	if (activeAudit?.id) {
		return result('skipped_active_run', 'A complete audit is already queued or running.');
	}

	if (!manualBypass && !baselineEligible) {
		return result('skipped_ineligible', reasonForIneligible(snapshot));
	}

	if (manualBypass) {
		const suffix = baselineEligible
			? 'Project meets the complete-audit baseline.'
			: `Manual audit bypasses baseline gates: ${snapshot.maturity.ineligible_reasons.join(', ')}.`;
		return result('queued', suffix);
	}

	const cooldownMs = parseDateMs(cooldownUntil);
	if (
		cooldownMs !== null &&
		now.getTime() < cooldownMs &&
		params.triggerReason !== 'critical_change'
	) {
		return result(
			'skipped_cooldown',
			`Last complete audit is too recent; cooldown ends ${cooldownUntil}.`
		);
	}

	if (params.triggerReason === 'scheduled') {
		if (!isMediumOrLarger(sizeClass)) {
			return result(
				'manual_required',
				'Small eligible projects require a manual complete audit.'
			);
		}

		if (lastAuditAt) {
			const nextScheduledMs = (parseDateMs(lastAuditAt) ?? 0) + SCHEDULED_AUDIT_INTERVAL_MS;
			if (now.getTime() < nextScheduledMs) {
				const next = new Date(nextScheduledMs).toISOString();
				return result(
					'skipped_cooldown',
					`Next scheduled complete audit is available after ${next}.`,
					{ cooldown_until: next }
				);
			}
		}

		const changedSinceLastAudit = changedEntityCountSince(
			snapshot.recentActivity,
			lastAuditAt,
			now
		);
		const threshold = sizeClass === 'medium' ? 3 : 6;
		if (changedSinceLastAudit < threshold && (burst?.majorChanges72h ?? 0) === 0) {
			return result(
				'skipped_no_activity',
				'No meaningful activity since the last complete audit.'
			);
		}

		return result(
			'queued',
			`Scheduled audit queued after ${changedSinceLastAudit} changed entities.`
		);
	}

	if (params.triggerReason === 'critical_change') {
		if ((burst?.majorChanges72h ?? 0) < 2) {
			return result('skipped_no_activity', 'Critical-change threshold was not met.');
		}
		return result('queued', 'Critical-change threshold met by recent major project changes.');
	}

	if (params.triggerReason === 'burst') {
		if (!burst || !passesBurstThreshold(snapshot, burst)) {
			return result(
				'skipped_no_activity',
				'Recent project activity is below complete-audit burst threshold.'
			);
		}

		const quietUntilMs = parseDateMs(burst.quietUntil);
		if (quietUntilMs !== null && now.getTime() < quietUntilMs) {
			return result(
				'deferred_quiet_period',
				`Waiting for recent project activity to settle until ${burst.quietUntil}.`
			);
		}

		return result(
			'queued',
			'Recent project activity crossed the complete-audit burst threshold.'
		);
	}

	if (isAutomatedReason(params.triggerReason)) {
		return result('skipped_no_activity', 'No complete-audit trigger matched this project.');
	}

	return result('queued', 'Manual complete audit queued.');
}

export async function recordProjectAuditTriggerEvaluation(params: {
	supabase: AnySupabase;
	evaluation: ProjectAuditTriggerEvaluationDraft;
	createdAuditId?: string | null;
	createdLoopRunId?: string | null;
}): Promise<string | null> {
	const { data, error } = await params.supabase
		.from('project_audit_trigger_evaluations')
		.insert({
			project_id: params.evaluation.project_id,
			user_id: params.evaluation.user_id,
			evaluated_at: params.evaluation.evaluated_at,
			decision: params.evaluation.decision,
			trigger_reason: params.evaluation.trigger_reason,
			eligible: params.evaluation.eligible,
			project_size_class: params.evaluation.project_size_class,
			maturity_snapshot: params.evaluation.maturity_snapshot as unknown as Json,
			burst_score: params.evaluation.burst_score,
			changed_entity_count: params.evaluation.changed_entity_count,
			major_change_count: params.evaluation.major_change_count,
			last_audit_id: params.evaluation.last_audit_id,
			quiet_until: params.evaluation.quiet_until,
			cooldown_until: params.evaluation.cooldown_until,
			reason_summary: params.evaluation.reason_summary,
			created_audit_id: params.createdAuditId ?? params.evaluation.created_audit_id ?? null,
			created_loop_run_id:
				params.createdLoopRunId ?? params.evaluation.created_loop_run_id ?? null
		})
		.select('id')
		.single();

	if (error) throw error;
	return (data?.id as string | undefined) ?? null;
}

async function createAuditChatSession(params: {
	supabase: AnySupabase;
	projectId: string;
	userId: string;
	triggerReason: ProjectAuditTriggerReason;
}): Promise<string> {
	const title =
		params.triggerReason === 'manual'
			? 'Manual Complete Project Audit'
			: 'Complete Project Audit';
	const { data: session, error: sessionError } = await params.supabase
		.from('chat_sessions')
		.insert({
			user_id: params.userId,
			context_type: 'project',
			entity_id: params.projectId,
			status: 'active',
			chat_type: 'project_audit',
			title,
			agent_metadata: {
				source: 'project_audit',
				project_id: params.projectId,
				trigger_reason: params.triggerReason
			} as Json
		})
		.select('id')
		.single();
	if (sessionError || !session?.id) {
		throw sessionError ?? new Error('Failed to create project audit chat session');
	}

	await params.supabase
		.from('chat_sessions_projects')
		.insert({
			chat_session_id: session.id,
			project_id: params.projectId
		})
		.throwOnError();

	return session.id as string;
}

export async function queueProjectAudit(params: {
	projectId: string;
	userId: string;
	triggerReason: ProjectAuditTriggerReason;
	auditDepth?: ProjectAuditDepth;
	now?: Date;
}): Promise<QueueProjectAuditResult> {
	const supabase = createAdminSupabaseClient();
	const auditDepth = params.auditDepth ?? 'standard';
	const evaluated = await evaluateProjectAuditTrigger({
		supabase,
		projectId: params.projectId,
		userId: params.userId,
		triggerReason: params.triggerReason,
		now: params.now
	});

	if (evaluated.evaluation.decision !== 'queued' || !evaluated.snapshot) {
		const evaluationId = await recordProjectAuditTriggerEvaluation({
			supabase,
			evaluation: evaluated.evaluation
		});
		return {
			queued: false,
			evaluationId: evaluationId ?? undefined,
			decision: evaluated.evaluation.decision,
			reason: evaluated.evaluation.reason_summary,
			evaluation: evaluated.evaluation
		};
	}

	let chatSessionId: string;
	try {
		chatSessionId = await createAuditChatSession({
			supabase,
			projectId: params.projectId,
			userId: params.userId,
			triggerReason: params.triggerReason
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Failed to create project audit chat session';
		logger.warn('Create audit chat session failed', {
			projectId: params.projectId,
			error: message
		});
		return {
			queued: false,
			decision: evaluated.evaluation.decision,
			reason: message,
			evaluation: evaluated.evaluation
		};
	}

	const { data: runRow, error: runError } = await supabase
		.from('project_loop_runs')
		.insert({
			project_id: params.projectId,
			user_id: params.userId,
			trigger_reason:
				params.triggerReason === 'scheduled' ? 'scheduled' : params.triggerReason,
			status: 'queued',
			chat_session_id: chatSessionId,
			summary: 'Complete project audit queued.'
		})
		.select('id')
		.single();

	if (runError || !runRow?.id) {
		const message = runError?.message ?? 'Failed to create audit loop run';
		logger.warn('Create audit loop run failed', {
			projectId: params.projectId,
			error: message
		});
		return {
			queued: false,
			decision: evaluated.evaluation.decision,
			reason: message,
			evaluation: evaluated.evaluation
		};
	}

	const triggerSnapshot: ProjectAuditTriggerSnapshot = {
		trigger_reason: evaluated.evaluation.trigger_reason,
		evaluated_at: evaluated.evaluation.evaluated_at,
		eligible: evaluated.evaluation.eligible,
		project_size_class: evaluated.evaluation.project_size_class,
		maturity_snapshot: evaluated.evaluation.maturity_snapshot,
		burst_score: evaluated.evaluation.burst_score,
		changed_entity_count: evaluated.evaluation.changed_entity_count,
		major_change_count: evaluated.evaluation.major_change_count,
		quiet_until: evaluated.evaluation.quiet_until,
		cooldown_until: evaluated.evaluation.cooldown_until,
		last_audit_id: evaluated.evaluation.last_audit_id,
		reason_summary: evaluated.evaluation.reason_summary
	};

	const { data: auditRow, error: auditError } = await supabase
		.from('project_audits')
		.insert({
			project_id: params.projectId,
			user_id: params.userId,
			loop_run_id: runRow.id,
			chat_session_id: chatSessionId,
			status: 'queued',
			trigger_reason: params.triggerReason,
			audit_depth: auditDepth,
			delivery_confidence: 'unknown',
			project_size_class: auditSizeClassForInsert(evaluated.evaluation.project_size_class),
			summary: 'Complete project audit queued.',
			trigger_snapshot: triggerSnapshot as unknown as Json,
			project_snapshot_fingerprint: evaluated.snapshot.fingerprint
		})
		.select('id')
		.single();

	if (auditError || !auditRow?.id) {
		const message = auditError?.message ?? 'Failed to create project audit';
		logger.warn('Create project audit failed', { projectId: params.projectId, error: message });
		await supabase
			.from('project_loop_runs')
			.update({
				status: 'failed',
				error_message: message,
				finished_at: new Date().toISOString()
			})
			.eq('id', runRow.id);
		return {
			queued: false,
			runId: runRow.id as string,
			decision: evaluated.evaluation.decision,
			reason: message,
			evaluation: evaluated.evaluation
		};
	}

	const evaluationId = await recordProjectAuditTriggerEvaluation({
		supabase,
		evaluation: evaluated.evaluation,
		createdAuditId: auditRow.id as string,
		createdLoopRunId: runRow.id as string
	});

	try {
		const { queueJobId } = await addQueueJobWithPublicId(supabase, {
			p_user_id: params.userId,
			p_job_type: 'buildos_project_loop',
			p_metadata: {
				mode: 'complete_audit',
				runId: runRow.id,
				auditId: auditRow.id,
				projectId: params.projectId,
				userId: params.userId,
				triggerReason: params.triggerReason,
				auditDepth,
				triggerEvaluationId: evaluationId
			},
			p_priority: auditDepth === 'deep' ? 6 : 7,
			p_scheduled_for: new Date().toISOString(),
			p_dedup_key: `project-audit:${params.projectId}:${auditRow.id}`
		});

		await supabase
			.from('project_loop_runs')
			.update({ queue_job_id: queueJobId })
			.eq('id', runRow.id);

		return {
			queued: true,
			auditId: auditRow.id as string,
			runId: runRow.id as string,
			jobId: queueJobId,
			evaluationId: evaluationId ?? undefined,
			decision: 'queued',
			reason: evaluated.evaluation.reason_summary,
			evaluation: {
				...evaluated.evaluation,
				created_audit_id: auditRow.id as string,
				created_loop_run_id: runRow.id as string
			}
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Queue failed';
		logger.warn('Queue audit job failed', { projectId: params.projectId, error: message });
		const now = new Date().toISOString();
		await Promise.all([
			supabase
				.from('project_loop_runs')
				.update({ status: 'failed', error_message: message, finished_at: now })
				.eq('id', runRow.id),
			supabase
				.from('project_audits')
				.update({ status: 'failed', error_message: message, finished_at: now })
				.eq('id', auditRow.id)
		]);
		return {
			queued: false,
			auditId: auditRow.id as string,
			runId: runRow.id as string,
			evaluationId: evaluationId ?? undefined,
			decision: 'queued',
			reason: message,
			evaluation: evaluated.evaluation
		};
	}
}
