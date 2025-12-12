// apps/web/src/lib/services/ontology/batch-task-migration.service.ts
/**
 * Batch Task Migration Service
 *
 * Efficiently migrates multiple tasks using batch operations to minimize LLM calls and DB queries.
 *
 * Key optimizations over per-task migration:
 * - Phase 1: Single LLM call to classify all tasks (vs N calls)
 * - Phase 2: Single DB query to load all templates (vs N queries)
 * - Phase 3: Batch property extraction grouped by schema (vs N extraction calls)
 * - Phase 4: Batch database inserts for tasks, edges, mappings
 *
 * Pipeline:
 * ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
 * │  CLASSIFY   │───▶│   RESOLVE   │───▶│   EXTRACT   │───▶│   INSERT    │
 * │ (1 LLM/batch)│    │  TEMPLATES  │    │ (N by schema)│    │  (batch DB) │
 * └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
 *
 * @see /apps/web/docs/features/ontology/BATCH_TASK_MIGRATION_SPEC.md
 * @see /thoughts/shared/research/2025-12-10_migration-system-design.md
 *      For comprehensive system design documentation.
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database, Json } from '@buildos/shared-types';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import type { MigrationContext, LegacyTask } from './migration/enhanced-migration.types';
import { upsertLegacyMapping, getLegacyMappingsBatch } from './legacy-mapping.service';

// ============================================
// TYPE DEFINITIONS
// ============================================

/** Input for batch task migration */
export interface BatchTaskMigrationOptions {
	/** Onto project ID (must already exist) */
	projectId: string;
	/** Onto plan ID to link tasks to (optional - deprecated, use phaseToPlanMapping) */
	planId?: string | null;
	/**
	 * Mapping from legacy phase_id to onto plan_id.
	 * Used to correctly link each task to its phase's plan.
	 */
	phaseToPlanMapping?: Record<string, string | null>;
	/**
	 * Mapping from legacy task_id to phase_id.
	 * Used to determine which plan each task belongs to.
	 */
	taskToPhaseMapping?: Record<string, string | null>;
	/** Actor ID for created_by field */
	actorId: string;
	/** Batch size for classification (default: 20) */
	batchSize?: number;
	/** Allow template creation for new type_keys (default: true) */
	allowTemplateCreation?: boolean;
	/** Dry run mode - no DB writes (default: false) */
	dryRun?: boolean;
	/** Progress callback */
	onProgress?: (progress: BatchProgress) => void;
}

/** Progress tracking */
export interface BatchProgress {
	phase: 'classify' | 'resolve' | 'extract' | 'insert';
	batchNumber: number;
	totalBatches: number;
	tasksProcessed: number;
	totalTasks: number;
	currentOperation: string;
}

/** Batch migration result */
export interface BatchMigrationResult {
	success: boolean;
	tasksMigrated: number;
	templatesCreated: string[];
	templatesReused: string[];
	typeKeyDistribution: Record<string, number>;
	schedulingStats: {
		scheduled: number;
		unscheduled: number;
		recurring: number;
	};
	timing: {
		classifyMs: number;
		resolveMs: number;
		extractMs: number;
		insertMs: number;
		totalMs: number;
	};
	errors: Array<{
		legacyId: string;
		phase: string;
		error: string;
	}>;
	/** Preview data for dry-run mode */
	preview?: BatchPreviewData;
}

/** Preview data for dry-run */
export interface BatchPreviewData {
	classifications: TaskClassification[];
	templateResolutions: Array<{
		typeKey: string;
		templateId: string | null;
		created: boolean;
		parentFallback: boolean;
	}>;
	extractedProps: Array<{
		legacyId: string;
		typeKey: string;
		props: Record<string, unknown>;
		confidence: number;
	}>;
}

/** Classification result for a single task */
interface TaskClassification {
	index: number;
	legacyId: string;
	typeKey: string;
	confidence: number;
	rationale: string;
}

/** LLM response for batch classification */
interface LLMClassificationResponse {
	classifications: Array<{
		index: number;
		type_key: string;
		confidence: number;
		rationale: string;
	}>;
}

/** LLM response for batch property extraction */
interface LLMBatchExtractionResponse {
	extractions: Array<{
		index: number;
		legacy_id: string;
		props: Record<string, unknown>;
		confidence: number;
	}>;
}

/** Extraction result for a single task */
interface TaskExtraction {
	legacyId: string;
	typeKey: string;
	props: Record<string, unknown>;
	confidence: number;
	validationErrors?: string[];
}

/** Template metadata (stub - template table removed) */
interface TemplateMetadata {
	template: { id: string; type_key: string; name: string } | null;
	created: boolean;
	parentFallback: boolean;
}

