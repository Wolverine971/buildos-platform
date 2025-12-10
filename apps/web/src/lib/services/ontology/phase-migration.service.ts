// apps/web/src/lib/services/ontology/phase-migration.service.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database } from '@buildos/shared-types';
import type { Facets } from '$lib/types/onto';
import type {
	MigrationServiceContext,
	MigrationStatus,
	MigrationPlanPreviewPayload
} from './migration.types';
import { getLegacyMapping, upsertLegacyMapping } from './legacy-mapping.service';
import {
	PlanGenerationService,
	GeneratedPlanSpec,
	LegacyPhaseSummary,
	ProjectNarrativeBundle,
	PlanGenerationPreview
} from './plan-generation.service';
import { EnhancedPlanMigrator } from './migration/enhanced-plan-migrator';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import type { MigrationContext } from './migration/enhanced-migration.types';

export type LegacyPhaseRow = Database['public']['Tables']['phases']['Row'];

export interface PhaseMigrationPlan {
	legacyPhaseId: string | null;
	name: string;
	order: number;
	taskCount: number;
	existingOntoPlanId: string | null;
	status: MigrationStatus;
	notes?: string;
}

export interface PhaseMigrationBatchResult {
	projectId: string;
	ontoProjectId: string | null;
	phases: PhaseMigrationPlan[];
	phaseMapping: Record<string, string | null>;
	preview?: PlanGenerationPreview;
}

// Plan type_key follows family-based taxonomy: plan.{family}[.{variant}]
// For project phases, we use the 'phase' family with 'project' variant
const PLAN_TYPE_KEY = 'plan.phase.project';

export class PhaseMigrationService {
	private readonly enhancedMigrator: EnhancedPlanMigrator;

	constructor(
		private readonly client: TypedSupabaseClient,
		private readonly planGenerator: PlanGenerationService,
		llmService?: SmartLLMService
	) {
		// Initialize enhanced migrator if LLM service provided
		if (llmService) {
			this.enhancedMigrator = new EnhancedPlanMigrator(client, llmService);
		}
	}

	async migratePhases(
		projectId: string,
		ontoProjectId: string | null,
		actorId: string,
		context: MigrationServiceContext,
		projectFacets?: Facets,
		projectNarrative?: ProjectNarrativeBundle
	): Promise<PhaseMigrationBatchResult> {
		const allPhases = await this.fetchPhases(projectId);
		const skipCompletedTasks = context.skipCompletedTasks ?? true;

		// Get active task counts if we're skipping completed tasks
		const phaseTaskCounts = await this.getPhaseTaskCounts(
			allPhases.map((phase) => phase.id),
			{ onlyActive: skipCompletedTasks }
		);

		// Filter out phases with no active tasks if skipCompletedTasks is enabled
		const phases = skipCompletedTasks
			? allPhases.filter((phase) => (phaseTaskCounts.get(phase.id) ?? 0) > 0)
			: allPhases;

		const phasePlans: PhaseMigrationPlan[] = [];
		const mapping: Record<string, string | null> = {};

		if (!phases.length) {
			return {
				projectId,
				ontoProjectId,
				phases: [],
				phaseMapping: {}
			};
		}

		const summaries: LegacyPhaseSummary[] = phases.map((phase) => ({
			id: phase.id,
			name: phase.name,
			description: phase.description,
			order: phase.order,
			start_date: phase.start_date,
			end_date: phase.end_date,
			task_count: phaseTaskCounts.get(phase.id) ?? 0,
			scheduling_method: phase.scheduling_method
		}));

		const legacyMappings = await this.fetchExistingPhaseMappings(phases.map((p) => p.id));

		const llmPreview = await this.generatePlansWithLLM(
			projectNarrative,
			summaries,
			context.initiatedBy
		);

		if (!ontoProjectId || context.dryRun) {
			const plansToDisplay = llmPreview?.plans?.length
				? llmPreview.plans
				: phases.map((phase) => ({
						legacy_phase_id: phase.id,
						name: phase.name,
						summary: phase.description ?? undefined,
						type_key: PLAN_TYPE_KEY,
						state_key: this.determinePhaseState(phase),
						start_date: phase.start_date,
						end_date: phase.end_date,
						order: phase.order,
						confidence: null
					}));

			for (const plan of plansToDisplay) {
				const legacyPhase = plan.legacy_phase_id
					? phases.find((phase) => phase.id === plan.legacy_phase_id)
					: null;
				const taskCount = legacyPhase ? (phaseTaskCounts.get(legacyPhase.id) ?? 0) : 0;
				const existingId =
					plan.legacy_phase_id && legacyMappings.has(plan.legacy_phase_id)
						? (legacyMappings.get(plan.legacy_phase_id) ?? null)
						: null;

				phasePlans.push({
					legacyPhaseId: plan.legacy_phase_id ?? null,
					name: plan.name,
					order: plan.order ?? legacyPhase?.order ?? phasePlans.length + 1,
					taskCount,
					existingOntoPlanId: existingId,
					status: 'pending',
					notes: plan.summary ?? 'LLM preview plan'
				});

				if (plan.legacy_phase_id) {
					mapping[plan.legacy_phase_id] = existingId ?? null;
				}
			}

			return {
				projectId,
				ontoProjectId,
				phases: phasePlans,
				phaseMapping: mapping,
				preview: this.toPreviewPayload(llmPreview)
			};
		}

		const llmPlans = llmPreview?.plans ?? [];

		await this.insertPlansFromSpecs({
			ontoProjectId,
			actorId,
			projectFacets,
			phasePlans,
			phaseMapping: mapping,
			legacyPhases: phases,
			summaries,
			phaseTaskCounts,
			llmPlans,
			context
		});

		return {
			projectId,
			ontoProjectId,
			phases: phasePlans,
			phaseMapping: mapping,
			preview: this.toPreviewPayload(llmPreview)
		};
	}

