// apps/web/src/lib/services/ontology/task-migration.service.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database, Json } from '@buildos/shared-types';
import type {
	MigrationServiceContext,
	MigrationStatus,
	TaskClassificationSummary,
	TaskMigrationBatchResult,
	TaskMigrationPreviewPayload,
	TaskMigrationRecord,
	TaskMigrationPreviewSummary
} from './migration.types';
import { getLegacyMapping, upsertLegacyMapping } from './legacy-mapping.service';

export type LegacyTaskRow = Database['public']['Tables']['tasks']['Row'];

export class TaskMigrationService {
	constructor(private readonly client: TypedSupabaseClient) {}

	async migrateTasks(
		projectId: string,
		ontoProjectId: string | null,
		actorId: string,
		context: MigrationServiceContext,
		phasePlanMapping?: Record<string, string | null>
	): Promise<TaskMigrationBatchResult> {
		const tasks = await this.fetchTasks(projectId);
		const taskIds = tasks.map((task) => task.id);
		const phaseMap = await this.buildTaskPhaseMap(taskIds);
		const uniquePhaseIds = Array.from(
			new Set(Object.values(phaseMap).filter((id): id is string => Boolean(id)))
		);
		const phaseMetadata = await this.fetchPhaseMetadata(uniquePhaseIds);
		const resolvedPhasePlanMapping = await this.resolvePhasePlanMapping(
			phasePlanMapping,
			uniquePhaseIds
		);
		const eventCounts = await this.fetchTaskEventCounts(taskIds);
		const results: TaskMigrationRecord[] = [];
		const mappings: Record<string, string | null> = {};
		const summary: TaskMigrationPreviewSummary = {
			total: tasks.length,
			alreadyMigrated: 0,
			readyToMigrate: 0,
			blocked: 0,
			missingProject: 0
		};

		if (!tasks.length) {
			return {
				projectId,
				ontoProjectId,
				tasks: results,
				taskMappings: mappings,
				summary,
				preview: this.buildPreview(summary, results)
			};
		}

		if (!ontoProjectId) {
			for (const task of tasks) {
				const classification = this.classifyTask(task);
				const phaseId = phaseMap[task.id] ?? null;
				const recommendedStateKey = this.mapTaskState(task.status);
				const dueAt = this.resolveDueAt(task);
				const priority = this.mapPriority(task.priority);
				const facetScale = classification.requiresDeepWork ? 'medium' : 'small';
				const proposedPayload = this.buildProposedPayload({
					task,
					classification,
					recommendedStateKey,
					dueAt,
					priority,
					facetScale,
					suggestedPlanId: null
				});

				results.push({
					legacyTaskId: task.id,
					title: task.title,
					legacyStatus: task.status,
					ontoTaskId: null,
					phaseId,
					phaseName: phaseId ? (phaseMetadata.get(phaseId) ?? null) : null,
					suggestedOntoPlanId: null,
					recommendedTypeKey: classification.typeKey,
					recommendedStateKey,
					dueAt,
					priority,
					facetScale,
					calendarEventCount: eventCounts.get(task.id) ?? 0,
					status: 'pending',
					notes: 'Project not migrated yet; task migration deferred.',
					classification,
					proposedPayload
				});
				mappings[task.id] = null;
				summary.missingProject += 1;
			}

			return {
				projectId,
				ontoProjectId,
				tasks: results,
				taskMappings: mappings,
				summary,
				preview: this.buildPreview(summary, results)
			};
		}

		for (const task of tasks) {
			const classification = this.classifyTask(task);
			const phaseId = phaseMap[task.id] ?? null;
			const suggestedPlanId = phaseId ? (phasePlanMapping[phaseId] ?? null) : null;
			const existingMapping = await getLegacyMapping(this.client, 'tasks', task.id);

			if (existingMapping?.onto_id) {
				results.push({
					legacyTaskId: task.id,
					ontoTaskId: existingMapping.onto_id,
					phaseId,
					suggestedOntoPlanId: suggestedPlanId,
					recommendedTypeKey: classification.typeKey,
					status: 'completed',
					notes: 'Task already migrated.',
					classification
				});
				mappings[task.id] = existingMapping.onto_id;
				continue;
			}

			if (context.dryRun) {
				const recommendedStateKey = this.mapTaskState(task.status);
				const dueAt = this.resolveDueAt(task);
				const priority = this.mapPriority(task.priority);
				const facetScale = classification.requiresDeepWork ? 'medium' : 'small';
				const proposedPayload = this.buildProposedPayload({
					task,
					classification,
					recommendedStateKey,
					dueAt,
					priority,
					facetScale,
					suggestedPlanId
				});

				results.push({
					legacyTaskId: task.id,
					title: task.title,
					legacyStatus: task.status,
					ontoTaskId: null,
					phaseId,
					phaseName: phaseId ? (phaseMetadata.get(phaseId) ?? null) : null,
					suggestedOntoPlanId: suggestedPlanId,
					recommendedTypeKey: classification.typeKey,
					recommendedStateKey,
					dueAt,
					priority,
					facetScale,
					calendarEventCount: eventCounts.get(task.id) ?? 0,
					status: 'pending',
					notes: 'Dry-run mode: ontology task not created.',
					classification,
					proposedPayload
				});
				mappings[task.id] = null;
				summary.readyToMigrate += 1;
				continue;
			}

			const recommendedStateKey = this.mapTaskState(task.status);
			const dueAt = this.resolveDueAt(task);
			const priority = this.mapPriority(task.priority);
			const facetScale = classification.requiresDeepWork ? 'medium' : 'small';
			const props = this.buildTaskProps(task, classification);

			const proposedPayload = this.buildProposedPayload({
				task,
				classification,
				recommendedStateKey,
				dueAt,
				priority,
				facetScale,
				suggestedPlanId,
				props
			});

			const { data, error } = await this.client
				.from('onto_tasks')
				.insert({
					title: task.title,
					project_id: ontoProjectId,
					plan_id: suggestedPlanId,
					state_key: recommendedStateKey,
					priority,
					due_at: dueAt,
					facet_scale: facetScale,
					props,
					created_by: actorId
				})
				.select('id')
				.single();

			if (error || !data) {
				results.push({
					legacyTaskId: task.id,
					title: task.title,
					legacyStatus: task.status,
					ontoTaskId: null,
					phaseId,
					phaseName: phaseId ? (phaseMetadata.get(phaseId) ?? null) : null,
					suggestedOntoPlanId: suggestedPlanId,
					recommendedTypeKey: classification.typeKey,
					recommendedStateKey,
					dueAt,
					priority,
					facetScale,
					calendarEventCount: eventCounts.get(task.id) ?? 0,
					status: 'failed',
					notes: `Failed to insert task: ${error?.message}`,
					classification,
					proposedPayload
				});
				mappings[task.id] = null;
				summary.blocked += 1;
				continue;
			}

			await upsertLegacyMapping(this.client, {
				legacyTable: 'tasks',
				legacyId: task.id,
				ontoTable: 'onto_tasks',
				ontoId: data.id,
				record: task,
				metadata: {
					run_id: context.runId,
					batch_id: context.batchId,
					dry_run: context.dryRun
				}
			});

			results.push({
				legacyTaskId: task.id,
				title: task.title,
				legacyStatus: task.status,
				ontoTaskId: data.id,
				phaseId,
				phaseName: phaseId ? (phaseMetadata.get(phaseId) ?? null) : null,
				suggestedOntoPlanId: suggestedPlanId,
				recommendedTypeKey: classification.typeKey,
				recommendedStateKey,
				dueAt,
				priority,
				facetScale,
				calendarEventCount: eventCounts.get(task.id) ?? 0,
				status: 'completed',
				notes: 'Task migrated successfully.',
				classification,
				proposedPayload
			});
			mappings[task.id] = data.id;
			summary.readyToMigrate += 1;
		}

		return {
			projectId,
			ontoProjectId,
			tasks: results,
			taskMappings: mappings,
			summary,
			preview: context.dryRun ? this.buildPreview(summary, results) : undefined
		};
	}

