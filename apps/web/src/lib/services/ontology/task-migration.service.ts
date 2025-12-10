// apps/web/src/lib/services/ontology/task-migration.service.ts
/**
 * Task Migration Service
 *
 * Handles migration of legacy tasks to onto_tasks in the ontology system.
 * Uses EnhancedTaskMigrator for individual tasks and BatchTaskMigrationService
 * for optimized batch processing.
 *
 * @see /thoughts/shared/research/2025-12-10_migration-system-design.md
 *      For comprehensive system design documentation including architecture diagrams,
 *      data flow, component details, and error handling strategies.
 */
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
import { EnhancedTaskMigrator } from './migration/enhanced-task-migrator';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import type { MigrationContext } from './migration/enhanced-migration.types';
import {
	BatchTaskMigrationService,
	type BatchMigrationResult
} from './batch-task-migration.service';

export type LegacyTaskRow = Database['public']['Tables']['tasks']['Row'];

/** Minimum task count to use batch migration (default: 5) */
const BATCH_MIGRATION_THRESHOLD = 5;

export class TaskMigrationService {
	private readonly enhancedMigrator: EnhancedTaskMigrator | undefined;
	private readonly batchMigrator: BatchTaskMigrationService | undefined;
	private readonly llmService: SmartLLMService | undefined;

	constructor(
		private readonly client: TypedSupabaseClient,
		llmService?: SmartLLMService
	) {
		this.llmService = llmService;
		// Always initialize enhanced migrator when LLM service is available
		if (llmService) {
			this.enhancedMigrator = new EnhancedTaskMigrator(client, llmService);
			this.batchMigrator = new BatchTaskMigrationService(client, llmService);
		}
	}