	private async fetchPhases(projectId: string): Promise<LegacyPhaseRow[]> {
		const { data, error } = await this.client
			.from('phases')
			.select('*')
			.eq('project_id', projectId)
			.order('order', { ascending: true });

		if (error) {
			throw new Error(
				`[PhaseMigration] Failed to load phases for ${projectId}: ${error.message}`
			);
		}

		return data ?? [];
	}

	private async getPhaseTaskCounts(
		phaseIds: string[],
		options: { onlyActive?: boolean } = {}
	): Promise<Map<string, number>> {
		if (!phaseIds.length) {
			return new Map();
		}

		// Get all phase-task mappings first
		const { data: phaseTasks, error: phaseTasksError } = await this.client
			.from('phase_tasks')
			.select('phase_id, task_id')
			.in('phase_id', phaseIds);

		if (phaseTasksError) {
			throw new Error(
				`[PhaseMigration] Failed to count tasks for phases: ${phaseTasksError.message}`
			);
		}

		if (!phaseTasks?.length) {
			return new Map();
		}

		// If we only want active tasks, filter by task status
		if (options.onlyActive) {
			const taskIds = phaseTasks.map((pt) => pt.task_id);

			// Get only active tasks (not deleted and not done)
			const { data: activeTasks, error: tasksError } = await this.client
				.from('tasks')
				.select('id')
				.in('id', taskIds)
				.is('deleted_at', null)
				.neq('status', 'done');

			if (tasksError) {
				throw new Error(
					`[PhaseMigration] Failed to filter active tasks: ${tasksError.message}`
				);
			}

			const activeTaskIds = new Set((activeTasks ?? []).map((t) => t.id));

			// Count only active tasks per phase
			const counts = new Map<string, number>();
			for (const row of phaseTasks) {
				if (activeTaskIds.has(row.task_id)) {
					counts.set(row.phase_id, (counts.get(row.phase_id) ?? 0) + 1);
				}
			}

			return counts;
		}

		// Default: count all tasks
		const counts = new Map<string, number>();
		for (const row of phaseTasks) {
			counts.set(row.phase_id, (counts.get(row.phase_id) ?? 0) + 1);
		}

		return counts;
	}

	private determinePhaseState(phase: LegacyPhaseRow): string {
		if (new Date(phase.end_date) < new Date()) {
			return 'complete';
		}

		if (new Date(phase.start_date) <= new Date()) {
			return 'execution';
		}

		return 'planning';
	}

	private determinePhaseScale(taskCount: number): 'micro' | 'small' | 'medium' | 'large' {
		if (taskCount > 20) return 'large';
		if (taskCount > 10) return 'medium';
		if (taskCount > 3) return 'small';
		return 'micro';
	}

	private determinePhaseStage(phase: LegacyPhaseRow): string {
		if (new Date(phase.end_date) < new Date()) {
			return 'complete';
		}

		if (new Date(phase.start_date) <= new Date()) {
			return 'execution';
		}

		return 'planning';
	}

	private async fetchExistingPhaseMappings(phaseIds: string[]): Promise<Map<string, string>> {
		if (!phaseIds.length) {
			return new Map();
		}

		const { data, error } = await this.client
			.from('legacy_entity_mappings')
			.select('legacy_id, onto_id')
			.eq('legacy_table', 'phases')
			.in('legacy_id', phaseIds);

		if (error) {
			throw new Error(
				`[PhaseMigration] Failed to load existing phase mappings: ${error.message}`
			);
		}

		return new Map((data ?? []).map((row) => [row.legacy_id, row.onto_id]));
	}