/** Task prepared for classification */
interface ClassificationTask {
	legacyId: string;
	title: string;
	description: string;
	details: string;
	status: string;
	priority: number | null;
	startDate: string | null;
	isRecurring: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_BATCH_SIZE = 20;
const MAX_TEMPLATES_TO_LOAD = 50;
const DEFAULT_CLASSIFICATION_CONFIDENCE = 0.8;

/**
 * Feature flag for two-phase hierarchical task classification.
 * When enabled:
 * - Phase 1: Fast model selects work_mode for all tasks
 * - Phase 2: Balanced model selects specialization within each work_mode group
 */
const ENABLE_TWO_PHASE_CLASSIFICATION = true;

// 8 base work modes for tasks
const VALID_WORK_MODES = [
	'execute',
	'create',
	'refine',
	'research',
	'review',
	'coordinate',
	'admin',
	'plan'
] as const;

type WorkMode = (typeof VALID_WORK_MODES)[number];

/** Work mode descriptions for LLM context (used in Phase 1) */
const WORK_MODE_DESCRIPTIONS: Record<WorkMode, string> = {
	execute: 'Action tasks - doing the actual work (default for most tasks)',
	create: 'Producing NEW artifacts from scratch - writing, designing, building',
	refine: 'Improving EXISTING work - editing, polishing, optimizing',
	research: 'Investigating and gathering information - analysis, discovery, learning',
	review: 'Evaluating and providing feedback - code review, design review, QA',
	coordinate: 'Syncing with others - meetings, standups, interviews, collaboration',
	admin: 'Administrative housekeeping - reporting, filing, cleanup, maintenance',
	plan: 'Strategic thinking and planning - sprint planning, roadmap planning'
};

/** LLM response for work mode classification */
interface LLMWorkModeResponse {
	classifications: Array<{
		index: number;
		work_mode: WorkMode;
		confidence: number;
		rationale: string;
	}>;
}

/** LLM response for specialization classification */
interface LLMSpecializationResponse {
	classifications: Array<{
		index: number;
		specialization: string | null;
		confidence: number;
		rationale: string;
	}>;
}

/** Intermediate classification with work mode only */
interface WorkModeClassification {
	index: number;
	legacyId: string;
	workMode: WorkMode;
	confidence: number;
	rationale: string;
	legacyTask: LegacyTask;
}

// ============================================
// SERVICE IMPLEMENTATION
// ============================================

export class BatchTaskMigrationService {
	constructor(
		private readonly client: TypedSupabaseClient,
		private readonly llm: SmartLLMService
	) {}

