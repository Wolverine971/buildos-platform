// apps/web/src/lib/services/ontology/ontology-migration-orchestrator.ts
import { randomUUID } from 'crypto';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database, Json } from '@buildos/shared-types';
import {
	isMigrationDualWriteEnabledForOrg,
	isMigrationDualWriteEnabledForUser
} from '$lib/utils/feature-flags';
import {
	ProjectMigrationService,
	type ProjectMigrationResult,
	type ProjectMigrationAnalysis
} from './project-migration.service';
import { PhaseMigrationService } from './phase-migration.service';
import { TaskMigrationService } from './task-migration.service';
import { CalendarMigrationService } from './calendar-migration.service';
import { PlanGenerationService } from './plan-generation.service';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { getLegacyMapping } from './legacy-mapping.service';
import type {
	MigrationAnalysisOptions,
	MigrationBatchResult,
	MigrationLogRecord,
	MigrationPreviewPayload,
	MigrationRunOptions,
	MigrationRunSummary,
	MigrationScope,
	MigrationServiceContext,
	MigrationStatus,
	PrefetchedMappingsCache
} from './migration.types';
import type { LegacyProjectRow } from './project-migration.service';

const LEGACY_TABLE_BY_SCOPE: Partial<Record<Exclude<MigrationScope, 'run'>, string>> = {
	project: 'projects',
	phase: 'phases',
	task: 'tasks',
	calendar: 'task_calendar_events'
};

const ONTO_TABLE_BY_SCOPE: Partial<Record<Exclude<MigrationScope, 'run'>, string>> = {
	project: 'onto_projects',
	phase: 'onto_plans',
	task: 'onto_tasks',
	calendar: 'onto_events'
};

type MigrationLogInsert = Database['public']['Tables']['migration_log']['Insert'];

type ScopeCounts = MigrationRunSummary['scopeCounts'];

type StartOptions = MigrationRunOptions & { initiatedBy: string; orgId?: string | null };

export interface MigrationAnalysisResponse {
	totals: {
		projects: number;
		tasks: number;
		phases: number;
		calendars: number;
	};
	projects: ProjectMigrationAnalysis[];
	options: MigrationAnalysisOptions;
	initiatedBy: string;
}

export class OntologyMigrationOrchestrator {
	private readonly projectService: ProjectMigrationService;
	private readonly phaseService: PhaseMigrationService;
	private readonly taskService: TaskMigrationService;
	private readonly calendarService: CalendarMigrationService;
	private readonly planGenerator: PlanGenerationService;
	private readonly llmService: SmartLLMService;

	constructor(private readonly client: TypedSupabaseClient) {
		this.llmService = new SmartLLMService({ supabase: client });
		this.projectService = new ProjectMigrationService(client, this.llmService);
		this.planGenerator = new PlanGenerationService(this.llmService);
		this.phaseService = new PhaseMigrationService(client, this.planGenerator, this.llmService);
		this.taskService = new TaskMigrationService(client, this.llmService);
		this.calendarService = new CalendarMigrationService(client);
	}

