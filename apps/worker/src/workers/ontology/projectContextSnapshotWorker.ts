// apps/worker/src/workers/ontology/projectContextSnapshotWorker.ts
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { supabase } from '../../lib/supabase';

const SNAPSHOT_VERSION = 1;
const SNAPSHOT_TTL_MS = 15 * 60 * 1000; // 15 minutes
const AUTO_ICON_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const PROJECT_ICON_GENERATION_ENABLED =
	String(process.env.ENABLE_PROJECT_ICON_GENERATION ?? 'false').toLowerCase() === 'true';

type ProjectGraphDataLight = {
	project: any;
	tasks: any[];
	goals: any[];
	plans: any[];
	documents: any[];
	milestones: any[];
	risks: any[];
	requirements: any[];
	signals: any[];
	insights: any[];
	edges: any[];
};

function isReadyForAutoIcon(project: {
	taskCount: number;
	goalCount: number;
	documentCount: number;
	description?: string | null;
	iconSvg?: string | null;
}): boolean {
	const totalEntities = project.taskCount + project.goalCount + project.documentCount;
	return totalEntities >= 3 && Boolean(project.description?.trim()) && !project.iconSvg;
}

async function queueAutoProjectIconGeneration(params: {
	projectId: string;
	userId: string;
	taskCount: number;
	goalCount: number;
	documentCount: number;
	description?: string | null;
	iconSvg?: string | null;
}) {
	if (!PROJECT_ICON_GENERATION_ENABLED) {
		return { queued: false, reason: 'feature_disabled' as const };
	}

	const ready = isReadyForAutoIcon({
		taskCount: params.taskCount,
		goalCount: params.goalCount,
		documentCount: params.documentCount,
		description: params.description,
		iconSvg: params.iconSvg
	});

	if (!ready) {
		return { queued: false, reason: 'readiness_not_met' as const };
	}

	const { data: latestAutoGeneration, error: latestAutoGenerationError } = await (supabase as any)
		.from('onto_project_icon_generations')
		.select('id, created_at')
		.eq('project_id', params.projectId)
		.eq('trigger_source', 'auto')
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (latestAutoGenerationError) {
		throw new Error(
			`Failed checking icon generation cooldown: ${latestAutoGenerationError.message}`
		);
	}

	if (latestAutoGeneration?.created_at) {
		const createdAtMs = Date.parse(latestAutoGeneration.created_at);
		if (!Number.isNaN(createdAtMs) && Date.now() - createdAtMs < AUTO_ICON_COOLDOWN_MS) {
			return { queued: false, reason: 'cooldown_active' as const };
		}
	}

	const { data: generationRow, error: generationCreateError } = await (supabase as any)
		.from('onto_project_icon_generations')
		.insert({
			project_id: params.projectId,
			requested_by: params.userId,
			trigger_source: 'auto',
			steering_prompt: null,
			candidate_count: 1,
			status: 'queued'
		})
		.select('id')
		.single();

	if (generationCreateError || !generationRow?.id) {
		throw new Error(
			`Failed creating auto icon generation row: ${generationCreateError?.message}`
		);
	}

	const generationId = generationRow.id as string;
	const { error: queueError } = await supabase.rpc('add_queue_job', {
		p_user_id: params.userId,
		p_job_type: 'generate_project_icon',
		p_metadata: {
			generationId,
			projectId: params.projectId,
			requestedByUserId: params.userId,
			triggerSource: 'auto',
			candidateCount: 1,
			autoSelect: true
		},
		p_priority: 9,
		p_scheduled_for: new Date().toISOString(),
		p_dedup_key: `project-icon:auto:${params.projectId}`
	});

	if (queueError) {
		await (supabase as any)
			.from('onto_project_icon_generations')
			.update({
				status: 'failed',
				error_message: queueError.message,
				completed_at: new Date().toISOString()
			})
			.eq('id', generationId)
			.eq('project_id', params.projectId);

		throw new Error(`Failed queueing auto icon generation: ${queueError.message}`);
	}

	return { queued: true, reason: 'queued' as const, generationId };
}

const HIGHLIGHT_LIMITS = {
	goals: 10,
	risks: 6,
	requirements: 8,
	documents: 10,
	milestones: 6,
	plans: 6,
	signals: 6,
	insights: 6,
	tasksRecent: 10,
	tasksUpcoming: 5
} as const;