	private async fetchTasks(projectId: string): Promise<LegacyTaskRow[]> {
		const { data, error } = await this.client
			.from('tasks')
			.select('*')
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.order('created_at', { ascending: true });

		if (error) {
			throw new Error(
				`[TaskMigration] Failed to load tasks for ${projectId}: ${error.message}`
			);
		}

		return data ?? [];
	}

	private async fetchPhaseMetadata(phaseIds: string[]): Promise<Map<string, string | null>> {
		if (!phaseIds.length) {
			return new Map();
		}

		const { data, error } = await this.client
			.from('phases')
			.select('id, name')
			.in('id', phaseIds);

		if (error) {
			throw new Error(`[TaskMigration] Failed to load phase metadata: ${error.message}`);
		}

		return new Map((data ?? []).map((row) => [row.id, row.name ?? null]));
	}

	private async resolvePhasePlanMapping(
		initialMapping: Record<string, string | null> | undefined,
		phaseIds: string[]
	): Promise<Record<string, string | null>> {
		const mapping: Record<string, string | null> = { ...(initialMapping ?? {}) };
		const missingIds = phaseIds.filter((phaseId) => !(phaseId in mapping));

		if (!missingIds.length) {
			return mapping;
		}

		const fetched = await this.fetchPhasePlanMappings(missingIds);
		return { ...mapping, ...fetched };
	}