	private async generatePlansWithLLM(
		projectNarrative: ProjectNarrativeBundle | undefined,
		phases: LegacyPhaseSummary[],
		initiatedBy: string
	): Promise<PlanGenerationPreview | null> {
		if (!projectNarrative || !phases.length) {
			return null;
		}

		try {
			return await this.planGenerator.generatePlans(projectNarrative, phases, initiatedBy);
		} catch (error) {
			console.error(
				'[PhaseMigration] LLM plan synthesis failed, falling back to legacy phases',
				error
			);
			return null;
		}
	}

	private async insertPlansFromSpecs(params: {
		ontoProjectId: string;
		actorId: string;
		projectFacets?: Facets;
		phasePlans: PhaseMigrationPlan[];
		phaseMapping: Record<string, string | null>;
		legacyPhases: LegacyPhaseRow[];
		summaries: LegacyPhaseSummary[];
		phaseTaskCounts: Map<string, number>;
		llmPlans: GeneratedPlanSpec[];
		context: MigrationServiceContext;
	}): Promise<void> {
		const phaseById = new Map(params.legacyPhases.map((phase) => [phase.id, phase]));
		const handledLegacyIds = new Set<string>();

		for (const plan of params.llmPlans) {
			const legacyPhase = plan.legacy_phase_id ? phaseById.get(plan.legacy_phase_id) : null;
			const taskCount = legacyPhase ? (params.phaseTaskCounts.get(legacyPhase.id) ?? 0) : 0;

			const insertResult = await this.insertPlan({
				ontoProjectId: params.ontoProjectId,
				actorId: params.actorId,
				typeKey: plan.type_key ?? PLAN_TYPE_KEY,
				stateKey:
					plan.state_key ??
					(legacyPhase ? this.determinePhaseState(legacyPhase) : 'planning'),
				name: plan.name || legacyPhase?.name || `Plan ${params.phasePlans.length + 1}`,
				taskCount,
				projectFacets: params.projectFacets,
				phase: legacyPhase,
				order: plan.order ?? legacyPhase?.order ?? params.phasePlans.length + 1,
				summary: plan.summary,
				metadata: {
					legacy_phase_id: plan.legacy_phase_id,
					generation: 'llm',
					confidence: plan.confidence ?? null
				},
				context: params.context
			});

			params.phasePlans.push({
				legacyPhaseId: legacyPhase?.id ?? plan.legacy_phase_id ?? null,
				name: plan.name,
				order: plan.order ?? legacyPhase?.order ?? params.phasePlans.length + 1,
				taskCount,
				existingOntoPlanId: insertResult,
				status: 'completed',
				notes: plan.legacy_phase_id
					? 'Plan synthesized by LLM for legacy phase.'
					: 'Net-new plan synthesized by LLM.'
			});

			if (legacyPhase) {
				handledLegacyIds.add(legacyPhase.id);
				params.phaseMapping[legacyPhase.id] = insertResult;
				await upsertLegacyMapping(this.client, {
					legacyTable: 'phases',
					legacyId: legacyPhase.id,
					ontoTable: 'onto_plans',
					ontoId: insertResult,
					record: legacyPhase,
					metadata: {
						run_id: params.context.runId,
						batch_id: params.context.batchId,
						dry_run: params.context.dryRun,
						generation: 'llm'
					}
				});
			}
		}

		const remainingPhases = params.legacyPhases.filter(
			(phase) => !handledLegacyIds.has(phase.id)
		);

		for (const phase of remainingPhases) {
			const taskCount = params.phaseTaskCounts.get(phase.id) ?? 0;

			const existingMapping = await getLegacyMapping(this.client, 'phases', phase.id);
			if (existingMapping?.onto_id) {
				params.phasePlans.push({
					legacyPhaseId: phase.id,
					name: phase.name,
					order: phase.order,
					taskCount,
					existingOntoPlanId: existingMapping.onto_id,
					status: 'completed',
					notes: 'Phase already migrated before LLM synthesis.'
				});
				params.phaseMapping[phase.id] = existingMapping.onto_id;
				continue;
			}

			const planId = await this.insertPlan({
				ontoProjectId: params.ontoProjectId,
				actorId: params.actorId,
				typeKey: PLAN_TYPE_KEY,
				stateKey: this.determinePhaseState(phase),
				name: phase.name || `Phase ${phase.order ?? params.phasePlans.length + 1}`,
				taskCount,
				projectFacets: params.projectFacets,
				phase,
				order: phase.order,
				summary: undefined,
				metadata: {
					legacy_phase_id: phase.id,
					generation: 'legacy'
				},
				context: params.context
			});

			params.phasePlans.push({
				legacyPhaseId: phase.id,
				name: phase.name,
				order: phase.order,
				taskCount,
				existingOntoPlanId: planId,
				status: 'completed',
				notes: 'Fallback plan created from legacy phase.'
			});

			params.phaseMapping[phase.id] = planId;
			await upsertLegacyMapping(this.client, {
				legacyTable: 'phases',
				legacyId: phase.id,
				ontoTable: 'onto_plans',
				ontoId: planId,
				record: phase,
				metadata: {
					run_id: params.context.runId,
					batch_id: params.context.batchId,
					dry_run: params.context.dryRun,
					generation: 'legacy'
				}
			});
		}
	}