const HIGHLIGHT_TRUNCATION = {
	documentDescription: 180,
	requirementText: 160,
	taskDescription: 120,
	goalDescription: 140,
	planDescription: 140,
	milestoneDescription: 140,
	riskContent: 160,
	signalPayload: 160
} as const;

const truncateText = (value: string | null | undefined, limit: number): string | null => {
	if (!value) return null;
	const trimmed = value.trim();
	if (trimmed.length <= limit) return trimmed;
	return `${trimmed.slice(0, limit).trimEnd()}...`;
};

const buildHighlightSection = <T>(items: T[], totalCount?: number) => {
	const more =
		typeof totalCount === 'number' && totalCount > items.length ? totalCount - items.length : 0;
	return more > 0 ? { items, more } : { items };
};

const sortByUpdated = <T extends { updated_at?: string | null; created_at?: string | null }>(
	items: T[]
) => {
	return [...items].sort((a, b) => {
		const aDate = a.updated_at || a.created_at || '';
		const bDate = b.updated_at || b.created_at || '';
		return Date.parse(bDate) - Date.parse(aDate);
	});
};

const buildProjectHighlights = (graph: ProjectGraphDataLight) => {
	const goals = buildHighlightSection(
		sortByUpdated(graph.goals)
			.slice(0, HIGHLIGHT_LIMITS.goals)
			.map((goal) => ({
				id: goal.id,
				name: goal.name || goal.goal || 'Untitled goal',
				state_key: goal.state_key,
				type_key: goal.type_key,
				description: truncateText(goal.description, HIGHLIGHT_TRUNCATION.goalDescription),
				created_at: goal.created_at,
				updated_at: goal.updated_at,
				target_date: goal.target_date,
				completed_at: goal.completed_at
			})),
		graph.goals.length
	);

	const risks = buildHighlightSection(
		sortByUpdated(graph.risks)
			.slice(0, HIGHLIGHT_LIMITS.risks)
			.map((risk) => ({
				id: risk.id,
				title: risk.title,
				state_key: risk.state_key,
				type_key: risk.type_key,
				impact: risk.impact,
				probability: risk.probability,
				content: truncateText(risk.content, HIGHLIGHT_TRUNCATION.riskContent),
				created_at: risk.created_at,
				updated_at: risk.updated_at,
				mitigated_at: risk.mitigated_at
			})),
		graph.risks.length
	);

	const requirements = buildHighlightSection(
		sortByUpdated(graph.requirements)
			.slice(0, HIGHLIGHT_LIMITS.requirements)
			.map((req) => ({
				id: req.id,
				text: truncateText(req.text, HIGHLIGHT_TRUNCATION.requirementText) ?? '',
				priority: req.priority,
				type_key: req.type_key,
				created_at: req.created_at,
				updated_at: req.updated_at
			})),
		graph.requirements.length
	);

	const documents = buildHighlightSection(
		sortByUpdated(graph.documents)
			.slice(0, HIGHLIGHT_LIMITS.documents)
			.map((doc) => ({
				id: doc.id,
				title: doc.title,
				state_key: doc.state_key,
				type_key: doc.type_key,
				description: truncateText(
					doc.description,
					HIGHLIGHT_TRUNCATION.documentDescription
				),
				created_at: doc.created_at,
				updated_at: doc.updated_at
			})),
		graph.documents.length
	);

	const milestones = buildHighlightSection(
		sortByUpdated(graph.milestones)
			.slice(0, HIGHLIGHT_LIMITS.milestones)
			.map((ms) => ({
				id: ms.id,
				title: ms.title,
				due_at: ms.due_at,
				state_key: ms.state_key,
				type_key: ms.type_key,
				description: truncateText(
					ms.description,
					HIGHLIGHT_TRUNCATION.milestoneDescription
				),
				created_at: ms.created_at,
				updated_at: ms.updated_at,
				completed_at: ms.completed_at
			})),
		graph.milestones.length
	);

	const plans = buildHighlightSection(
		sortByUpdated(graph.plans)
			.slice(0, HIGHLIGHT_LIMITS.plans)
			.map((plan) => ({
				id: plan.id,
				name: plan.name || 'Untitled plan',
				state_key: plan.state_key,
				type_key: plan.type_key,
				description: truncateText(plan.description, HIGHLIGHT_TRUNCATION.planDescription),
				created_at: plan.created_at,
				updated_at: plan.updated_at
			})),
		graph.plans.length
	);

	const signals = buildHighlightSection(
		sortByUpdated(graph.signals)
			.slice(0, HIGHLIGHT_LIMITS.signals)
			.map((signal) => ({
				id: signal.id,
				channel: signal.channel,
				ts: signal.ts,
				created_at: signal.created_at,
				payload_summary: truncateText(
					typeof signal.payload === 'string'
						? signal.payload
						: JSON.stringify(signal.payload),
					HIGHLIGHT_TRUNCATION.signalPayload
				)
			})),
		graph.signals.length
	);

	const insights = buildHighlightSection(
		sortByUpdated(graph.insights)
			.slice(0, HIGHLIGHT_LIMITS.insights)
			.map((insight) => ({
				id: insight.id,
				title: insight.title,
				created_at: insight.created_at,
				derived_from_signal_id: insight.derived_from_signal_id,
				summary: truncateText(
					typeof insight.props === 'string'
						? insight.props
						: JSON.stringify(insight.props),
					HIGHLIGHT_TRUNCATION.signalPayload
				)
			})),
		graph.insights.length
	);

	const now = Date.now();
	const upcomingCutoff = now + 7 * 24 * 60 * 60 * 1000;
	const recentTasks = sortByUpdated(graph.tasks).filter((task) => task.state_key !== 'done');
	const tasksRecent = buildHighlightSection(
		recentTasks.slice(0, HIGHLIGHT_LIMITS.tasksRecent).map((task) => ({
			id: task.id,
			title: task.title,
			state_key: task.state_key,
			type_key: task.type_key,
			priority: task.priority,
			description: truncateText(task.description, HIGHLIGHT_TRUNCATION.taskDescription),
			updated_at: task.updated_at,
			start_at: task.start_at,
			due_at: task.due_at,
			created_at: task.created_at,
			completed_at: task.completed_at
		})),
		recentTasks.length
	);

	const upcomingTasks = graph.tasks
		.filter((task) => task.state_key !== 'done')
		.filter((task) => {
			const due = task.due_at ? Date.parse(task.due_at) : null;
			const start = task.start_at ? Date.parse(task.start_at) : null;
			return (
				(due && due >= now && due <= upcomingCutoff) ||
				(start && start >= now && start <= upcomingCutoff)
			);
		})
		.sort((a, b) => {
			const aDue = a.due_at ? Date.parse(a.due_at) : Number.POSITIVE_INFINITY;
			const bDue = b.due_at ? Date.parse(b.due_at) : Number.POSITIVE_INFINITY;
			return aDue - bDue;
		});

	const tasksUpcoming = buildHighlightSection(
		upcomingTasks.slice(0, HIGHLIGHT_LIMITS.tasksUpcoming).map((task) => ({
			id: task.id,
			title: task.title,
			state_key: task.state_key,
			type_key: task.type_key,
			priority: task.priority,
			description: truncateText(task.description, HIGHLIGHT_TRUNCATION.taskDescription),
			updated_at: task.updated_at,
			start_at: task.start_at,
			due_at: task.due_at,
			created_at: task.created_at,
			completed_at: task.completed_at
		})),
		upcomingTasks.length
	);

	return {
		goals,
		risks,
		requirements,
		documents,
		milestones,
		plans,
		signals,
		insights,
		tasks: {
			recent: tasksRecent,
			upcoming: tasksUpcoming
		}
	};
};