	/**
	 * Pre-fetch all existing entity mappings for a batch of projects
	 * This avoids repeated DB lookups during migration
	 */
	private async prefetchMappings(projectIds: string[]): Promise<PrefetchedMappingsCache> {
		const cache: PrefetchedMappingsCache = {
			projects: new Map(),
			phases: new Map(),
			tasks: new Map(),
			events: new Map()
		};

		if (!projectIds.length) return cache;

		console.info(
			`[MigrationOrchestrator] Pre-fetching mappings for ${projectIds.length} projects: ${projectIds.join(', ')}`
		);

		// Fetch all project mappings
		const { data: projectMappings, error: projectMappingError } = await this.client
			.from('legacy_entity_mappings')
			.select('legacy_id, onto_id')
			.eq('legacy_table', 'projects')
			.in('legacy_id', projectIds);

		if (projectMappingError) {
			console.error(
				'[MigrationOrchestrator] Error fetching project mappings:',
				projectMappingError
			);
		} else {
			console.info(
				`[MigrationOrchestrator] Found ${projectMappings?.length ?? 0} project mappings`
			);
		}

		for (const m of projectMappings ?? []) {
			cache.projects.set(m.legacy_id, m.onto_id);
		}

		// Fetch all phase IDs for these projects
		const { data: phases, error: phasesError } = await this.client
			.from('phases')
			.select('id')
			.in('project_id', projectIds);

		if (phasesError) {
			console.error('[MigrationOrchestrator] Error fetching phases:', phasesError);
		}

		const phaseIds = (phases ?? []).map((p) => p.id);
		console.info(`[MigrationOrchestrator] Found ${phaseIds.length} phases`);

		if (phaseIds.length) {
			const { data: phaseMappings, error: phaseMappingError } = await this.client
				.from('legacy_entity_mappings')
				.select('legacy_id, onto_id')
				.eq('legacy_table', 'phases')
				.in('legacy_id', phaseIds);

			if (phaseMappingError) {
				console.error(
					'[MigrationOrchestrator] Error fetching phase mappings:',
					phaseMappingError
				);
			} else {
				console.info(
					`[MigrationOrchestrator] Found ${phaseMappings?.length ?? 0} phase mappings`
				);
			}

			for (const m of phaseMappings ?? []) {
				cache.phases.set(m.legacy_id, m.onto_id);
			}
		}

		// Fetch all task IDs for these projects
		const { data: tasks, error: tasksError } = await this.client
			.from('tasks')
			.select('id')
			.in('project_id', projectIds)
			.is('deleted_at', null);

		if (tasksError) {
			console.error('[MigrationOrchestrator] Error fetching tasks:', tasksError);
		}

		const taskIds = (tasks ?? []).map((t) => t.id);
		console.info(`[MigrationOrchestrator] Found ${taskIds.length} tasks`);

		if (taskIds.length) {
			const { data: taskMappings, error: taskMappingError } = await this.client
				.from('legacy_entity_mappings')
				.select('legacy_id, onto_id')
				.eq('legacy_table', 'tasks')
				.in('legacy_id', taskIds);

			if (taskMappingError) {
				console.error(
					'[MigrationOrchestrator] Error fetching task mappings:',
					taskMappingError
				);
			} else {
				console.info(
					`[MigrationOrchestrator] Found ${taskMappings?.length ?? 0} task mappings`
				);
			}

			for (const m of taskMappings ?? []) {
				cache.tasks.set(m.legacy_id, m.onto_id);
			}

			// Fetch all event IDs for these tasks
			const { data: events, error: eventsError } = await this.client
				.from('task_calendar_events')
				.select('id')
				.in('task_id', taskIds);

			if (eventsError) {
				console.error('[MigrationOrchestrator] Error fetching events:', eventsError);
			}

			const eventIds = (events ?? []).map((e) => e.id);
			console.info(`[MigrationOrchestrator] Found ${eventIds.length} calendar events`);

			if (eventIds.length) {
				const { data: eventMappings, error: eventMappingError } = await this.client
					.from('legacy_entity_mappings')
					.select('legacy_id, onto_id')
					.eq('legacy_table', 'task_calendar_events')
					.in('legacy_id', eventIds);

				if (eventMappingError) {
					console.error(
						'[MigrationOrchestrator] Error fetching event mappings:',
						eventMappingError
					);
				} else {
					console.info(
						`[MigrationOrchestrator] Found ${eventMappings?.length ?? 0} event mappings`
					);
				}

				for (const m of eventMappings ?? []) {
					cache.events.set(m.legacy_id, m.onto_id);
				}
			}
		}

		console.info(
			`[MigrationOrchestrator] Pre-fetched mappings: ${cache.projects.size} projects, ${cache.phases.size} phases, ${cache.tasks.size} tasks, ${cache.events.size} events`
		);

		return cache;
	}

	/**
	 * Chunk an array into smaller arrays of specified size
	 */
	private chunkArray<T>(array: T[], size: number): T[][] {
		const chunks: T[][] = [];
		for (let i = 0; i < array.length; i += size) {
			chunks.push(array.slice(i, i + size));
		}
		return chunks;
	}

	async analyze(
		options: MigrationAnalysisOptions,
		initiatedBy: string
	): Promise<MigrationAnalysisResponse> {
		const projects = await this.projectService.analyzeProjects(options);
		const totals = projects.reduce(
			(acc, analysis) => {
				acc.tasks += analysis.taskCount;
				acc.phases += analysis.phaseCount;
				acc.calendars += analysis.calendarCount;
				return acc;
			},
			{ projects: projects.length, tasks: 0, phases: 0, calendars: 0 }
		);

		return {
			totals,
			projects,
			options,
			initiatedBy
		};
	}