	async migrateTasks(
		projectId: string,
		ontoProjectId: string | null,
		actorId: string,
		context: MigrationServiceContext,
		phasePlanMapping?: Record<string, string | null>
	): Promise<TaskMigrationBatchResult> {
		const skipCompleted = context.skipCompletedTasks ?? true;
		const tasks = await this.fetchTasks(projectId, { skipCompleted });
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

		// ========== BATCH MIGRATION PATH ==========
		// Use batch migration for projects with 5+ tasks and an onto project
		const useBatchMigration =
			this.batchMigrator && ontoProjectId && tasks.length >= BATCH_MIGRATION_THRESHOLD;

		if (useBatchMigration) {
			console.info(
				`[TaskMigration] Using BATCH migration for ${tasks.length} tasks in project ${projectId}`
			);

			try {
				// Build task-to-phase mapping for per-task plan resolution
				// This fixes the bug where all tasks got assigned to the first phase's plan
				const taskToPhaseMapping: Record<string, string | null> = {};
				for (const task of tasks) {
					taskToPhaseMapping[task.id] = phaseMap[task.id] ?? null;
				}

				const batchResult = await this.batchMigrator!.migrateProjectTasks(
					tasks,
					{
						...context,
						enhancedMode: true,
						templateConfidenceThreshold: 0.7,
						propsConfidenceThreshold: 0.6,
						cacheEnabled: true
					},
					{
						projectId: ontoProjectId!,
						// Pass the full mappings for correct per-task plan resolution
						phaseToPlanMapping: resolvedPhasePlanMapping,
						taskToPhaseMapping,
						actorId,
						batchSize: 20,
						allowTemplateCreation: !context.dryRun,
						dryRun: context.dryRun
					}
				);

				// Convert batch result to TaskMigrationBatchResult format
				return this.convertBatchResult(
					batchResult,
					tasks,
					projectId,
					ontoProjectId,
					phaseMap,
					phaseMetadata,
					resolvedPhasePlanMapping,
					eventCounts,
					context
				);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				console.error(
					'[TaskMigration] Batch migration failed, falling back to per-task:',
					error
				);

				// ========== LOG BATCH FALLBACK ==========
				// Record the fallback in migration_log for audit trail
				try {
					await this.client.from('migration_log').insert({
						run_id: context.runId,
						batch_id: context.batchId ?? null,
						entity_type: 'batch_fallback',
						entity_id: projectId,
						status: 'failed',
						legacy_payload: { taskCount: tasks.length },
						message: `Batch migration failed, falling back to per-task: ${errorMessage}`,
						metadata: {
							projectId,
							ontoProjectId,
							taskCount: tasks.length,
							error: errorMessage,
							fallbackReason: 'batch_exception'
						}
					});
				} catch (logError) {
					console.error('[TaskMigration] Failed to log batch fallback:', logError);
				}

				// Fall through to per-task migration below
			}
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

		// Process tasks in parallel batches for better performance
		const concurrency = context.taskConcurrency ?? 5;
		const taskBatches = this.chunkArray(tasks, concurrency);

		for (const batch of taskBatches) {
			const batchResults = await Promise.all(
				batch.map((task) =>
					this.processSingleTask(task, {
						ontoProjectId,
						actorId,
						context,
						phaseMap,
						resolvedPhasePlanMapping,
						phaseMetadata,
						eventCounts
					})
				)
			);

			// Aggregate batch results
			for (const result of batchResults) {
				results.push(result.record);
				mappings[result.record.legacyTaskId] = result.ontoId;

				// Update summary counts
				switch (result.summaryType) {
					case 'alreadyMigrated':
						summary.alreadyMigrated += 1;
						break;
					case 'readyToMigrate':
						summary.readyToMigrate += 1;
						break;
					case 'blocked':
						summary.blocked += 1;
						break;
				}
			}
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

	private async fetchTasks(
		projectId: string,
		options: { skipCompleted?: boolean } = {}
	): Promise<LegacyTaskRow[]> {
		let query = this.client
			.from('tasks')
			.select('*')
			.eq('project_id', projectId)
			.is('deleted_at', null);

		// Skip completed/done tasks if requested
		if (options.skipCompleted) {
			query = query.neq('status', 'done');
		}

		const { data, error } = await query.order('created_at', { ascending: true });

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
			type_key: this.normalizeTaskTypeKey(params.classification.typeKey),
			state_key: params.recommendedStateKey,
			suggested_plan_id: params.suggestedPlanId, // For display only, stored via edges
			due_at: params.dueAt,
			priority: params.priority,
			facet_scale: params.facetScale,
			props: params.props ?? this.buildTaskProps(params.task, params.classification)
		} as Json;
	}

	/**
	 * Normalize legacy type_keys to valid task taxonomy (task.{work_mode})
	 * Maps old values to the new 8 base work modes
	 */
	private normalizeTaskTypeKey(legacyTypeKey: string): string {
		const mapping: Record<string, string> = {
			// Legacy task types from classifier
			'task.recurring': 'task.execute',
			'task.deep_work': 'task.execute',
			'task.base': 'task.execute',
			// Any other legacy patterns
			'task.basic': 'task.execute'
		};
		return mapping[legacyTypeKey] ?? legacyTypeKey ?? 'task.execute';
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
				return 'in_progress';
			case 'cancelled':
				return 'cancelled';
			case 'pending':
				return 'todo';
			case 'blocked':
				return 'blocked';
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

	/**
	 * Enhanced task migration using new engines
	 * Bridges between EnhancedTaskMigrationResult and TaskMigrationRecord
	 */
	private async migrateTaskEnhanced(
		task: LegacyTaskRow,
		context: MigrationServiceContext,
		projectContext: {
			ontoProjectId: string;
			ontoPlanId?: string | null;
			actorId: string;
		}
	): Promise<{
		status: string;
		ontoTaskId?: string | null;
		templateUsed?: string;
		message: string;
	}> {
		// Build migration context for enhanced migrator
		const migrationContext: MigrationContext = {
			...context,
			enhancedMode: true,
			templateConfidenceThreshold: 0.7,
			propsConfidenceThreshold: 0.6,
			cacheEnabled: true
		};

		// Run enhanced migration
		const enhancedResult = await this.enhancedMigrator.migrate(
			task,
			migrationContext,
			projectContext
		);

		return {
			status: enhancedResult.status,
			ontoTaskId: enhancedResult.ontoTaskId ?? null,
			templateUsed: enhancedResult.templateUsed,
			message: enhancedResult.message
		};
	}

	private mapEnhancedStatus(enhancedStatus: string): MigrationStatus {
		switch (enhancedStatus) {
			case 'completed':
				return 'completed';
			case 'pending_review':
				return 'pending';
			case 'validation_failed':
			case 'failed':
				return 'failed';
			default:
				return 'pending';
		}
	}

	/**
	 * Convert BatchMigrationResult to TaskMigrationBatchResult format
	 */
	private convertBatchResult(
		batchResult: BatchMigrationResult,
		tasks: LegacyTaskRow[],
		projectId: string,
		ontoProjectId: string | null,
		phaseMap: Record<string, string>,
		phaseMetadata: Map<string, string | null>,
		resolvedPhasePlanMapping: Record<string, string | null>,
		eventCounts: Map<string, number>,
		context: MigrationServiceContext
	): TaskMigrationBatchResult {
		const results: TaskMigrationRecord[] = [];
		const mappings: Record<string, string | null> = {};

		// Build lookup for classifications and extractions from preview (if available)
		const classificationMap = new Map<string, { typeKey: string; confidence: number }>();
		const extractionMap = new Map<
			string,
			{ props: Record<string, unknown>; confidence: number }
		>();

		if (batchResult.preview) {
			for (const c of batchResult.preview.classifications) {
				classificationMap.set(c.legacyId, {
					typeKey: c.typeKey,
					confidence: c.confidence
				});
			}
			for (const e of batchResult.preview.extractedProps) {
				extractionMap.set(e.legacyId, {
					props: e.props,
					confidence: e.confidence
				});
			}
		}

		// Build task records from batch result
		for (const task of tasks) {
			const phaseId = phaseMap[task.id] ?? null;
			const suggestedPlanId = phaseId ? (resolvedPhasePlanMapping[phaseId] ?? null) : null;
			const classification = classificationMap.get(task.id);
			const extraction = extractionMap.get(task.id);

			// Determine type key
			const typeKey = classification?.typeKey ?? 'task.execute';

			// Determine status based on batch result
			const hasError = batchResult.errors.some((e) => e.legacyId === task.id);
			const status: MigrationStatus = hasError
				? 'failed'
				: context.dryRun
					? 'pending'
					: batchResult.success
						? 'completed'
						: 'failed';

			// Create basic classification summary
			const classificationSummary: TaskClassificationSummary = {
				typeKey,
				complexity:
					(task.duration_minutes ?? 0) >= 120
						? 'complex'
						: (task.duration_minutes ?? 0) >= 60
							? 'moderate'
							: 'simple',
				requiresDeepWork: (task.duration_minutes ?? 0) >= 120,
				isRecurring: !!task.recurrence_pattern,
				reasoning: `Batch classified as ${typeKey} with confidence ${(classification?.confidence ?? 0.8).toFixed(2)}`
			};

			const recommendedStateKey = this.mapTaskState(task.status);
			const dueAt = this.resolveDueAt(task);
			const priority = this.mapPriority(task.priority);
			const facetScale = classificationSummary.requiresDeepWork ? 'medium' : 'small';

			// Build proposed payload
			const props = extraction?.props ?? this.buildTaskProps(task, classificationSummary);
			const proposedPayload = this.buildProposedPayload({
				task,
				classification: classificationSummary,
				recommendedStateKey,
				dueAt,
				priority,
				facetScale,
				suggestedPlanId,
				props: props as Json
			});

			results.push({
				legacyTaskId: task.id,
				title: task.title,
				legacyStatus: task.status,
				ontoTaskId: null, // Batch migration doesn't return individual onto IDs; mappings exist in legacy_migrations table
				phaseId,
				phaseName: phaseId ? (phaseMetadata.get(phaseId) ?? null) : null,
				suggestedOntoPlanId: suggestedPlanId,
				recommendedTypeKey: typeKey,
				recommendedStateKey,
				dueAt,
				priority,
				facetScale,
				calendarEventCount: eventCounts.get(task.id) ?? 0,
				status,
				notes: hasError
					? (batchResult.errors.find((e) => e.legacyId === task.id)?.error ??
						'Unknown error')
					: context.dryRun
						? 'Batch dry-run: preview generated'
						: 'Task migrated via batch migration',
				classification: classificationSummary,
				proposedPayload
			});

			mappings[task.id] = null; // Actual mappings stored in legacy_migrations table by batch service
		}

		// Build summary
		const summary: TaskMigrationPreviewSummary = {
			total: tasks.length,
			alreadyMigrated: 0,
			readyToMigrate: batchResult.tasksMigrated,
			blocked: batchResult.errors.length,
			missingProject: 0
		};

		return {
			projectId,
			ontoProjectId,
			tasks: results,
			taskMappings: mappings,
			summary,
			preview: context.dryRun ? this.buildPreview(summary, results) : undefined
		};
	}

	/**
	 * Split an array into chunks of specified size for batch processing
	 */
	private chunkArray<T>(array: T[], size: number): T[][] {
		const chunks: T[][] = [];
		for (let i = 0; i < array.length; i += size) {
			chunks.push(array.slice(i, i + size));
		}
		return chunks;
	}

	/**
	 * Process a single task migration - designed to be run in parallel
	 */
	private async processSingleTask(
		task: LegacyTaskRow,
		params: {
			ontoProjectId: string | null;
			actorId: string;
			context: MigrationServiceContext;
			phaseMap: Record<string, string>;
			resolvedPhasePlanMapping: Record<string, string | null>;
			phaseMetadata: Map<string, string | null>;
			eventCounts: Map<string, number>;
		}
	): Promise<{
		record: TaskMigrationRecord;
		ontoId: string | null;
		summaryType: 'alreadyMigrated' | 'readyToMigrate' | 'blocked';
	}> {
		const {
			ontoProjectId,
			actorId,
			context,
			phaseMap,
			resolvedPhasePlanMapping,
			phaseMetadata,
			eventCounts
		} = params;

		const enhancedMode = this.enhancedMigrator !== undefined;
		const classification = this.classifyTask(task);
		const phaseId = phaseMap[task.id] ?? null;
		const suggestedPlanId = phaseId ? (resolvedPhasePlanMapping[phaseId] ?? null) : null;

		// Check for existing migration - use prefetched cache first to avoid DB call
		const cachedOntoId = context.prefetchedMappings?.tasks?.get(task.id);
		const existingMapping = cachedOntoId
			? { onto_id: cachedOntoId }
			: await getLegacyMapping(this.client, 'tasks', task.id);

		if (existingMapping?.onto_id) {
			return {
				record: {
					legacyTaskId: task.id,
					title: task.title,
					legacyStatus: task.status,
					ontoTaskId: existingMapping.onto_id,
					phaseId,
					phaseName: phaseId ? (phaseMetadata.get(phaseId) ?? null) : null,
					suggestedOntoPlanId: suggestedPlanId,
					recommendedTypeKey: classification.typeKey,
					recommendedStateKey: this.mapTaskState(task.status),
					dueAt: this.resolveDueAt(task),
					priority: this.mapPriority(task.priority),
					facetScale: classification.requiresDeepWork ? 'medium' : 'small',
					calendarEventCount: eventCounts.get(task.id) ?? 0,
					status: 'completed',
					notes: 'Task already migrated.',
					classification,
					proposedPayload: {} as Json
				},
				ontoId: existingMapping.onto_id,
				summaryType: 'alreadyMigrated'
			};
		}

		// Use enhanced migrator if enabled
		if (enhancedMode && ontoProjectId) {
			const enhancedResult = await this.migrateTaskEnhanced(task, context, {
				ontoProjectId,
				ontoPlanId: suggestedPlanId,
				actorId
			});

			const summaryType =
				enhancedResult.status === 'completed'
					? 'readyToMigrate'
					: enhancedResult.status === 'failed'
						? 'blocked'
						: 'readyToMigrate';

			return {
				record: {
					legacyTaskId: task.id,
					title: task.title,
					legacyStatus: task.status,
					ontoTaskId: enhancedResult.ontoTaskId ?? null,
					phaseId,
					phaseName: phaseId ? (phaseMetadata.get(phaseId) ?? null) : null,
					suggestedOntoPlanId: suggestedPlanId,
					recommendedTypeKey: enhancedResult.templateUsed ?? classification.typeKey,
					recommendedStateKey: this.mapTaskState(task.status),
					dueAt: this.resolveDueAt(task),
					priority: this.mapPriority(task.priority),
					facetScale: classification.requiresDeepWork ? 'medium' : 'small',
					calendarEventCount: eventCounts.get(task.id) ?? 0,
					status: this.mapEnhancedStatus(enhancedResult.status),
					notes: enhancedResult.message,
					classification,
					proposedPayload: {} as Json
				},
				ontoId: enhancedResult.ontoTaskId ?? null,
				summaryType
			};
		}

		// Dry run mode - don't create actual records
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

			return {
				record: {
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
				},
				ontoId: null,
				summaryType: 'readyToMigrate'
			};
		}

		// Actual migration - create the onto_task
		const recommendedStateKey = this.mapTaskState(task.status);
		const dueAt = this.resolveDueAt(task);
		const priority = this.mapPriority(task.priority);
		const facetScale = classification.requiresDeepWork ? 'medium' : 'small';
		const baseProps = this.buildTaskProps(task, classification);
		// Add type_key and facets to props (facet_scale is a GENERATED column from props->'facets'->'scale')
		const props = {
			...baseProps,
			type_key: classification.typeKey,
			facets: { scale: facetScale }
		};

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

		// Note: description is stored in props, not as a separate column (onto_tasks has no description column)
		// Convert legacy type_keys to valid task taxonomy (task.{work_mode})
		const typeKey = this.normalizeTaskTypeKey(classification.typeKey);

		const { data, error } = await this.client
			.from('onto_tasks')
			.insert({
				title: task.title,
				project_id: ontoProjectId,
				type_key: typeKey,
				state_key: recommendedStateKey,
				priority,
				due_at: dueAt,
				props,
				created_by: actorId
			})
			.select('id')
			.single();

		if (error || !data) {
			return {
				record: {
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
				},
				ontoId: null,
				summaryType: 'blocked'
			};
		}

		// Create plan relationship edges if plan exists
		if (suggestedPlanId) {
			const { error: edgeError } = await this.client.from('onto_edges').insert([
				{
					src_id: data.id,
					src_kind: 'task',
					dst_id: suggestedPlanId,
					dst_kind: 'plan',
					rel: 'belongs_to_plan'
				},
				{
					src_id: suggestedPlanId,
					src_kind: 'plan',
					dst_id: data.id,
					dst_kind: 'task',
					rel: 'has_task'
				}
			]);

			if (edgeError) {
				console.error(
					`[TaskMigration] Failed to create task-plan edges for task ${task.id} → plan ${suggestedPlanId}: ${edgeError.message}`
				);
				// Throw to ensure edge creation failures are not silently ignored
				throw new Error(`Failed to create task-plan edges: ${edgeError.message}`);
			}
		}

		// Record the mapping
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

		return {
			record: {
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
			},
			ontoId: data.id,
			summaryType: 'readyToMigrate'
		};
	}
}