const buildEntityCounts = (graph: ProjectGraphDataLight) => ({
	project: graph.project ? 1 : 0,
	tasks: graph.tasks.length,
	goals: graph.goals.length,
	plans: graph.plans.length,
	documents: graph.documents.length,
	milestones: graph.milestones.length,
	risks: graph.risks.length,
	requirements: graph.requirements.length,
	signals: graph.signals.length,
	insights: graph.insights.length,
	edges: graph.edges.length
});

export async function processProjectContextSnapshotJob(
	job: ProcessingJob<{ projectId: string; reason?: string; force?: boolean }>
) {
	const start = Date.now();
	const projectId = job.data.projectId;

	await job.log(`Snapshot build started for project ${projectId}`);

	try {
		if (!projectId) {
			throw new Error('projectId is required');
		}

		const { data: existing, error: existingError } = await (supabase as any)
			.from('project_context_snapshot')
			.select('computed_at')
			.eq('project_id', projectId)
			.maybeSingle();

		if (!existingError && existing?.computed_at && !job.data.force) {
			const computedAt = Date.parse(existing.computed_at);
			if (computedAt && Date.now() - computedAt < SNAPSHOT_TTL_MS) {
				await job.log('Snapshot is fresh; skipping rebuild');
				await (supabase as any).from('project_context_snapshot_metrics').insert({
					project_id: projectId,
					snapshot_version: SNAPSHOT_VERSION,
					status: 'skipped',
					duration_ms: 0,
					computed_at: new Date().toISOString(),
					queue_job_id: job.id
				});
				return { success: true, projectId, skipped: true };
			}
		}

		const { data: graphData, error: graphError } = await supabase.rpc(
			'load_project_graph_context',
			{
				p_project_id: projectId
			}
		);

		if (graphError) {
			throw new Error(`Failed to load project graph: ${graphError.message}`);
		}

		const payload = graphData as any;
		if (!payload?.project) {
			throw new Error('Project not found or access denied');
		}

		const graph: ProjectGraphDataLight = {
			project: payload.project,
			tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
			goals: Array.isArray(payload.goals) ? payload.goals : [],
			plans: Array.isArray(payload.plans) ? payload.plans : [],
			documents: Array.isArray(payload.documents) ? payload.documents : [],
			milestones: Array.isArray(payload.milestones) ? payload.milestones : [],
			risks: Array.isArray(payload.risks) ? payload.risks : [],
			requirements: Array.isArray(payload.requirements) ? payload.requirements : [],
			signals: Array.isArray(payload.signals) ? payload.signals : [],
			insights: Array.isArray(payload.insights) ? payload.insights : [],
			edges: Array.isArray(payload.edges) ? payload.edges : []
		};

		const { data: projectRow, error: projectError } = await (supabase as any)
			.from('onto_projects')
			.select('doc_structure, updated_at, description, icon_svg')
			.eq('id', projectId)
			.maybeSingle();

		if (projectError) {
			throw new Error(`Failed to load project doc_structure: ${projectError.message}`);
		}

		const facets = {
			context: graph.project.facet_context ?? null,
			scale: graph.project.facet_scale ?? null,
			stage: graph.project.facet_stage ?? null
		};

		const context = {
			type: 'project',
			entities: {
				project: graph.project
			},
			metadata: {
				entity_count: buildEntityCounts(graph),
				facets,
				last_updated: new Date().toISOString(),
				project_highlights: buildProjectHighlights(graph),
				doc_structure: projectRow?.doc_structure ?? null
			},
			scope: {
				projectId: graph.project.id,
				projectName: graph.project.name
			}
		};

		const duration = Date.now() - start;

		const { error: upsertError } = await (supabase as any)
			.from('project_context_snapshot')
			.upsert({
				project_id: projectId,
				snapshot: context,
				snapshot_version: SNAPSHOT_VERSION,
				source_updated_at: projectRow?.updated_at ?? graph.project.updated_at ?? null,
				computed_at: new Date().toISOString(),
				compute_ms: duration
			});

		if (upsertError) {
			throw new Error(`Failed to upsert snapshot: ${upsertError.message}`);
		}

		await (supabase as any).from('project_context_snapshot_metrics').insert({
			project_id: projectId,
			snapshot_version: SNAPSHOT_VERSION,
			status: 'success',
			duration_ms: duration,
			computed_at: new Date().toISOString(),
			queue_job_id: job.id
		});

		try {
			const autoResult = await queueAutoProjectIconGeneration({
				projectId,
				userId: job.userId,
				taskCount: graph.tasks.length,
				goalCount: graph.goals.length,
				documentCount: graph.documents.length,
				description: projectRow?.description ?? graph.project.description ?? null,
				iconSvg: projectRow?.icon_svg ?? graph.project.icon_svg ?? null
			});
			if (autoResult.queued) {
				await job.log(`Auto icon generation queued (${autoResult.generationId})`);
			} else {
				await job.log(`Auto icon generation skipped (${autoResult.reason})`);
			}
		} catch (autoQueueError: any) {
			await job.log(`Auto icon generation trigger failed: ${autoQueueError.message}`);
		}

		await job.log(`Snapshot build completed in ${duration}ms`);
		return { success: true, projectId, duration_ms: duration };
	} catch (error: any) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		await job.log(`Snapshot build failed: ${message}`);
		if (projectId) {
			await (supabase as any).from('project_context_snapshot_metrics').insert({
				project_id: projectId,
				snapshot_version: SNAPSHOT_VERSION,
				status: 'failed',
				duration_ms: Date.now() - start,
				computed_at: new Date().toISOString(),
				queue_job_id: job.id,
				error_message: message
			});
		}
		throw error;
	}
}