	async start(options: StartOptions): Promise<{
		runId: string;
		batchId: string;
		summary: MigrationBatchResult[];
		dryRun: boolean;
		previews?: MigrationPreviewPayload[];
	}> {
		const runId = randomUUID();
		const batchId = randomUUID();
		const dryRun = options.dryRun ?? false;
		const now = new Date().toISOString();

		const featureFlags = await this.resolveFeatureFlags(
			options.orgId ?? null,
			options.initiatedBy
		);

		await this.logEntries([
			this.buildLogInsert({
				runId,
				batchId,
				entityType: 'run',
				status: 'in_progress',
				operation: dryRun ? 'analyze' : 'migrate',
				orgId: options.orgId ?? null,
				metadata: {
					options,
					initiatedBy: options.initiatedBy,
					dryRun
				} as unknown as Json
			})
		]);

		const candidates = await this.projectService.fetchCandidates({
			projectIds: options.projectIds,
			includeArchived: options.includeArchived,
			limit: options.batchSize ?? 10
		});

		const projectBatch = this.createBatch('project', candidates.length);
		const phaseBatch = this.createBatch('phase');
		const taskBatch = this.createBatch('task');
		const calendarBatch = this.createBatch('calendar');
		const summaries = [projectBatch, phaseBatch, taskBatch, calendarBatch];
		const previewEntries: MigrationPreviewPayload[] = [];

		if (!candidates.length) {
			await this.markRunStatus(runId, 'completed', {
				note: 'No candidate projects matched filters.'
			});
			return { runId, batchId, summary: summaries, dryRun };
		}

		// Pre-fetch all mappings upfront to avoid repeated DB lookups
		const prefetchedMappings = await this.prefetchMappings(candidates.map((c) => c.id));

		const context: MigrationServiceContext = {
			runId,
			batchId,
			dryRun,
			initiatedBy: options.initiatedBy,
			featureFlags,
			now,
			skipCompletedTasks: options.skipCompletedTasks ?? true,
			taskConcurrency: options.taskConcurrency ?? 5,
			projectConcurrency: options.projectConcurrency ?? 3,
			phaseConcurrency: options.phaseConcurrency ?? 5,
			eventConcurrency: options.eventConcurrency ?? 10,
			prefetchedMappings
		};

		let hasFailures = false;

		// Process projects in parallel batches
		const projectConcurrency = context.projectConcurrency ?? 3;
		const projectBatches = this.chunkArray(candidates, projectConcurrency);

		for (const batch of projectBatches) {
			const batchResults = await Promise.all(
				batch.map((project) =>
					this.migrateProjectWithDependencies(project, context, options.orgId ?? null)
				)
			);

			// Aggregate results from parallel batch
			for (const result of batchResults) {
				if (result.error) {
					hasFailures = true;
				}

				// Update project batch
				this.applyBatchDetail(projectBatch, result.projectResult?.status ?? 'failed', {
					legacyId: result.projectId,
					ontoId: result.projectResult?.ontoProjectId ?? null,
					error: result.error ?? result.projectResult?.message,
					status: result.projectResult?.status ?? 'failed'
				});

				// Update phase batch
				phaseBatch.total += result.phases.length;
				for (const phase of result.phases) {
					this.applyBatchDetail(phaseBatch, phase.status, {
						legacyId: phase.legacyPhaseId ?? `generated-${phase.name}`,
						ontoId: phase.existingOntoPlanId,
						error: phase.notes,
						status: phase.status
					});
				}

				// Update task batch
				taskBatch.total += result.tasks.length;
				for (const task of result.tasks) {
					this.applyBatchDetail(taskBatch, task.status, {
						legacyId: task.legacyTaskId,
						ontoId: task.ontoTaskId,
						error: task.notes,
						status: task.status
					});
				}

				// Update calendar batch
				if (result.calendarResult) {
					calendarBatch.total += 1;
					this.applyBatchDetail(calendarBatch, result.calendarResult.status, {
						legacyId: result.projectId,
						ontoId: result.projectResult?.ontoProjectId ?? null,
						error: result.calendarResult.notes,
						status: result.calendarResult.status
					});
				}

				// Add preview if available
				if (result.preview) {
					previewEntries.push(result.preview);
				}

				// Log all entries for this project
				if (result.logs.length) {
					await this.logEntries(result.logs);
				}
			}
		}

		await this.markRunStatus(runId, hasFailures ? 'failed' : 'completed', {
			summary: summaries as unknown as Json
		});

		return {
			runId,
			batchId,
			summary: summaries,
			dryRun,
			previews: previewEntries.length ? previewEntries : undefined
		};
	}

