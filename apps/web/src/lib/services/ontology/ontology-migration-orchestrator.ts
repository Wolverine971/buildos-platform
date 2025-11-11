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
import type {
	MigrationAnalysisOptions,
	MigrationBatchResult,
	MigrationLogRecord,
	MigrationPreviewPayload,
	MigrationRunOptions,
	MigrationRunSummary,
	MigrationScope,
	MigrationServiceContext,
	MigrationStatus
} from './migration.types';

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
		this.phaseService = new PhaseMigrationService(client, this.planGenerator);
		this.taskService = new TaskMigrationService(client);
		this.calendarService = new CalendarMigrationService(client);
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
		const context: MigrationServiceContext = {
			runId,
			batchId,
			dryRun,
			initiatedBy: options.initiatedBy,
			featureFlags,
			now
		};

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
				}
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

		let hasFailures = false;

		for (const project of candidates) {
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

				phaseBatch.total += phaseResult.phases.length;
				for (const phasePlan of phaseResult.phases) {
					this.applyBatchDetail(phaseBatch, phasePlan.status, {
						legacyId: phasePlan.legacyPhaseId,
						ontoId: phasePlan.existingOntoPlanId,
						error: phasePlan.notes,
						status: phasePlan.status
					});
					pendingLogs.push(
						this.buildLogInsert({
							runId,
							batchId,
							entityType: 'phase',
							legacyId: phasePlan.legacyPhaseId,
							ontoId: phasePlan.existingOntoPlanId,
							status: phasePlan.status,
							orgId: options.orgId ?? null,
							metadata: {
								message: phasePlan.notes
							}
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

				taskBatch.total += taskResult.tasks.length;
				for (const taskRecord of taskResult.tasks) {
					this.applyBatchDetail(taskBatch, taskRecord.status, {
						legacyId: taskRecord.legacyTaskId,
						ontoId: taskRecord.ontoTaskId,
						error: taskRecord.notes,
						status: taskRecord.status
					});
					pendingLogs.push(
						this.buildLogInsert({
							runId,
							batchId,
							entityType: 'task',
							legacyId: taskRecord.legacyTaskId,
							ontoId: taskRecord.ontoTaskId,
							status: taskRecord.status,
							orgId: options.orgId ?? null,
							metadata: {
								message: taskRecord.notes,
								classification: taskRecord.classification,
								recommendedTypeKey: taskRecord.recommendedTypeKey,
								phaseId: taskRecord.phaseId,
								suggestedOntoPlanId: taskRecord.suggestedOntoPlanId
							}
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

				calendarBatch.total += 1;
				this.applyBatchDetail(calendarBatch, calendarResult.status, {
					legacyId: project.id,
					ontoId: projectResult.ontoProjectId,
					error: calendarResult.notes,
					status: calendarResult.status
				});
				pendingLogs.push(
					this.buildLogInsert({
						runId,
						batchId,
						entityType: 'calendar',
						legacyId: project.id,
						ontoId: projectResult.ontoProjectId,
						status: calendarResult.status,
						orgId: options.orgId ?? null,
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
						runId,
						batchId,
						entityType: 'project',
						legacyId: project.id,
						ontoId: projectResult.ontoProjectId,
						status: projectResult.status,
						orgId: options.orgId ?? null,
						metadata: {
							message: projectResult.message,
							analysis: projectResult.analysis,
							template: projectResult.template,
							templateProps: projectResult.templateProps
						}
					})
				);
				this.applyBatchDetail(projectBatch, projectResult.status, {
					legacyId: projectResult.legacyProjectId,
					ontoId: projectResult.ontoProjectId,
					error: projectResult.message,
					status: projectResult.status
				});

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
						previewEntries.push({
							projectId: project.id,
							projectName: project.name,
							projectStatus: project.status,
							contextDocumentId: projectResult.contextDocumentId,
							contextMarkdown: projectResult.contextMarkdown,
							coreValues: projectResult.coreValues,
							planPreview: phaseResult.preview,
							taskPreview: taskResult.preview,
							calendarPreview: calendarResult.preview,
							templatePreview
						});
					}
				}

				if (pendingLogs.length) {
					await this.logEntries(pendingLogs);
				}
			} catch (error) {
				hasFailures = true;
				const message = error instanceof Error ? error.message : 'Unknown migration error';

				if (pendingLogs.length) {
					await this.logEntries(pendingLogs);
				}

				this.applyBatchDetail(projectBatch, 'failed', {
					legacyId: project.id,
					ontoId: null,
					error: message,
					status: 'failed'
				});

				await this.logEntries([
					this.buildLogInsert({
						runId,
						batchId,
						entityType: 'project',
						legacyId: project.id,
						status: 'failed',
						orgId: options.orgId ?? null,
						errorMessage: message,
						metadata: {
							notes: 'Migration orchestration failed before completion.'
						}
					})
				]);
			}
		}

		await this.markRunStatus(runId, hasFailures ? 'failed' : 'completed', {
			summary: summaries
		});

		return {
			runId,
			batchId,
			summary: summaries,
			dryRun,
			previews: previewEntries.length ? previewEntries : undefined
		};
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

		const featureFlags = await this.resolveFeatureFlags(null, initiatedBy);
		const previews: MigrationPreviewPayload[] = [];

		for (const project of candidates) {
			const context: MigrationServiceContext = {
				runId: randomUUID(),
				batchId: randomUUID(),
				dryRun: true,
				initiatedBy,
				featureFlags,
				now: new Date().toISOString()
			};

			const projectResult = await this.projectService.migrateProject(project, context);
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

			const taskResult = await this.taskService.migrateTasks(
				project.id,
				projectResult.ontoProjectId,
				projectResult.actorId,
				context,
				phaseResult.phaseMapping
			);

			const calendarResult = await this.calendarService.migrateCalendarData(
				project.id,
				projectResult.ontoProjectId,
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
				previews.push({
					projectId: project.id,
					projectName: project.name,
					projectStatus: project.status,
					contextDocumentId: projectResult.contextDocumentId,
					contextMarkdown: projectResult.contextMarkdown,
					coreValues: projectResult.coreValues,
					planPreview: phaseResult.preview,
					taskPreview: taskResult.preview,
					calendarPreview: calendarResult.preview,
					templatePreview
				});
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
		const filter = this.client
			.from('migration_log')
			.update({ status: 'rolled_back' })
			.eq('run_id', runId)
			.neq('entity_type', 'run');

		const query = fromDate ? filter.gte('created_at', fromDate) : filter;
		const { count, error } = await query.select('id', { count: 'exact' });

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
				startedAt: runEntry?.created_at ?? records[0].created_at,
				updatedAt: records[records.length - 1].updated_at,
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
			...(params.metadata ?? {})
		};

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
				...(existing?.metadata ?? {}),
				...metadata
			};
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