	/**
	 * Migrate a batch of legacy tasks using optimized batch operations.
	 *
	 * @param legacyTasks - Array of legacy tasks to migrate
	 * @param context - Migration context with run/batch IDs
	 * @param options - Batch migration options
	 */
	async migrateProjectTasks(
		legacyTasks: LegacyTask[],
		context: MigrationContext,
		options: BatchTaskMigrationOptions
	): Promise<BatchMigrationResult> {
		const startTotal = Date.now();
		const timing = { classifyMs: 0, resolveMs: 0, extractMs: 0, insertMs: 0, totalMs: 0 };
		const errors: BatchMigrationResult['errors'] = [];
		const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

		console.info(
			`[BatchTaskMigration] START tasks=${legacyTasks.length} batchSize=${batchSize} ` +
				`dryRun=${options.dryRun ?? false} projectId=${options.projectId}`
		);

		// Filter out deleted and completed tasks (should already be done, but ensure)
		const activeTasks = legacyTasks.filter(
			(t) => !t.deleted_at && t.status !== 'completed' && t.status !== 'done'
		);

		if (activeTasks.length === 0) {
			return this.buildEmptyResult(timing);
		}

		// Split into batches
		const batches = this.chunkArray(activeTasks, batchSize);
		const allClassifications: TaskClassification[] = [];
		let templateCache: Map<string, ResolvedTemplateWithMeta> = new Map();
		const allExtractions: TaskExtraction[] = [];

		// ========== PHASE 1: BATCH CLASSIFICATION ==========
		const startClassify = Date.now();
		for (let i = 0; i < batches.length; i++) {
			const batch = batches[i]!;
			options.onProgress?.({
				phase: 'classify',
				batchNumber: i + 1,
				totalBatches: batches.length,
				tasksProcessed: i * batchSize,
				totalTasks: activeTasks.length,
				currentOperation: `Classifying batch ${i + 1}/${batches.length}`
			});

			try {
				const batchClassifications = await this.classifyBatch(
					batch,
					options.projectId,
					context.initiatedBy
				);
				allClassifications.push(...batchClassifications);
			} catch (error) {
				console.error(`[BatchTaskMigration] Classification batch ${i + 1} failed:`, error);
				// Fall back to default classification for failed batch
				for (const task of batch) {
					allClassifications.push({
						index: allClassifications.length,
						legacyId: task.id,
						typeKey: 'task.execute', // Default fallback
						confidence: 0.5,
						rationale: 'Classification failed, using default'
					});
					errors.push({
						legacyId: task.id,
						phase: 'classify',
						error: error instanceof Error ? error.message : 'Unknown error'
					});
				}
			}
		}
		timing.classifyMs = Date.now() - startClassify;
		console.info(
			`[BatchTaskMigration] PHASE_1_COMPLETE classifications=${allClassifications.length} ` +
				`uniqueTypes=${new Set(allClassifications.map((c) => c.typeKey)).size} ` +
				`duration=${timing.classifyMs}ms`
		);

		// ========== PHASE 2: BATCH TEMPLATE RESOLUTION (REMOVED) ==========
		const startResolve = Date.now();
		const uniqueTypeKeys = [...new Set(allClassifications.map((c) => c.typeKey))];

		// Template resolution removed - tasks will need templates to be created separately
		console.warn(
			'[BatchTaskMigration] Template resolution removed - templates must exist before migration'
		);

		timing.resolveMs = Date.now() - startResolve;

		// ========== PHASE 3: BATCH PROPERTY EXTRACTION (REMOVED) ==========
		const startExtract = Date.now();

		// Property extraction removed - tasks will use minimal props
		console.warn('[BatchTaskMigration] Property extraction removed - using minimal task data');

		// Create minimal extractions for all tasks
		for (let i = 0; i < allClassifications.length; i++) {
			const classification = allClassifications[i]!;
			const legacyTask = activeTasks[i]!;
			allExtractions.push({
				legacyId: classification.legacyId,
				typeKey: classification.typeKey,
				props: {
					title: legacyTask.title,
					description: legacyTask.description ?? null
				},
				confidence: 0.5
			});
		}

		timing.extractMs = Date.now() - startExtract;
		console.info(
			`[BatchTaskMigration] PHASE_3_COMPLETE extractions=${allExtractions.length} (minimal) ` +
				`duration=${timing.extractMs}ms`
		);

		// ========== PHASE 4: BATCH INSERT ==========
		let tasksMigrated = 0;
		if (!options.dryRun) {
			const startInsert = Date.now();

			options.onProgress?.({
				phase: 'insert',
				batchNumber: 1,
				totalBatches: 1,
				tasksProcessed: 0,
				totalTasks: allExtractions.length,
				currentOperation: `Inserting ${allExtractions.length} tasks`
			});

			try {
				tasksMigrated = await this.batchInsertTasks(
					allExtractions,
					allClassifications,
					templateCache,
					activeTasks,
					options,
					context
				);
			} catch (error) {
				console.error('[BatchTaskMigration] Batch insert failed:', error);
				errors.push({
					legacyId: 'batch',
					phase: 'insert',
					error: error instanceof Error ? error.message : 'Unknown error'
				});
			}
			timing.insertMs = Date.now() - startInsert;
			console.info(
				`[BatchTaskMigration] PHASE_4_COMPLETE inserted=${tasksMigrated} ` +
					`duration=${timing.insertMs}ms`
			);
		}

		timing.totalMs = Date.now() - startTotal;

		// Build result
		const typeKeyDistribution: Record<string, number> = {};
		for (const c of allClassifications) {
			typeKeyDistribution[c.typeKey] = (typeKeyDistribution[c.typeKey] ?? 0) + 1;
		}

		const schedulingStats = {
			scheduled: activeTasks.filter((t) => t.start_date).length,
			unscheduled: activeTasks.filter((t) => !t.start_date).length,
			recurring: activeTasks.filter((t) => t.recurrence_pattern).length
		};

		const result: BatchMigrationResult = {
			success: errors.length === 0,
			tasksMigrated,
			templatesCreated: [...templateCache.values()]
				.filter((t) => t.created)
				.map((t) => t.template.type_key),
			templatesReused: [...templateCache.values()]
				.filter((t) => !t.created && !t.parentFallback)
				.map((t) => t.template.type_key),
			typeKeyDistribution,
			schedulingStats,
			timing,
			errors
		};

		// Add preview for dry-run
		if (options.dryRun) {
			result.preview = {
				classifications: allClassifications,
				templateResolutions: [...templateCache.entries()].map(([typeKey, meta]) => ({
					typeKey,
					templateId: meta.template.id,
					created: meta.created,
					parentFallback: meta.parentFallback
				})),
				extractedProps: allExtractions.map((e) => ({
					legacyId: e.legacyId,
					typeKey: e.typeKey,
					props: e.props,
					confidence: e.confidence
				}))
			};
		}

		console.info(
			`[BatchTaskMigration] COMPLETE success=${result.success} migrated=${tasksMigrated} ` +
				`errors=${errors.length} totalTime=${timing.totalMs}ms`
		);

		return result;
	}

	// ============================================
	// PHASE 1: BATCH CLASSIFICATION
	// ============================================

	/**
	 * Classify a batch of tasks into type_keys.
	 *
	 * When ENABLE_TWO_PHASE_CLASSIFICATION is true:
	 * - Phase 1: Fast model selects work_mode (8 options)
	 * - Phase 2: Balanced model selects specialization per work_mode group
	 *
	 * When disabled, uses single-pass classification.
	 */
	private async classifyBatch(
		tasks: LegacyTask[],
		projectId: string,
		userId: string
	): Promise<TaskClassification[]> {
		if (ENABLE_TWO_PHASE_CLASSIFICATION) {
			return this.classifyBatchTwoPhase(tasks, projectId, userId);
		}
		return this.classifyBatchSinglePass(tasks, projectId, userId);
	}