	/**
	 * Migrate a single project with all its dependencies (phases, tasks, calendar)
	 * Designed to be run in parallel with other projects
	 */
	private async migrateProjectWithDependencies(
		project: LegacyProjectRow,
		context: MigrationServiceContext,
		orgId: string | null
	): Promise<{
		projectId: string;
		projectResult: Awaited<ReturnType<ProjectMigrationService['migrateProject']>> | null;
		phases: Awaited<ReturnType<PhaseMigrationService['migratePhases']>>['phases'];
		tasks: Awaited<ReturnType<TaskMigrationService['migrateTasks']>>['tasks'];
		calendarResult: Awaited<ReturnType<CalendarMigrationService['migrateCalendarData']>> | null;
		preview: MigrationPreviewPayload | null;
		logs: MigrationLogInsert[];
		error: string | null;
	}> {
		const pendingLogs: MigrationLogInsert[] = [];

		try {
			const projectResult = await this.projectService.migrateProject(project, context);

			const phaseResult = await this.phaseService.migratePhases(
				project.id,
				projectResult.ontoProjectId,
				projectResult.actorId,
				context,
				projectResult.projectFacets,
				{
					projectId: project.id,
					projectName: project.name,
					projectStatus: project.status,
					contextMarkdown: projectResult.contextMarkdown,
					coreValues: projectResult.coreValues
				}
			);

			for (const phasePlan of phaseResult.phases) {
				pendingLogs.push(
					this.buildLogInsert({
						runId: context.runId,
						batchId: context.batchId,
						entityType: 'phase',
						legacyId: phasePlan.legacyPhaseId,
						ontoId: phasePlan.existingOntoPlanId,
						status: phasePlan.status,
						orgId,
						metadata: { message: phasePlan.notes }
					})
				);
			}

			const taskResult = await this.taskService.migrateTasks(
				project.id,
				projectResult.ontoProjectId,
				projectResult.actorId,
				context,
				phaseResult.phaseMapping
			);

			for (const taskRecord of taskResult.tasks) {
				pendingLogs.push(
					this.buildLogInsert({
						runId: context.runId,
						batchId: context.batchId,
						entityType: 'task',
						legacyId: taskRecord.legacyTaskId,
						ontoId: taskRecord.ontoTaskId,
						status: taskRecord.status,
						orgId,
						metadata: {
							message: taskRecord.notes,
							classification: taskRecord.classification,
							recommendedTypeKey: taskRecord.recommendedTypeKey,
							phaseId: taskRecord.phaseId,
							suggestedOntoPlanId: taskRecord.suggestedOntoPlanId
						} as unknown as Json
					})
				);
			}

			const calendarResult = await this.calendarService.migrateCalendarData(
				project.id,
				projectResult.ontoProjectId,
				projectResult.actorId,
				context,
				taskResult.taskMappings
			);

			pendingLogs.push(
				this.buildLogInsert({
					runId: context.runId,
					batchId: context.batchId,
					entityType: 'calendar',
					legacyId: project.id,
					ontoId: projectResult.ontoProjectId,
					status: calendarResult.status,
					orgId,
					metadata: {
						notes: calendarResult.notes,
						calendarCount: calendarResult.calendarCount,
						updatedCalendars: calendarResult.updatedCalendars,
						taskEventCount: calendarResult.taskEventCount,
						createdEvents: calendarResult.createdEvents,
						skippedEvents: calendarResult.skippedEvents
					}
				})
			);

			pendingLogs.unshift(
				this.buildLogInsert({
					runId: context.runId,
					batchId: context.batchId,
					entityType: 'project',
					legacyId: project.id,
					ontoId: projectResult.ontoProjectId,
					status: projectResult.status,
					orgId,
					metadata: {
						message: projectResult.message,
						typeKey: projectResult.typeKey,
						dryRun: context.dryRun,
						analysis: projectResult.analysis,
						template: projectResult.template,
						templateProps: projectResult.templateProps
					} as unknown as Json
				})
			);

			// Build preview if dry run
			let preview: MigrationPreviewPayload | null = null;
			if (context.dryRun) {
				const templatePreview = projectResult.template
					? {
							typeKey: projectResult.template.typeKey,
							realm: projectResult.template.realm,
							domain: projectResult.template.domain,
							deliverable: projectResult.template.deliverable,
							variant: projectResult.template.variant,
							confidence: projectResult.template.confidence,
							rationale: projectResult.template.rationale,
							created: projectResult.template.created,
							creationPlanned: projectResult.template.creationPlanned ?? null
						}
					: undefined;

				const hasPreview =
					phaseResult.preview ||
					taskResult.preview ||
					calendarResult.preview ||
					projectResult.contextMarkdown ||
					templatePreview;

				if (hasPreview) {
					preview = {
						projectId: project.id,
						projectName: project.name,
						projectStatus: project.status,
						contextDocumentId: projectResult.contextDocumentId,
						contextMarkdown: projectResult.contextMarkdown,
						coreValues: projectResult.coreValues,
						planPreview: phaseResult.preview
							? {
									plans: phaseResult.preview.plans.map((plan) => ({
										legacyPhaseId: plan.legacy_phase_id,
										name: plan.name,
										summary: plan.summary,
										typeKey: plan.type_key,
										stateKey: plan.state_key,
										startDate: plan.start_date,
										endDate: plan.end_date,
										order: plan.order,
										confidence: plan.confidence
									})),
									reasoning: phaseResult.preview.reasoning,
									confidence: phaseResult.preview.confidence,
									prompt: phaseResult.preview.prompt,
									contextPreview: phaseResult.preview.contextPreview,
									phasesPreview: phaseResult.preview.phasesPreview
								}
							: undefined,
						taskPreview: taskResult.preview,
						calendarPreview: calendarResult.preview,
						templatePreview
					};
				}
			}

			return {
				projectId: project.id,
				projectResult,
				phases: phaseResult.phases,
				tasks: taskResult.tasks,
				calendarResult,
				preview,
				logs: pendingLogs,
				error: null
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown migration error';

			pendingLogs.push(
				this.buildLogInsert({
					runId: context.runId,
					batchId: context.batchId,
					entityType: 'project',
					legacyId: project.id,
					status: 'failed',
					orgId,
					errorMessage: message,
					metadata: { notes: 'Migration orchestration failed before completion.' }
				})
			);

			return {
				projectId: project.id,
				projectResult: null,
				phases: [],
				tasks: [],
				calendarResult: null,
				preview: null,
				logs: pendingLogs,
				error: message
			};
		}
	}

	async getStatus(
		params: { runId?: string; limit?: number } = {}
	): Promise<MigrationRunSummary[]> {
		if (params.runId) {
			const summaries = await this.fetchRunSummaries([params.runId]);
			return summaries;
		}

		const { data, error } = await this.client
			.from('migration_log')
			.select('run_id')
			.eq('entity_type', 'run')
			.order('created_at', { ascending: false })
			.limit(params.limit ?? 5);

		if (error) {
			throw new Error(`[MigrationOrchestrator] Failed to list runs: ${error.message}`);
		}

		const runIds = Array.from(new Set((data ?? []).map((row) => row.run_id)));
		return this.fetchRunSummaries(runIds);
	}

	async previewProjects(
		options: MigrationAnalysisOptions,
		initiatedBy: string
	): Promise<MigrationPreviewPayload[]> {
		const candidates = await this.projectService.fetchCandidates({
			projectIds: options.projectIds,
			includeArchived: options.includeArchived,
			limit: options.limit
		});

		if (!candidates.length) {
			return [];
		}

		// Pre-fetch all mappings upfront
		const prefetchedMappings = await this.prefetchMappings(candidates.map((c) => c.id));

		const featureFlags = await this.resolveFeatureFlags(null, initiatedBy);

		// Process previews in parallel batches
		const projectConcurrency = options.projectConcurrency ?? 3;
		const projectBatches = this.chunkArray(candidates, projectConcurrency);
		const previews: MigrationPreviewPayload[] = [];

		for (const batch of projectBatches) {
			const batchPreviews = await Promise.all(
				batch.map(async (project) => {
					const context: MigrationServiceContext = {
						runId: randomUUID(),
						batchId: randomUUID(),
						dryRun: true,
						initiatedBy,
						featureFlags,
						now: new Date().toISOString(),
						skipCompletedTasks: options.skipCompletedTasks ?? true,
						taskConcurrency: options.taskConcurrency ?? 5,
						projectConcurrency: options.projectConcurrency ?? 3,
						phaseConcurrency: options.phaseConcurrency ?? 5,
						eventConcurrency: options.eventConcurrency ?? 10,
						prefetchedMappings
					};

					const projectResult = await this.projectService.migrateProject(
						project,
						context
					);
					const phaseResult = await this.phaseService.migratePhases(
						project.id,
						null,
						projectResult.actorId,
						context,
						projectResult.projectFacets,
						{
							projectId: project.id,
							projectName: project.name,
							projectStatus: project.status,
							contextMarkdown: projectResult.contextMarkdown,
							coreValues: projectResult.coreValues
						}
					);

					// Check for existing project mapping from cache
					let ontoProjectIdForTasks = projectResult.ontoProjectId;
					if (!ontoProjectIdForTasks && prefetchedMappings.projects.has(project.id)) {
						ontoProjectIdForTasks = prefetchedMappings.projects.get(project.id) ?? null;
					}

					const taskResult = await this.taskService.migrateTasks(
						project.id,
						ontoProjectIdForTasks,
						projectResult.actorId,
						context,
						phaseResult.phaseMapping
					);

					const calendarResult = await this.calendarService.migrateCalendarData(
						project.id,
						ontoProjectIdForTasks,
						projectResult.actorId,
						context,
						taskResult.taskMappings
					);

					const templatePreview = projectResult.template
						? {
								typeKey: projectResult.template.typeKey,
								realm: projectResult.template.realm,
								domain: projectResult.template.domain,
								deliverable: projectResult.template.deliverable,
								variant: projectResult.template.variant,
								confidence: projectResult.template.confidence,
								rationale: projectResult.template.rationale,
								created: projectResult.template.created,
								creationPlanned: projectResult.template.creationPlanned ?? null
							}
						: undefined;

					const hasPreview =
						phaseResult.preview ||
						taskResult.preview ||
						calendarResult.preview ||
						projectResult.contextMarkdown ||
						templatePreview;

					if (hasPreview) {
						return {
							projectId: project.id,
							projectName: project.name,
							projectStatus: project.status,
							contextDocumentId: projectResult.contextDocumentId,
							contextMarkdown: projectResult.contextMarkdown,
							coreValues: projectResult.coreValues,
							planPreview: phaseResult.preview
								? {
										plans: phaseResult.preview.plans.map((plan) => ({
											legacyPhaseId: plan.legacy_phase_id,
											name: plan.name,
											summary: plan.summary,
											typeKey: plan.type_key,
											stateKey: plan.state_key,
											startDate: plan.start_date,
											endDate: plan.end_date,
											order: plan.order,
											confidence: plan.confidence
										})),
										reasoning: phaseResult.preview.reasoning,
										confidence: phaseResult.preview.confidence,
										prompt: phaseResult.preview.prompt,
										contextPreview: phaseResult.preview.contextPreview,
										phasesPreview: phaseResult.preview.phasesPreview
									}
								: undefined,
							taskPreview: taskResult.preview,
							calendarPreview: calendarResult.preview,
							templatePreview
						} as MigrationPreviewPayload;
					}

					return null;
				})
			);

			// Add non-null previews
			for (const preview of batchPreviews) {
				if (preview) {
					previews.push(preview);
				}
			}
		}

		return previews;
	}

	async validate(
		runId: string
	): Promise<{ runId: string; summary: MigrationRunSummary; issues: string[] }> {
		const summaries = await this.fetchRunSummaries([runId]);
		const summary = summaries[0];

		if (!summary) {
			throw new Error(`Migration run ${runId} not found`);
		}

		const issues: string[] = [];
		for (const [scope, counts] of Object.entries(summary.scopeCounts)) {
			if (counts.failed > 0) {
				issues.push(`${scope} scope has ${counts.failed} failed entries`);
			}
			if (counts.pending > 0 && summary.status !== 'in_progress') {
				issues.push(`${scope} scope still has ${counts.pending} pending items`);
			}
		}

		await this.logEntries([
			this.buildLogInsert({
				runId,
				batchId: randomUUID(),
				entityType: 'run',
				status: issues.length ? 'failed' : 'completed',
				operation: 'validate',
				metadata: { issues },
				legacyId: null,
				ontoId: null
			})
		]);

		return { runId, summary, issues };
	}

	async rollback(
		runId: string,
		fromDate?: string,
		initiatedBy?: string
	): Promise<{ runId: string; updated: number }> {
		let query = this.client
			.from('migration_log')
			.update({ status: 'rolled_back' }, { count: 'exact' })
			.eq('run_id', runId)
			.neq('entity_type', 'run');

		if (fromDate) {
			query = query.gte('created_at', fromDate);
		}

		const { count, error } = await query;

		if (error) {
			throw new Error(`[MigrationOrchestrator] Failed to mark rollback: ${error.message}`);
		}

		await this.logEntries([
			this.buildLogInsert({
				runId,
				batchId: randomUUID(),
				entityType: 'run',
				status: 'rolled_back',
				operation: 'rollback',
				metadata: {
					fromDate: fromDate ?? null,
					initiatedBy: initiatedBy ?? 'system'
				}
			})
		]);

		return { runId, updated: count ?? 0 };
	}

	async pause(runId: string, reason: string, initiatedBy?: string): Promise<{ runId: string }> {
		await this.markRunStatus(runId, 'paused', {
			pause_reason: reason,
			pause_set_at: new Date().toISOString(),
			pause_set_by: initiatedBy ?? 'system'
		});

		return { runId };
	}

	async resume(runId: string, initiatedBy?: string): Promise<{ runId: string }> {
		await this.markRunStatus(runId, 'in_progress', {
			pause_reason: null,
			resumed_at: new Date().toISOString(),
			resumed_by: initiatedBy ?? 'system'
		});

		return { runId };
	}

	private async resolveFeatureFlags(
		orgId: string | null,
		userId: string
	): Promise<{
		dualWriteProjects: boolean;
	}> {
		const orgFlag = await isMigrationDualWriteEnabledForOrg(this.client, orgId, {
			fallbackUserId: userId
		});
		const userFlag = await isMigrationDualWriteEnabledForUser(this.client, userId);

		return {
			dualWriteProjects: true //orgFlag || userFlag
		};
	}

	private createBatch(scope: Exclude<MigrationScope, 'run'>, total = 0): MigrationBatchResult {
		return {
			scope,
			total,
			completed: 0,
			failed: 0,
			pending: 0,
			details: []
		};
	}

	private applyBatchDetail(
		batch: MigrationBatchResult,
		status: MigrationStatus,
		detail: MigrationBatchResult['details'][number]
	): void {
		batch.details.push(detail);

		if (status === 'completed') {
			batch.completed += 1;
		} else if (status === 'failed' || status === 'rolled_back') {
			batch.failed += 1;
		} else {
			batch.pending += 1;
		}
	}

	private async fetchRunSummaries(runIds: string[]): Promise<MigrationRunSummary[]> {
		if (!runIds.length) {
			return [];
		}

		const { data, error } = await this.client
			.from('migration_log')
			.select('*')
			.in('run_id', runIds)
			.order('created_at', { ascending: true });

		if (error) {
			throw new Error(
				`[MigrationOrchestrator] Failed to fetch run summaries: ${error.message}`
			);
		}

		const grouped = new Map<string, MigrationLogRecord[]>();
		for (const row of data ?? []) {
			const entries = grouped.get(row.run_id) ?? [];
			entries.push(row as MigrationLogRecord);
			grouped.set(row.run_id, entries);
		}

		const summaries: MigrationRunSummary[] = [];
		for (const runId of runIds) {
			const records = grouped.get(runId);
			if (!records?.length) continue;

			const runEntry = records.find((record) => record.entity_type === 'run');
			const scopeCounts = this.createScopeCounts();

			for (const record of records) {
				if (record.entity_type === 'run') continue;
				const scope = record.entity_type as Exclude<MigrationScope, 'run'>;
				const bucket = scopeCounts[scope];
				if (!bucket) continue;

				bucket.total += 1;
				if (record.status === 'completed') {
					bucket.completed += 1;
				} else if (record.status === 'failed' || record.status === 'rolled_back') {
					bucket.failed += 1;
				} else {
					bucket.pending += 1;
				}
			}

			const metadata = (runEntry?.metadata ?? {}) as {
				options?: MigrationRunOptions;
				initiatedBy?: string;
				dryRun?: boolean;
				issues?: string[];
			};

			summaries.push({
				runId,
				status: runEntry?.status ?? 'pending',
				scopeCounts,
				startedAt: runEntry?.created_at ?? records[0]!.created_at,
				updatedAt: records[records.length - 1]!.updated_at,
				options: {
					...(metadata.options ?? {}),
					initiatedBy: metadata.initiatedBy ?? 'unknown'
				}
			});
		}

		return summaries;
	}

	private createScopeCounts(): ScopeCounts {
		return {
			project: { total: 0, completed: 0, failed: 0, pending: 0 },
			phase: { total: 0, completed: 0, failed: 0, pending: 0 },
			task: { total: 0, completed: 0, failed: 0, pending: 0 },
			calendar: { total: 0, completed: 0, failed: 0, pending: 0 }
		};
	}

	private buildLogInsert(params: {
		runId: string;
		batchId: string;
		entityType: MigrationScope;
		status: MigrationStatus;
		legacyId?: string | null;
		ontoId?: string | null;
		orgId?: string | null;
		operation?: string;
		metadata?: Json;
		errorMessage?: string;
	}): MigrationLogInsert {
		const scope =
			params.entityType === 'run'
				? null
				: (params.entityType as Exclude<MigrationScope, 'run'>);
		const metadata: Json = {
			...((params.metadata ?? {}) as Record<string, unknown>)
		} as Json;

		return {
			run_id: params.runId,
			batch_id: params.batchId,
			entity_type: params.entityType,
			legacy_id: params.legacyId ?? null,
			legacy_table: scope ? (LEGACY_TABLE_BY_SCOPE[scope] ?? null) : null,
			onto_id: params.ontoId ?? null,
			onto_table: scope ? (ONTO_TABLE_BY_SCOPE[scope] ?? null) : null,
			status: params.status,
			operation: params.operation ?? 'migrate',
			error_message: params.errorMessage ?? null,
			metadata,
			org_id: params.orgId ?? null
		};
	}

	private async logEntries(entries: MigrationLogInsert[]): Promise<void> {
		if (!entries.length) {
			return;
		}

		const { error } = await this.client.from('migration_log').insert(entries);
		if (error) {
			throw new Error(
				`[MigrationOrchestrator] Failed to write migration logs: ${error.message}`
			);
		}
	}

	private async markRunStatus(
		runId: string,
		status: MigrationStatus,
		metadata?: Json
	): Promise<void> {
		const { data: existing, error: fetchError } = await this.client
			.from('migration_log')
			.select('metadata')
			.eq('run_id', runId)
			.eq('entity_type', 'run')
			.maybeSingle();

		if (fetchError && fetchError.code !== 'PGRST116') {
			throw new Error(
				`[MigrationOrchestrator] Failed to locate run record: ${fetchError.message}`
			);
		}

		const payload: Database['public']['Tables']['migration_log']['Update'] = {
			status
		};

		if (metadata) {
			payload.metadata = {
				...((existing?.metadata ?? {}) as Record<string, unknown>),
				...(metadata as Record<string, unknown>)
			} as Json;
		}

		const { data: updatedRows, error } = await this.client
			.from('migration_log')
			.update(payload)
			.eq('run_id', runId)
			.eq('entity_type', 'run')
			.select('id');

		if (error) {
			throw new Error(
				`[MigrationOrchestrator] Failed to update run status: ${error.message}`
			);
		}

		if (!updatedRows?.length) {
			throw new Error(`[MigrationOrchestrator] Migration run ${runId} not found`);
		}
	}
}