	private async insertPlan(params: {
		ontoProjectId: string;
		actorId: string;
		typeKey: string;
		stateKey: string;
		name: string;
		taskCount: number;
		projectFacets?: Facets;
		phase: LegacyPhaseRow | null;
		order?: number | null;
		summary?: string;
		metadata?: Record<string, unknown>;
		context: MigrationServiceContext;
	}): Promise<string> {
		// Check if enhanced mode is enabled and we have a phase to migrate
		const enhancedMode =
			process.env.MIGRATION_ENHANCED_PLANS === 'true' &&
			this.enhancedMigrator &&
			params.phase;

		// Use enhanced migrator if enabled
		if (enhancedMode && params.phase) {
			const migrationContext: MigrationContext = {
				...params.context,
				enhancedMode: true,
				templateConfidenceThreshold: 0.7,
				propsConfidenceThreshold: 0.6,
				cacheEnabled: true
			};

			const enhancedResult = await this.enhancedMigrator.migrate(
				params.phase,
				migrationContext,
				{
					ontoProjectId: params.ontoProjectId,
					actorId: params.actorId,
					projectFacets: params.projectFacets
				}
			);

			if (enhancedResult.status === 'completed' && enhancedResult.ontoPlanId) {
				return enhancedResult.ontoPlanId;
			}

			// Fall back to legacy if enhanced failed
			console.warn(
				`[PhaseMigration] Enhanced mode failed for phase ${params.phase.id}, falling back to legacy: ${enhancedResult.message}`
			);
		}

		// Legacy migration flow
		const { data, error } = await this.client
			.from('onto_plans')
			.insert({
				project_id: params.ontoProjectId,
				name: params.name,
				type_key: params.typeKey || PLAN_TYPE_KEY,
				state_key: params.stateKey,
				props: {
					source: 'migration',
					summary: params.summary,
					legacy_phase_id: params.phase?.id ?? null,
					order: params.order,
					task_count: params.taskCount,
					scheduling_method: params.phase?.scheduling_method ?? null,
					date_range: params.phase
						? {
								start: params.phase.start_date,
								end: params.phase.end_date
							}
						: null,
					metadata: params.metadata ?? {},
					facets: {
						context: params.projectFacets?.context ?? null,
						scale: this.determinePhaseScale(params.taskCount),
						stage: params.phase ? this.determinePhaseStage(params.phase) : 'planning'
					}
				},
				created_by: params.actorId
			})
			.select('id')
			.single();

		if (error || !data) {
			throw new Error(
				`[PhaseMigration] Failed to insert plan "${params.name}": ${error?.message}`
			);
		}

		// Create has_plan edge to link plan to project
		const { error: edgeError } = await this.client.from('onto_edges').insert({
			src_kind: 'project',
			src_id: params.ontoProjectId,
			rel: 'has_plan',
			dst_kind: 'plan',
			dst_id: data.id
		});

		if (edgeError) {
			console.error(
				`[PhaseMigration] Failed to create has_plan edge for plan "${params.name}": ${edgeError.message}`
			);
			// Don't fail the whole operation for edge errors, but log it
		}

		return data.id;
	}
	private toPreviewPayload(
		preview: PlanGenerationPreview | null
	): MigrationPlanPreviewPayload | undefined {
		if (!preview) {
			return undefined;
		}

		return {
			plans: preview.plans.map((plan) => ({
				legacyPhaseId: plan.legacy_phase_id ?? null,
				name: plan.name,
				summary: plan.summary,
				typeKey: plan.type_key,
				stateKey: plan.state_key,
				startDate: plan.start_date ?? null,
				endDate: plan.end_date ?? null,
				order: plan.order ?? null,
				confidence: plan.confidence ?? null
			})),
			reasoning: preview.reasoning,
			confidence: preview.confidence,
			prompt: preview.prompt,
			contextPreview: preview.contextPreview,
			phasesPreview: preview.phasesPreview
		};
	}
}