	/**
	 * Two-phase hierarchical classification.
	 *
	 * Phase 1: Fast model selects work_mode for all tasks (8 choices)
	 * Phase 2: For each work_mode group, select specialization (focused choices)
	 */
	private async classifyBatchTwoPhase(
		tasks: LegacyTask[],
		projectId: string,
		userId: string
	): Promise<TaskClassification[]> {
		console.info(`[BatchTaskMigration] TWO_PHASE_START tasks=${tasks.length}`);

		// ========== PHASE 1: WORK MODE CLASSIFICATION (Fast Model) ==========
		const phase1Start = Date.now();

		const preparedTasks: ClassificationTask[] = tasks.map((task) => ({
			legacyId: task.id,
			title: task.title,
			description: task.description ?? '',
			details: task.details ? task.details.slice(0, 200) : '',
			status: String(task.status),
			priority: this.priorityToNumber(task.priority),
			startDate: task.start_date,
			isRecurring: !!task.recurrence_pattern
		}));

		const workModeClassifications = await this.classifyWorkModes(preparedTasks, tasks, userId);

		const phase1Duration = Date.now() - phase1Start;
		const workModeDistribution = this.countBy(workModeClassifications, (c) => c.workMode);
		console.info(
			`[BatchTaskMigration] PHASE1_COMPLETE duration=${phase1Duration}ms ` +
				`distribution=${JSON.stringify(workModeDistribution)}`
		);

		// ========== PHASE 2: SPECIALIZATION CLASSIFICATION (Per Work Mode) ==========
		const phase2Start = Date.now();

		// Group tasks by work mode
		const tasksByWorkMode = this.groupBy(workModeClassifications, (c) => c.workMode);
		const finalClassifications: TaskClassification[] = [];

		for (const [workMode, tasksInMode] of Object.entries(tasksByWorkMode)) {
			if (tasksInMode.length === 0) continue;

			// Get specializations for this work mode
			const specializations = await this.classifySpecializations(
				tasksInMode,
				workMode as WorkMode,
				userId
			);

			finalClassifications.push(...specializations);
		}

		const phase2Duration = Date.now() - phase2Start;
		console.info(
			`[BatchTaskMigration] PHASE2_COMPLETE duration=${phase2Duration}ms ` +
				`classifications=${finalClassifications.length}`
		);

		// Sort by original index to maintain order
		finalClassifications.sort((a, b) => a.index - b.index);

		return finalClassifications;
	}

	/**
	 * Phase 1: Classify work modes using fast model.
	 * Simple 8-way classification with clear descriptions.
	 */
	private async classifyWorkModes(
		preparedTasks: ClassificationTask[],
		tasks: LegacyTask[],
		userId: string
	): Promise<WorkModeClassification[]> {
		const workModeList = Object.entries(WORK_MODE_DESCRIPTIONS)
			.map(([mode, desc]) => `- ${mode}: ${desc}`)
			.join('\n');

		const systemPrompt = `You classify tasks into work modes. Choose ONE work mode per task.

## Work Modes (choose EXACTLY one per task)
${workModeList}

## Selection Rules
1. Default to "execute" when unsure
2. "create" = producing NEW from scratch
3. "refine" = improving EXISTING work
4. "coordinate" = involving other people
5. "research" = investigation/learning
6. "review" = solo evaluation (not with others)`;

		const taskList = preparedTasks
			.map(
				(t, i) =>
					`[${i}] "${t.title}" - ${t.description || t.details || '(no description)'}`
			)
			.join('\n');

		const userPrompt = `## Tasks (${preparedTasks.length} total)
${taskList}

## Output Format (JSON)
{ "classifications": [{ "index": 0, "work_mode": "execute", "confidence": 90, "rationale": "brief" }, ...] }

IMPORTANT: Include ALL ${preparedTasks.length} tasks. work_mode MUST be one of: ${VALID_WORK_MODES.join(', ')}`;

		const response = await this.llm.getJSONResponse<LLMWorkModeResponse>({
			systemPrompt,
			userPrompt,
			userId,
			profile: 'fast', // Fast model for simple 8-way classification
			temperature: 0.1,
			validation: {
				retryOnParseError: true,
				maxRetries: 2
			},
			operationType: 'batch_task_migration.work_mode_classification'
		});

		if (!response?.classifications) {
			// Fallback: assign all to 'execute'
			console.warn(
				'[BatchTaskMigration] Work mode classification failed, using execute fallback'
			);
			return preparedTasks.map((t, i) => ({
				index: i,
				legacyId: t.legacyId,
				workMode: 'execute' as WorkMode,
				confidence: 0.5,
				rationale: 'Fallback to execute',
				legacyTask: tasks[i]!
			}));
		}

		return response.classifications.map((c, i) => {
			const idx = c.index ?? i;
			const workMode = this.validateWorkMode(c.work_mode);
			return {
				index: idx,
				legacyId: preparedTasks[idx]?.legacyId ?? tasks[i]!.id,
				workMode,
				confidence: (c.confidence ?? 80) / 100,
				rationale: c.rationale ?? 'No rationale',
				legacyTask: tasks[idx]!
			};
		});
	}

