// packages/shared-agent-ops/src/project-audits.ts
import { createHash } from 'node:crypto';
import type {
	Json,
	ProjectAuditMaturitySnapshot,
	ProjectAuditSizeClass,
	ProjectAuditTriggerDecision,
	ProjectAuditTriggerReason,
	ProjectAuditTriggerSnapshot
} from '@buildos/shared-types';

type AnySupabase = any;

export const SCHEDULED_AUDIT_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;
export const COMPLETE_AUDIT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const BURST_QUIET_PERIOD_MS = 2 * 60 * 60 * 1000;

const RECENT_ACTIVITY_LIMIT = 500;
const PRIOR_AUDIT_LIMIT = 5;

export type ProjectAuditGraphEntity = Record<string, unknown>;

export type ProjectAuditActivityRow = {
	id?: string | null;
	entity_type: string | null;
	entity_id: string | null;
	action: string | null;
	change_source?: string | null;
	created_at: string | null;
	before_data?: unknown;
	after_data?: unknown;
};

export type ProjectAuditSnapshot = {
	project: {
		id: string;
		name: string;
		description: string | null;
		state_key: string | null;
		created_at: string | null;
		updated_at: string | null;
		start_at: string | null;
		end_at: string | null;
		deleted_at: string | null;
		archived_at: string | null;
	};
	documents: ProjectAuditGraphEntity[];
	tasks: ProjectAuditGraphEntity[];
	goals: ProjectAuditGraphEntity[];
	milestones: ProjectAuditGraphEntity[];
	risks: ProjectAuditGraphEntity[];
	plans: ProjectAuditGraphEntity[];
	events: ProjectAuditGraphEntity[];
	recentActivity: ProjectAuditActivityRow[];
	priorAudits: ProjectAuditGraphEntity[];
	unresolvedAuditSuggestions: ProjectAuditGraphEntity[];
	openInboxItems: ProjectAuditGraphEntity[];
	maturity: ProjectAuditMaturitySnapshot;
	sizeClass: ProjectAuditSizeClass;
	fingerprint: string;
};

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

