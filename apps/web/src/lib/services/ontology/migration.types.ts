// apps/web/src/lib/services/ontology/migration.types.ts
import type { Database, Json } from '@buildos/shared-types';

export type MigrationScope = 'run' | 'project' | 'phase' | 'task' | 'calendar';

export type MigrationStatus =
	| 'pending'
	| 'in_progress'
	| 'completed'
	| 'failed'
	| 'skipped'
	| 'paused'
	| 'rolled_back';

export interface MigrationRunOptions {
	projectIds?: string[];
	includeArchived?: boolean;
	batchSize?: number;
	dryRun?: boolean;
}

export interface MigrationAnalysisOptions extends MigrationRunOptions {
	limit?: number;
}

export interface MigrationServiceContext {
	runId: string;
	batchId: string;
	dryRun: boolean;
	initiatedBy: string;
	featureFlags: {
		dualWriteProjects: boolean;
	};
	now: string;
}

export interface MigrationLogRecord {
	id: number;
	run_id: string;
	batch_id: string | null;
	org_id: string | null;
	entity_type: MigrationScope;
	operation: string;
	legacy_table: string | null;
	legacy_id: string | null;
	onto_table: string | null;
	onto_id: string | null;
	status: MigrationStatus;
	error_message: string | null;
	metadata: Json;
	created_at: string;
	updated_at: string;
}

export interface MigrationBatchResult {
	scope: Exclude<MigrationScope, 'run'>;
	total: number;
	completed: number;
	failed: number;
	pending: number;
	details: Array<{
		legacyId: string;
		ontoId?: string | null;
		status: MigrationStatus;
		error?: string | null;
	}>;
}

type LegacyTaskStatus = Database['public']['Tables']['tasks']['Row']['status'];

export interface TaskClassificationSummary {
	typeKey: string;
	complexity: 'simple' | 'moderate' | 'complex';
	requiresDeepWork: boolean;
	isRecurring: boolean;
	reasoning: string;
}

export interface TaskMigrationRecord {
	legacyTaskId: string;
	title: string;
	legacyStatus: LegacyTaskStatus;
	phaseId: string | null;
	phaseName: string | null;
	ontoTaskId: string | null;
	suggestedOntoPlanId: string | null;
	recommendedTypeKey: string;
	recommendedStateKey: string;
	dueAt: string | null;
	priority: number | null;
	facetScale: string | null;
	calendarEventCount: number;
	status: MigrationStatus;
	notes: string;
	classification: TaskClassificationSummary;
	proposedPayload: Json;
}

export interface TaskMigrationPreviewSummary {
	total: number;
	alreadyMigrated: number;
	readyToMigrate: number;
	blocked: number;
	missingProject: number;
}

export interface TaskMigrationPreviewPayload {
	summary: TaskMigrationPreviewSummary;
	tasks: TaskMigrationRecord[];
}

export interface TaskMigrationBatchResult {
	projectId: string;
	ontoProjectId: string | null;
	tasks: TaskMigrationRecord[];
	taskMappings: Record<string, string | null>;
	summary: TaskMigrationPreviewSummary;
	preview?: TaskMigrationPreviewPayload;
}

export interface CalendarEventPreviewEntry {
	legacyEventId: string;
	taskId: string;
	taskOntoId: string | null;
	eventTitle: string | null;
	startAt: string | null;
	endAt: string | null;
	calendarId: string | null;
	syncSource: string | null;
	syncStatus: string;
	willLinkToTask: boolean;
}

export interface CalendarMigrationPreviewPayload {
	stats: {
		totalEvents: number;
		linkableEvents: number;
		blockedEvents: number;
	};
	events: CalendarEventPreviewEntry[];
}

export interface TemplateCreationPlan {
	typeKey: string;
	name: string;
	realm: string | null;
	domain: string;
	deliverable: string;
	variant?: string | null;
	parentTypeKey?: string | null;
	metadata?: Json | null;
	schema?: Json | null;
	facetDefaults?: Json | null;
	rationale?: string | null;
}

export interface TemplatePreviewPayload {
	typeKey: string;
	realm: string | null;
	domain: string | null;
	deliverable: string | null;
	variant?: string | null;
	confidence?: number | null;
	rationale?: string | null;
	created?: boolean;
	creationPlanned?: TemplateCreationPlan | null;
}

export interface MigrationPlanPreviewPayload {
	plans: Array<{
		legacyPhaseId: string | null;
		name: string;
		summary?: string;
		typeKey?: string;
		stateKey?: string;
		startDate?: string | null;
		endDate?: string | null;
		order?: number | null;
		confidence?: number | null;
	}>;
	reasoning?: string;
	confidence?: number;
	prompt?: string;
	contextPreview?: string | null;
	phasesPreview?: Array<{
		id: string;
		name: string;
		description: string | null;
		order: number;
		start_date: string;
		end_date: string;
		task_count: number;
		scheduling_method: string | null;
	}>;
}

export interface MigrationPreviewPayload {
	projectId: string;
	projectName: string;
	projectStatus: string;
	contextDocumentId: string | null;
	contextMarkdown?: string | null;
	coreValues: Record<string, string | null>;
	planPreview?: MigrationPlanPreviewPayload;
	taskPreview?: TaskMigrationPreviewPayload;
	calendarPreview?: CalendarMigrationPreviewPayload;
	templatePreview?: TemplatePreviewPayload;
}

export interface MigrationRunSummary {
	runId: string;
	status: MigrationStatus;
	scopeCounts: Record<Exclude<MigrationScope, 'run'>, {
		total: number;
		completed: number;
		failed: number;
		pending: number;
	}>;
	startedAt: string;
	updatedAt: string;
	options: MigrationRunOptions & { initiatedBy: string };
}