	/**
	 * Phase 2: Classify specializations within a work mode.
	 * Only called for tasks in that work mode group.
	 */
	private async classifySpecializations(
		tasksInMode: WorkModeClassification[],
		workMode: WorkMode,
		userId: string
	): Promise<TaskClassification[]> {
		// If only a few tasks, skip specialization and use base work mode
		if (tasksInMode.length <= 2) {
			return tasksInMode.map((t) => ({
				index: t.index,
				legacyId: t.legacyId,
				typeKey: `task.${workMode}`,
				confidence: t.confidence,
				rationale: `${t.rationale} (base work mode)`
			}));
		}

		// Get common specializations for this work mode from existing templates
		const existingSpecializations = await this.getExistingSpecializations(workMode);

		const systemPrompt = `You add specializations to tasks already classified as "${workMode}".

## Work Mode: ${workMode}
${WORK_MODE_DESCRIPTIONS[workMode]}

## Existing Specializations for task.${workMode}
${existingSpecializations.length > 0 ? existingSpecializations.map((s) => `- ${s}`).join('\n') : '- (none yet - you may suggest new ones)'}

## Rules
1. Use an existing specialization if it fits well
2. Suggest a NEW specialization only if existing ones don't fit
3. Use null/empty for base work mode (no specialization needed)
4. Specializations should be single words or underscore_separated`;

		const taskList = tasksInMode
			.map(
				(t, i) =>
					`[${i}] "${t.legacyTask.title}" - ${t.legacyTask.description || '(no description)'}`
			)
			.join('\n');

		const userPrompt = `## Tasks in "${workMode}" mode (${tasksInMode.length} total)
${taskList}

## Output Format (JSON)
{ "classifications": [{ "index": 0, "specialization": "meeting" or null, "confidence": 90, "rationale": "brief" }, ...] }

IMPORTANT: Include ALL ${tasksInMode.length} tasks. Use null for base work mode.`;

		const response = await this.llm.getJSONResponse<LLMSpecializationResponse>({
			systemPrompt,
			userPrompt,
			userId,
			profile: 'balanced', // Balanced model for nuanced specialization
			temperature: 0.2,
			validation: {
				retryOnParseError: true,
				maxRetries: 2
			},
			operationType: 'batch_task_migration.specialization_classification'
		});

		if (!response?.classifications) {
			// Fallback: use base work mode
			return tasksInMode.map((t) => ({
				index: t.index,
				legacyId: t.legacyId,
				typeKey: `task.${workMode}`,
				confidence: t.confidence * 0.8,
				rationale: `${t.rationale} (specialization fallback)`
			}));
		}

		return response.classifications.map((c, i) => {
			const idx = c.index ?? i;
			const baseTask = tasksInMode[idx]!;
			const specialization = c.specialization
				? this.normalizeSpecialization(c.specialization)
				: null;
			const typeKey = specialization
				? `task.${workMode}.${specialization}`
				: `task.${workMode}`;

			return {
				index: baseTask.index,
				legacyId: baseTask.legacyId,
				typeKey,
				confidence: ((c.confidence ?? 80) / 100) * baseTask.confidence,
				rationale: `${baseTask.rationale} → ${c.rationale ?? 'specialized'}`
			};
		});
	}

	/**
	 * Get existing specializations for a work mode.
	 * Returns common specializations since template table is no longer used.
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	private async getExistingSpecializations(_workMode: WorkMode): Promise<string[]> {
		// Common specializations used across work modes
		return ['meeting', 'standup', 'review', 'deploy', 'checklist', 'planning'];
	}

	/**
	 * Validate work mode is one of the 8 valid options.
	 */
	private validateWorkMode(workMode: string): WorkMode {
		const lower = workMode?.toLowerCase() ?? 'execute';
		if (VALID_WORK_MODES.includes(lower as WorkMode)) {
			return lower as WorkMode;
		}
		console.warn(`[BatchTaskMigration] Invalid work mode "${workMode}", using execute`);
		return 'execute';
	}

	/**
	 * Normalize specialization to valid format.
	 */
	private normalizeSpecialization(spec: string): string {
		return spec
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '');
	}