	private async fetchPhasePlanMappings(
		phaseIds: string[]
	): Promise<Record<string, string | null>> {
		if (!phaseIds.length) {
			return {};
		}

		const { data, error } = await this.client
			.from('legacy_entity_mappings')
			.select('legacy_id, onto_id')
			.eq('legacy_table', 'phases')
			.in('legacy_id', phaseIds);

		if (error) {
			throw new Error(
				`[TaskMigration] Failed to fetch phase plan mappings: ${error.message}`
			);
		}

		return (data ?? []).reduce<Record<string, string | null>>((acc, row) => {
			acc[row.legacy_id] = row.onto_id ?? null;
			return acc;
		}, {});
	}

	private async fetchTaskEventCounts(taskIds: string[]): Promise<Map<string, number>> {
		if (!taskIds.length) {
			return new Map();
		}

		const { data, error } = await this.client
			.from('task_calendar_events')
			.select('task_id')
			.in('task_id', taskIds);

		if (error) {
			throw new Error(`[TaskMigration] Failed to count calendar events: ${error.message}`);
		}

		const counts = new Map<string, number>();
		for (const row of data ?? []) {
			const current = counts.get(row.task_id) ?? 0;
			counts.set(row.task_id, current + 1);
		}

		return counts;
	}

	private async buildTaskPhaseMap(taskIds: string[]): Promise<Record<string, string>> {
		if (!taskIds.length) {
			return {};
		}

		const { data, error } = await this.client
			.from('phase_tasks')
			.select('task_id, phase_id')
			.in('task_id', taskIds);

		if (error) {
			throw new Error(
				`[TaskMigration] Failed to resolve phase relationships: ${error.message}`
			);
		}

		const lookup: Record<string, string> = {};
		for (const row of data ?? []) {
			lookup[row.task_id] = row.phase_id;
		}

		return lookup;
	}

	private resolveDueAt(task: LegacyTaskRow): string | null {
		return task.start_date ?? task.completed_at ?? null;
	}

	private buildPreview(
		summary: TaskMigrationPreviewSummary,
		tasks: TaskMigrationRecord[]
	): TaskMigrationPreviewPayload {
		return {
			summary: { ...summary },
			tasks
		};
	}

	private buildTaskProps(task: LegacyTaskRow, classification: TaskClassificationSummary): Json {
		return {
			legacy_task_id: task.id,
			description: task.description,
			details: task.details,
			task_type: task.task_type,
			dependencies: task.dependencies,
			recurrence: task.recurrence_pattern
				? {
						pattern: task.recurrence_pattern,
						ends: task.recurrence_ends,
						end_source: task.recurrence_end_source
					}
				: null,
			source_calendar_event_id: task.source_calendar_event_id,
			source: task.source,
			classification
		};
	}

	private buildProposedPayload(params: {
		task: LegacyTaskRow;
		classification: TaskClassificationSummary;
		recommendedStateKey: string;
		dueAt: string | null;
		priority: number | null;
		facetScale: string | null;
		suggestedPlanId: string | null;
		props?: Json;
	}): Json {
		return {
			title: params.task.title,
			state_key: params.recommendedStateKey,
			plan_id: params.suggestedPlanId,
			due_at: params.dueAt,
			priority: params.priority,
			facet_scale: params.facetScale,
			props: params.props ?? this.buildTaskProps(params.task, params.classification)
		} as Json;
	}

	private classifyTask(task: LegacyTaskRow): TaskClassificationSummary {
		const isRecurring = !!task.recurrence_pattern;
		const requiresDeepWork = (task.duration_minutes ?? 0) >= 120;
		const complexity = requiresDeepWork
			? 'complex'
			: (task.duration_minutes ?? 0) >= 60
				? 'moderate'
				: 'simple';

		const typeKey = isRecurring
			? 'task.recurring'
			: requiresDeepWork
				? 'task.deep_work'
				: 'task.base';

		return {
			typeKey,
			complexity,
			requiresDeepWork,
			isRecurring,
			reasoning: 'Heuristic placeholder – replace with LLM classification pipeline.'
		};
	}

	private mapTaskState(status: LegacyTaskRow['status']): string {
		switch (status) {
			case 'completed':
				return 'done';
			case 'in_progress':
				return 'active';
			case 'cancelled':
				return 'cancelled';
			default:
				return 'backlog';
		}
	}

	private mapPriority(priority: LegacyTaskRow['priority']): number {
		switch (priority) {
			case 'urgent':
				return 5;
			case 'high':
				return 4;
			case 'medium':
				return 3;
			case 'low':
				return 2;
			default:
				return 1;
		}
	}
}
