// apps/web/src/lib/server/project-audit-snapshot.service.ts
import { createHash } from 'crypto';
import type { ProjectAuditMaturitySnapshot, ProjectAuditSizeClass } from '@buildos/shared-types';

type AnySupabase = any;

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

const RECENT_ACTIVITY_LIMIT = 500;
const PRIOR_AUDIT_LIMIT = 5;

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

	if (params.manualBypass) {
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
			manual_bypass: true
		};
	}

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
		manual_bypass: false
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