	/**
	 * Count items by key.
	 */
	private countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
		const counts: Record<string, number> = {};
		for (const item of items) {
			const key = keyFn(item);
			counts[key] = (counts[key] ?? 0) + 1;
		}
		return counts;
	}

	/**
	 * Convert priority string to number.
	 */
	private priorityToNumber(priority: string | number | null | undefined): number | null {
		if (priority === null || priority === undefined) return null;
		if (typeof priority === 'number') return priority;
		const map: Record<string, number> = { low: 1, medium: 2, high: 3 };
		return map[priority.toLowerCase()] ?? null;
	}

	/**
	 * Single-pass classification (original implementation).
	 * Used when two-phase classification is disabled.
	 */
	private async classifyBatchSinglePass(
		tasks: LegacyTask[],
		projectId: string,
		userId: string
	): Promise<TaskClassification[]> {
		// Prepare tasks for classification
		const preparedTasks: ClassificationTask[] = tasks.map((task) => ({
			legacyId: task.id,
			title: task.title,
			description: task.description ?? '',
			details: task.details ? task.details.slice(0, 200) : '', // Truncate to 200 chars
			status: String(task.status),
			priority: this.priorityToNumber(task.priority),
			startDate: task.start_date,
			isRecurring: !!task.recurrence_pattern
		}));

		const systemPrompt = this.buildClassificationSystemPrompt();
		const userPrompt = this.buildClassificationUserPrompt(preparedTasks, projectId);

		const response = await this.llm.getJSONResponse<LLMClassificationResponse>({
			systemPrompt,
			userPrompt,
			userId,
			profile: 'fast',
			temperature: 0.1,
			validation: {
				retryOnParseError: true,
				maxRetries: 2
			},
			operationType: 'batch_task_migration.classification'
		});

		if (!response?.classifications) {
			throw new Error('Classification returned empty response');
		}

		// Map response to TaskClassification
		return response.classifications.map((c, i) => {
			const normalizedTypeKey = this.normalizeTypeKey(c.type_key);
			return {
				index: c.index ?? i,
				legacyId: preparedTasks[c.index ?? i]?.legacyId ?? tasks[i]!.id,
				typeKey: normalizedTypeKey,
				confidence: (c.confidence ?? DEFAULT_CLASSIFICATION_CONFIDENCE) / 100,
				rationale: c.rationale ?? 'No rationale provided'
			};
		});
	}

	private buildClassificationSystemPrompt(): string {
		return `You are classifying tasks into a work mode taxonomy.

## Task Type Key Format
Format: task.{work_mode}[.{specialization}]

- Maximum 3 segments (e.g., task.execute.deploy)
- Use lowercase with underscores for multi-word (e.g., task.coordinate.code_review)

## 8 Required Work Modes (Second Segment)
These are the ONLY valid work modes:

| Work Mode | Type Key | Use When |
|-----------|----------|----------|
| execute | task.execute | Action tasks - doing the work (DEFAULT) |
| create | task.create | Producing NEW artifacts from scratch |
| refine | task.refine | Improving EXISTING work |
| research | task.research | Investigating, gathering information |
| review | task.review | Evaluating, providing feedback |
| coordinate | task.coordinate | Syncing with others, meetings |
| admin | task.admin | Administrative housekeeping |
| plan | task.plan | Strategic thinking, planning |

## Dynamic Specializations (Third Segment - OPTIONAL)
You MAY add a specialization to be more specific. Specializations are DYNAMIC -
suggest whatever fits the task best. The system will create templates as needed.

Examples of valid specializations:
- task.coordinate.meeting - Any scheduled meeting
- task.coordinate.standup - Daily sync meetings
- task.coordinate.interview - Interview sessions
- task.execute.deploy - Production deployments
- task.execute.migration - Data/system migrations
- task.execute.setup - Environment/project setup
- task.create.design - Design work
- task.create.prototype - Building prototypes
- task.review.code - Code reviews
- task.review.design - Design reviews
- task.research.competitor - Competitor analysis
- task.research.user - User research
- task.admin.reporting - Reporting tasks
- task.plan.sprint - Sprint planning

Guidelines for specializations:
1. Only add a specialization if it provides meaningful distinction
2. Use single words or underscore_separated words
3. Be specific but not overly verbose
4. If unsure, omit specialization (use base work mode)

## Selection Rules
1. Default to task.execute when unsure
2. Use task.create ONLY when producing something NEW from scratch
3. Use task.refine when improving EXISTING work
4. Use task.coordinate for any people-sync (meetings, calls, reviews with others)
5. Use task.research for investigation/learning tasks
6. Use task.review for solo evaluation/feedback tasks`;
	}

	private buildClassificationUserPrompt(tasks: ClassificationTask[], projectId: string): string {
		const taskList = tasks
			.map(
				(t, i) =>
					`[${i}] "${t.title}"
   Description: ${t.description || '(none)'}
   Details: ${t.details || '(none)'}
   Status: ${t.status}`
			)
			.join('\n\n');

		return `## Project ID
${projectId}

## Tasks to Classify (${tasks.length} tasks)
${taskList}

## Output Format (JSON)
Return a JSON object with classifications array. You MAY suggest new specializations - the system will create them.

{
  "classifications": [
    { "index": 0, "type_key": "task.execute", "confidence": 90, "rationale": "Basic action item" },
    { "index": 1, "type_key": "task.coordinate.meeting", "confidence": 95, "rationale": "Team sync" },
    { "index": 2, "type_key": "task.review.code", "confidence": 88, "rationale": "PR review task" },
    ...
  ]
}

IMPORTANT:
- Include ALL ${tasks.length} tasks in your response
- confidence should be 0-100 (will be converted to 0-1 scale)
- type_key MUST start with "task."
- Second segment MUST be one of: execute, create, refine, research, review, coordinate, admin, plan`;
	}

	private normalizeTypeKey(typeKey: string): string {
		if (!typeKey) return 'task.execute';

		// Ensure starts with task.
		let normalized = typeKey.toLowerCase().trim();
		if (!normalized.startsWith('task.')) {
			normalized = `task.${normalized}`;
		}

		// Split and validate
		const parts = normalized.split('.');
		if (parts.length < 2) return 'task.execute';

		// Validate work mode
		const workMode = parts[1];
		if (!workMode || !(VALID_WORK_MODES as readonly string[]).includes(workMode)) {
			return 'task.execute';
		}

		// Normalize specialization if present
		if (parts.length >= 3 && parts[2]) {
			const specialization = parts[2].replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
			if (specialization) {
				return `task.${workMode}.${specialization}`;
			}
		}

		return `task.${workMode}`;
	}

	// ============================================
	// PHASE 2 & 3: TEMPLATE RESOLUTION AND PROPERTY EXTRACTION (REMOVED)
	// ============================================
	// Template resolution and property extraction have been removed.
	// Tasks are migrated with minimal properties from legacy data only.

	// ============================================
	// PHASE 4: BATCH DATABASE OPERATIONS
	// ============================================

	/**
	 * Batch insert tasks, edges, and mappings.
	 */
	private async batchInsertTasks(
		extractions: TaskExtraction[],
		classifications: TaskClassification[],
		templateCache: Map<string, TemplateMetadata>,
		legacyTasks: LegacyTask[],
		options: BatchTaskMigrationOptions,
		context: MigrationContext
	): Promise<number> {
		// Build legacy task lookup
		const legacyTaskMap = new Map<string, LegacyTask>();
		for (const task of legacyTasks) {
			legacyTaskMap.set(task.id, task);
		}

		// Build classification lookup
		const classificationMap = new Map<string, TaskClassification>();
		for (const c of classifications) {
			classificationMap.set(c.legacyId, c);
		}

		// ========== IDEMPOTENCY CHECK ==========
		// Check for existing mappings to avoid creating duplicate entities
		const legacyIds = extractions.map((e) => e.legacyId);
		const existingMappings = await getLegacyMappingsBatch(this.client, 'tasks', legacyIds);

		if (existingMappings.size > 0) {
			console.info(
				`[BatchTaskMigration] IDEMPOTENCY: Found ${existingMappings.size} already-migrated tasks, skipping`
			);
		}

		// Filter out already-migrated tasks
		const newExtractions = extractions.filter((e) => !existingMappings.has(e.legacyId));

		if (newExtractions.length === 0) {
			console.info('[BatchTaskMigration] All tasks already migrated, nothing to do');
			return 0;
		}

		console.info(
			`[BatchTaskMigration] Processing ${newExtractions.length} new tasks (${existingMappings.size} skipped)`
		);

		// 1. Prepare all task records
		const taskRecords: Array<{
			id: string;
			title: string;
			project_id: string;
			type_key: string;
			template_id: string | null;
			state_key: string;
			priority: number;
			due_at: string | null;
			props: Json;
			created_by: string;
			_legacy_id: string; // Temporary for mapping
			_plan_id: string | null; // Per-task plan ID
		}> = [];

		for (const extraction of newExtractions) {
			const legacyTask = legacyTaskMap.get(extraction.legacyId);
			if (!legacyTask) continue;

			const classification = classificationMap.get(extraction.legacyId);
			const typeKey = classification?.typeKey ?? extraction.typeKey;
			const templateMeta = templateCache.get(typeKey);

			if (!templateMeta) {
				console.warn(
					`[BatchTaskMigration] No template for ${typeKey}, skipping task ${extraction.legacyId}`
				);
				continue;
			}

			// No template merging - use extraction props directly
			// Add metadata to props
			const propsWithMetadata = {
				...extraction.props,
				description: legacyTask.description ?? null,
				type_key: typeKey,
				facets: { scale: this.inferScale(legacyTask) }
			};

			// ========== FIX: Resolve per-task plan ID ==========
			// Look up the phase for this task, then get the plan for that phase
			let planId: string | null = null;
			if (options.phaseToPlanMapping && options.taskToPhaseMapping) {
				const phaseId = options.taskToPhaseMapping[extraction.legacyId];
				if (phaseId) {
					planId = options.phaseToPlanMapping[phaseId] ?? null;
				}
			} else if (options.planId) {
				// Fallback to single planId for backwards compatibility
				planId = options.planId;
			}

			taskRecords.push({
				id: crypto.randomUUID(),
				title: legacyTask.title,
				project_id: options.projectId,
				type_key: typeKey,
				template_id: templateMeta.template.id,
				state_key: this.mapStatusToState(legacyTask.status),
				priority: this.mapPriority(legacyTask.priority),
				due_at: legacyTask.start_date ?? null, // start_date → due_at
				props: propsWithMetadata as Json,
				created_by: options.actorId,
				_legacy_id: extraction.legacyId,
				_plan_id: planId
			});
		}

		if (taskRecords.length === 0) {
			return 0;
		}

		// 2. Batch insert tasks
		const insertRecords = taskRecords.map((r) => ({
			id: r.id,
			title: r.title,
			project_id: r.project_id,
			type_key: r.type_key,
			state_key: r.state_key,
			priority: r.priority,
			due_at: r.due_at,
			props: r.props,
			created_by: r.created_by
		}));

		const { data: insertedTasks, error: taskError } = await this.client
			.from('onto_tasks')
			.insert(insertRecords)
			.select('id');

		if (taskError) {
			throw new Error(`Batch task insert failed: ${taskError.message}`);
		}

		const insertedIds = (insertedTasks ?? []).map((t) => t.id);
		console.info(`[BatchTaskMigration] Inserted ${insertedIds.length} tasks`);

		// 3. Batch insert edges (task → plan relationships) using per-task plan IDs
		const edgeRecords: Array<{
			src_id: string;
			src_kind: string;
			dst_id: string;
			dst_kind: string;
			rel: string;
		}> = [];

		for (let i = 0; i < taskRecords.length; i++) {
			const record = taskRecords[i];
			const insertedId = insertedIds[i];
			if (!record || !insertedId || !record._plan_id) continue;

			edgeRecords.push(
				{
					src_id: insertedId,
					src_kind: 'task',
					dst_id: record._plan_id,
					dst_kind: 'plan',
					rel: 'belongs_to_plan'
				},
				{
					src_id: record._plan_id,
					src_kind: 'plan',
					dst_id: insertedId,
					dst_kind: 'task',
					rel: 'has_task'
				}
			);
		}

		if (edgeRecords.length > 0) {
			const { error: edgeError } = await this.client.from('onto_edges').insert(edgeRecords);

			if (edgeError) {
				console.error(
					`[BatchTaskMigration] Edge insert failed for ${edgeRecords.length} edges: ${edgeError.message}`
				);
				// Throw to ensure edge creation failures are not silently ignored
				throw new Error(`Failed to create task-plan edges in batch: ${edgeError.message}`);
			} else {
				console.info(`[BatchTaskMigration] Inserted ${edgeRecords.length} edges`);
			}
		}

		// 4. Batch insert legacy mappings
		const mappingPromises = taskRecords.map((record, i) => {
			const insertedId = insertedIds[i];
			if (!insertedId) return Promise.resolve();

			const legacyTask = legacyTaskMap.get(record._legacy_id);
			if (!legacyTask) return Promise.resolve();

			return upsertLegacyMapping(this.client, {
				legacyTable: 'tasks',
				legacyId: record._legacy_id,
				ontoTable: 'onto_tasks',
				ontoId: insertedId,
				record: legacyTask,
				metadata: {
					run_id: context.runId,
					batch_id: context.batchId,
					template_used: record.type_key,
					plan_id: record._plan_id,
					batch_migration: true
				}
			});
		});

		await Promise.all(mappingPromises);
		console.info(`[BatchTaskMigration] Inserted ${taskRecords.length} legacy mappings`);

		return insertedIds.length;
	}

	// ============================================
	// HELPER METHODS
	// ============================================

	private buildEmptyResult(timing: BatchMigrationResult['timing']): BatchMigrationResult {
		return {
			success: true,
			tasksMigrated: 0,
			templatesCreated: [],
			templatesReused: [],
			typeKeyDistribution: {},
			schedulingStats: { scheduled: 0, unscheduled: 0, recurring: 0 },
			timing,
			errors: []
		};
	}

	private chunkArray<T>(array: T[], size: number): T[][] {
		const chunks: T[][] = [];
		for (let i = 0; i < array.length; i += size) {
			chunks.push(array.slice(i, i + size));
		}
		return chunks;
	}

	private groupBy<T, K extends string>(array: T[], keyFn: (item: T) => K): Record<K, T[]> {
		return array.reduce(
			(acc, item) => {
				const key = keyFn(item);
				if (!acc[key]) {
					acc[key] = [];
				}
				acc[key].push(item);
				return acc;
			},
			{} as Record<K, T[]>
		);
	}

	private mapStatusToState(status: LegacyTask['status']): string {
		switch (status) {
			case 'completed':
			case 'done':
				return 'done';
			case 'in_progress':
				return 'in_progress';
			case 'pending':
				return 'todo';
			case 'blocked':
				return 'blocked';
			default:
				return 'todo';
		}
	}

	private mapPriority(priority: number | null): number {
		if (priority === null) return 3; // Default medium priority
		return Math.max(1, Math.min(5, Math.round(priority)));
	}

	private inferScale(task: LegacyTask): 'micro' | 'small' | 'medium' | 'large' | 'epic' {
		const descLength = (task.description ?? '').length;
		const notesLength = (task.notes ?? '').length;
		const totalLength = descLength + notesLength;

		if (totalLength > 1000) return 'large';
		if (totalLength > 500) return 'medium';
		if (totalLength > 100) return 'small';
		return 'micro';
	}
}

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Create a BatchTaskMigrationService instance
 */
export function createBatchTaskMigrationService(
	client: TypedSupabaseClient,
	llm: SmartLLMService
): BatchTaskMigrationService {
	return new BatchTaskMigrationService(client, llm);
}