type BurstMetrics = {
	score72h: number;
	score7d: number;
	changedEntities72h: number;
	changedEntities7d: number;
	majorChanges72h: number;
	lastMajorMutationAt: string | null;
	quietUntil: string | null;
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

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asArray(value: unknown): ProjectAuditGraphEntity[] {
	return Array.isArray(value)
		? value.filter((item): item is ProjectAuditGraphEntity => Boolean(asRecord(item)))
		: [];
}

function parseDateMs(value: unknown): number | null {
	const text = asString(value);
	if (!text) return null;
	const parsed = Date.parse(text);
	return Number.isFinite(parsed) ? parsed : null;
}

function addMsIso(value: string | null | undefined, ms: number): string | null {
	const parsed = parseDateMs(value);
	return parsed === null ? null : new Date(parsed + ms).toISOString();
}

function countWords(value: unknown): number {
	const text = asString(value);
	if (!text) return 0;
	return text.split(/\s+/).filter(Boolean).length;
}

function hasDateField(entity: ProjectAuditGraphEntity): boolean {
	return [
		'due_at',
		'due_date',
		'start_at',
		'start_date',
		'end_at',
		'end_date',
		'target_at',
		'target_date',
		'scheduled_for'
	].some((field) => Boolean(asString(entity[field])));
}

function isDeleted(entity: ProjectAuditGraphEntity): boolean {
	return Boolean(asString(entity.deleted_at)) || entity.deleted === true;
}

function activeDocuments(documents: ProjectAuditGraphEntity[]): ProjectAuditGraphEntity[] {
	return documents.filter((doc) => {
		if (isDeleted(doc)) return false;
		const state = asString(doc.state_key);
		return state !== 'archived';
	});
}

function activeTasks(tasks: ProjectAuditGraphEntity[]): ProjectAuditGraphEntity[] {
	return tasks.filter((task) => !isDeleted(task));
}

function hasSubstantialDocument(documents: ProjectAuditGraphEntity[]): boolean {
	return documents.some((doc) => {
		const bodyWordCount = Math.max(
			countWords(doc.content),
			countWords(doc.body),
			countWords(doc.markdown),
			countWords(doc.description)
		);
		return bodyWordCount >= 1500;
	});
}

function activityDayCount(rows: ProjectAuditActivityRow[]): number {
	const days = new Set<string>();
	for (const row of rows) {
		const createdAt = asString(row.created_at);
		if (createdAt) days.add(createdAt.slice(0, 10));
	}
	return days.size;
}

function computeProjectAgeDays(createdAt: string | null, now: Date): number | null {
	const createdMs = parseDateMs(createdAt);
	if (createdMs === null) return null;
	const age = Math.floor((now.getTime() - createdMs) / (24 * 60 * 60 * 1000));
	return Math.max(0, age);
}

export function buildProjectAuditMaturitySnapshot(params: {
	project: ProjectAuditSnapshot['project'];
	documents: ProjectAuditGraphEntity[];
	tasks: ProjectAuditGraphEntity[];
	goals: ProjectAuditGraphEntity[];
	milestones: ProjectAuditGraphEntity[];
	risks: ProjectAuditGraphEntity[];
	plans: ProjectAuditGraphEntity[];
	events: ProjectAuditGraphEntity[];
	recentActivity: ProjectAuditActivityRow[];
	manualBypass?: boolean;
	now?: Date;
}): ProjectAuditMaturitySnapshot {
	const now = params.now ?? new Date();
	const documents = activeDocuments(params.documents);
	const tasks = activeTasks(params.tasks);
	const goalCount = params.goals.length;
	const milestoneCount = params.milestones.length;
	const riskCount = params.risks.length;
	const planCount = params.plans.length;
	const eventCount = params.events.length;
	const totalEntities =
		documents.length +
		tasks.length +
		goalCount +
		milestoneCount +
		riskCount +
		planCount +
		eventCount;
	const descriptionWords = countWords(params.project.description);
	const projectAgeDays = computeProjectAgeDays(params.project.created_at, now);
	const activityDays = activityDayCount(params.recentActivity);
	const hasGoalOrSubstantialDescription = goalCount > 0 || descriptionWords >= 80;
	const datedCommitment =
		Boolean(params.project.end_at) ||
		params.tasks.some(hasDateField) ||
		params.milestones.some(hasDateField) ||
		params.events.some(hasDateField);
	const flags = {
		active_documents: documents.length >= 5,
		substantial_document: hasSubstantialDocument(params.documents),
		non_deleted_tasks: tasks.length >= 5,
		goals_milestones_or_success_criteria: goalCount + milestoneCount >= 2,
		dated_commitment: datedCommitment,
		total_entities: totalEntities >= 10
	};
	const contentThresholdsMet = [
		flags.active_documents || flags.substantial_document,
		flags.non_deleted_tasks,
		flags.goals_milestones_or_success_criteria,
		flags.dated_commitment,
		flags.total_entities
	].filter(Boolean).length;
	const activeOrPlanning =
		params.project.state_key === 'active' || params.project.state_key === 'planning';

	const ineligibleReasons: string[] = [];
	if (!activeOrPlanning) ineligibleReasons.push('project_not_active_or_planning');
	if (projectAgeDays !== null && projectAgeDays < 7) ineligibleReasons.push('project_too_new');
	if (activityDays < 2) ineligibleReasons.push('not_enough_activity_days');
	if (!hasGoalOrSubstantialDescription) {
		ineligibleReasons.push('missing_goal_or_substantial_description');
	}
	if (contentThresholdsMet < 3) ineligibleReasons.push('below_content_threshold');

	return {
		project_age_days: projectAgeDays,
		active_or_planning: activeOrPlanning,
		activity_day_count: activityDays,
		has_goal_or_substantial_description: hasGoalOrSubstantialDescription,
		content_thresholds_met: contentThresholdsMet,
		content_threshold_flags: flags,
		entity_counts: {
			documents: documents.length,
			tasks: tasks.length,
			goals: goalCount,
			milestones: milestoneCount,
			risks: riskCount,
			plans: planCount,
			events: eventCount,
			total: totalEntities
		},
		ineligible_reasons: ineligibleReasons,
		manual_bypass: Boolean(params.manualBypass)
	};
}

export function isProjectAuditBaselineEligible(snapshot: ProjectAuditMaturitySnapshot): boolean {
	return snapshot.ineligible_reasons.length === 0;
}

export function classifyProjectAuditSize(
	maturity: ProjectAuditMaturitySnapshot
): ProjectAuditSizeClass {
	const counts = maturity.entity_counts;
	if (!isProjectAuditBaselineEligible(maturity) && !maturity.manual_bypass) {
		return 'below_baseline';
	}
	if (
		counts.risks > 0 &&
		(counts.tasks >= 15 ||
			counts.total >= 30 ||
			maturity.content_threshold_flags.dated_commitment)
	) {
		return 'strategic';
	}
	if (counts.total >= 40 || counts.tasks >= 15 || counts.documents >= 15) return 'large';
	if (counts.total >= 15 || counts.documents + counts.tasks + counts.goals >= 15) return 'medium';
	return 'small_eligible';
}

export function auditSizeClassForInsert(
	sizeClass: ProjectAuditSizeClass
): Exclude<ProjectAuditSizeClass, 'below_baseline'> {
	return sizeClass === 'below_baseline' ? 'small_eligible' : sizeClass;
}

export function buildProjectAuditSnapshotFingerprint(snapshot: {
	project: ProjectAuditSnapshot['project'];
	documents: ProjectAuditGraphEntity[];
	tasks: ProjectAuditGraphEntity[];
	goals: ProjectAuditGraphEntity[];
	milestones: ProjectAuditGraphEntity[];
	risks: ProjectAuditGraphEntity[];
	plans: ProjectAuditGraphEntity[];
	events: ProjectAuditGraphEntity[];
	maturity: ProjectAuditMaturitySnapshot;
}): string {
	const compactEntity = (entity: ProjectAuditGraphEntity) => ({
		id: asString(entity.id),
		title: asString(entity.title) ?? asString(entity.name),
		state_key: asString(entity.state_key),
		updated_at: asString(entity.updated_at) ?? asString(entity.created_at)
	});
	const payload = {
		project: {
			id: snapshot.project.id,
			name: snapshot.project.name,
			description: snapshot.project.description,
			state_key: snapshot.project.state_key,
			updated_at: snapshot.project.updated_at
		},
		documents: snapshot.documents.map(compactEntity),
		tasks: snapshot.tasks.map(compactEntity),
		goals: snapshot.goals.map(compactEntity),
		milestones: snapshot.milestones.map(compactEntity),
		risks: snapshot.risks.map(compactEntity),
		plans: snapshot.plans.map(compactEntity),
		events: snapshot.events.map(compactEntity),
		maturity: snapshot.maturity
	};
	return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function loadProjectAuditSnapshot(params: {
	supabase: AnySupabase;
	projectId: string;
	manualBypass?: boolean;
	now?: Date;
}): Promise<ProjectAuditSnapshot | null> {
	const { data: projectRow, error: projectError } = await params.supabase
		.from('onto_projects')
		.select(
			'id, name, description, state_key, created_at, updated_at, start_at, end_at, deleted_at, archived_at'
		)
		.eq('id', params.projectId)
		.maybeSingle();

	if (projectError) throw projectError;
	if (!projectRow || projectRow.deleted_at || projectRow.archived_at) return null;

	const [graphRes, activityRes, priorAuditsRes, unresolvedAuditSuggestionsRes, inboxRes] =
		await Promise.all([
			params.supabase.rpc('load_project_graph_context', { p_project_id: params.projectId }),
			params.supabase
				.from('onto_project_logs')
				.select(
					'id, entity_type, entity_id, action, change_source, created_at, before_data, after_data'
				)
				.eq('project_id', params.projectId)
				.order('created_at', { ascending: false })
				.limit(RECENT_ACTIVITY_LIMIT),
			params.supabase
				.from('project_audits')
				.select(
					'id, status, trigger_reason, delivery_confidence, summary, finished_at, created_at'
				)
				.eq('project_id', params.projectId)
				.in('status', ['ready', 'reviewed', 'superseded'])
				.order('created_at', { ascending: false })
				.limit(PRIOR_AUDIT_LIMIT),
			params.supabase
				.from('project_suggestions')
				.select('id, title, status, risk_tier, why_now, rationale, updated_at')
				.eq('project_id', params.projectId)
				.in('status', ['pending', 'delegated', 'failed'])
				.order('updated_at', { ascending: false })
				.limit(30),
			params.supabase
				.from('inbox_items')
				.select(
					'id, source_type, source_ref_id, source_status, status, title, summary, created_at'
				)
				.eq('project_id', params.projectId)
				.in('status', ['pending', 'deciding', 'blocked'])
				.order('created_at', { ascending: false })
				.limit(30)
		]);

	if (graphRes.error) throw graphRes.error;
	if (activityRes.error) throw activityRes.error;
	if (priorAuditsRes.error) throw priorAuditsRes.error;
	if (unresolvedAuditSuggestionsRes.error) throw unresolvedAuditSuggestionsRes.error;
	if (inboxRes.error) throw inboxRes.error;

	const graph = asRecord(graphRes.data) ?? {};
	const project = {
		id: projectRow.id as string,
		name: (projectRow.name as string | null) ?? 'Untitled project',
		description: (projectRow.description as string | null) ?? null,
		state_key: (projectRow.state_key as string | null) ?? null,
		created_at: (projectRow.created_at as string | null) ?? null,
		updated_at: (projectRow.updated_at as string | null) ?? null,
		start_at: (projectRow.start_at as string | null) ?? null,
		end_at: (projectRow.end_at as string | null) ?? null,
		deleted_at: (projectRow.deleted_at as string | null) ?? null,
		archived_at: (projectRow.archived_at as string | null) ?? null
	};
	const documents = asArray(graph.documents);
	const tasks = asArray(graph.tasks);
	const goals = asArray(graph.goals);
	const milestones = asArray(graph.milestones);
	const risks = asArray(graph.risks);
	const plans = asArray(graph.plans);
	const events = asArray(graph.events);
	const recentActivity = ((activityRes.data ?? []) as ProjectAuditActivityRow[]).map((row) => ({
		id: row.id ?? null,
		entity_type: row.entity_type ?? null,
		entity_id: row.entity_id ?? null,
		action: row.action ?? null,
		change_source: row.change_source ?? null,
		created_at: row.created_at ?? null,
		before_data: row.before_data,
		after_data: row.after_data
	}));
	const maturity = buildProjectAuditMaturitySnapshot({
		project,
		documents,
		tasks,
		goals,
		milestones,
		risks,
		plans,
		events,
		recentActivity,
		manualBypass: params.manualBypass,
		now: params.now
	});
	const sizeClass = classifyProjectAuditSize(maturity);
	const fingerprint = buildProjectAuditSnapshotFingerprint({
		project,
		documents,
		tasks,
		goals,
		milestones,
		risks,
		plans,
		events,
		maturity
	});

	return {
		project,
		documents,
		tasks,
		goals,
		milestones,
		risks,
		plans,
		events,
		recentActivity,
		priorAudits: asArray(priorAuditsRes.data),
		unresolvedAuditSuggestions: asArray(unresolvedAuditSuggestionsRes.data),
		openInboxItems: asArray(inboxRes.data),
		maturity,
		sizeClass,
		fingerprint
	};
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

export function buildProjectAuditTriggerSnapshot(
	evaluation: ProjectAuditTriggerEvaluationDraft
): ProjectAuditTriggerSnapshot {
	return {
		trigger_reason: evaluation.trigger_reason,
		evaluated_at: evaluation.evaluated_at,
		eligible: evaluation.eligible,
		project_size_class: evaluation.project_size_class,
		maturity_snapshot: evaluation.maturity_snapshot,
		burst_score: evaluation.burst_score,
		changed_entity_count: evaluation.changed_entity_count,
		major_change_count: evaluation.major_change_count,
		quiet_until: evaluation.quiet_until,
		cooldown_until: evaluation.cooldown_until,
		last_audit_id: evaluation.last_audit_id,
		reason_summary: evaluation.reason_summary
	};
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
