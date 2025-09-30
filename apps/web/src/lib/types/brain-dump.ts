// apps/web/src/lib/types/brain-dump.ts

// ==========================================
// BRAIN DUMP TYPES
// ==========================================
import type { ProjectWithRelations } from '$lib/types/project';
import type { BrainDump } from '.';
import type { Database } from '@buildos/shared-types';

type ProjectQuestionRow = Database['public']['Tables']['project_questions']['Row'];

export type DisplayedBrainDumpQuestion = Pick<ProjectQuestionRow, 'id' | 'question'> &
	Partial<Omit<ProjectQuestionRow, 'id' | 'question'>>;

export type TableName =
	| 'projects'
	| 'tasks'
	| 'notes'
	| 'phases'
	| 'project_context'
	| 'project_notes'
	| 'brain_dumps'
	| 'daily_briefs'
	| 'project_questions';
export type OperationType = 'create' | 'update' | 'delete';

export interface ParsedOperation {
	id: string;
	table: TableName;
	operation: OperationType;
	data: {
		// Project references - only ONE should be present
		project_id?: string; // Direct UUID for existing projects
		project_ref?: string; // Reference to project being created in same batch

		// Standard fields
		[key: string]: any;
	};
	ref?: string; // This operation's reference (for new items)
	searchQuery?: string;
	conditions?: Record<string, any>; // For update operations
	enabled: boolean;
	error?: string;
	reasoning?: string;
	result?: Record<string, any>;
}

// Add specific types for clarity
export interface ProjectOperation extends ParsedOperation {
	table: 'projects';
	operation: 'create' | 'update';
	ref?: string; // Required for create operations
	data: {
		name: string;
		slug: string;
		description?: string;
		context?: string;
		executive_summary?: string;
		status?: 'active' | 'paused' | 'completed' | 'archived';
		tags?: string[];
		start_date?: string;
		end_date?: string;
		// Never has project_id or project_ref
	};
}

export interface TaskOperation extends ParsedOperation {
	table: 'tasks';
	operation: 'create' | 'update';
	data: {
		// Exactly ONE of these must be present for creates
		project_id?: string; // For existing projects
		project_ref?: string; // For new projects (will be resolved)

		// Task fields
		title: string;
		description?: string;
		details?: string;
		priority?: 'low' | 'medium' | 'high';
		status?: 'backlog' | 'in_progress' | 'done' | 'blocked';
		task_type?: 'one_off' | 'recurring';
		duration_minutes?: number;
		start_date?: string;
		recurrence_pattern?:
			| 'daily'
			| 'weekdays'
			| 'weekly'
			| 'biweekly'
			| 'monthly'
			| 'quarterly'
			| 'yearly';
		recurrence_ends?: string;
		dependencies?: string[];
		parent_task_id?: string;
	};
}

export interface NoteOperation extends ParsedOperation {
	table: 'notes';
	operation: 'create' | 'update';
	data: {
		// Optional project reference
		project_id?: string; // For existing projects
		project_ref?: string; // For new projects (will be resolved)

		// Note fields
		title?: string;
		content: string;
		category?: string;
		tags?: string[];
	};
}

export interface BrainDumpParseResult {
	// Core fields
	title: string;
	summary: string;
	insights: string;
	operations: ParsedOperation[];
	tags?: string[];

	// Metadata
	metadata: BrainDumpMetadata;

	// Optional execution result
	executionResult?: ExecutionResult;

	// Optional project info (when auto-accept creates/updates a project)
	projectInfo?: {
		id: string;
		name: string;
		isNew: boolean;
		slug?: string | null;
	};

	// Question analysis and generation
	questionAnalysis?: Record<
		string,
		{
			wasAnswered: boolean;
			answerContent?: string | null;
		}
	>;

	// New questions generated based on the braindump
	projectQuestions?: Array<{
		question: string;
		category: string;
		priority: string;
		context?: string;
		expectedOutcome?: string;
		triggers?: {
			braindumpMention?: string;
			gapIdentified?: string;
			projectState?: string;
		};
	}>;

	// Context result for dual processing
	contextResult?: ProjectContextResult | null;
}

export interface BrainDumpMetadata {
	totalOperations: number;
	tableBreakdown: Record<string, number>;
	processingTime: number;
	timestamp: string;
	processingNote?: string;
	project_info?: {
		id: string;
		name: string | null;
		slug: string | null;
		isNew: boolean;
	} | null;

	processingMode?: 'single' | 'dual';

	// dual processing add ons
	attemptNumber?: number;
	partialFailure?: boolean;
	projectReference?: string;
	failureDetails?: string[];
	projectCreate?: boolean;
	// ... other metadata
}

export interface CompletedBrainDump extends BrainDumpParseResult {
	executionResult: ExecutionResult;
	brainDumpId: string;
}

export interface FullProjectData {
	user_id: string;
	fullProjectWithRelations: ProjectWithRelations | null;
	timestamp: string;
}

export interface BrainDumpOptions {
	autoExecute?: boolean;
	streamResults?: boolean;
	useDualProcessing?: boolean;
	retryAttempts?: number;
}

export interface ExecutionResult {
	successful: ParsedOperation[];
	failed: Array<ParsedOperation & { error: string }>;
	results?: Array<{
		id: string;
		table: TableName;
		operationType: OperationType;
		[key: string]: any; // Other fields from the created/updated record
	}>;
	error?: string;
}

// Types for dual processing
export interface ThresholdCalculation {
	brainDumpLength: number;
	existingProjectContextLength: number;
	totalLength: number;
	shouldUseDualProcessing: boolean;
	reason?: string;
}

export interface ProjectContextResult {
	title?: string;
	summary?: string;
	insights?: string;
	tags?: string[];
	projectUpdate?: {
		context: string;
		executive_summary: string;
		tags: string[];
		status: 'active' | 'paused' | 'completed' | 'archived';
	};
	projectCreate?: {
		name: string;
		description: string;
		context: string;
		slug?: string;
		executive_summary: string;
		tags: string[];
		status: 'active' | 'paused' | 'completed' | 'archived';
	};
}

export interface TaskNoteExtractionResult {
	tasks: Array<{
		// For updates
		id?: string; // Task ID for updates
		operation?: 'create' | 'update'; // Operation type

		// Regular fields
		title: string;
		description?: string;
		details?: string;
		priority?: 'low' | 'medium' | 'high';
		status?: 'backlog' | 'in_progress' | 'done' | 'blocked';
		task_type?: 'one_off' | 'recurring';
		project_id?: string;
		project_ref?: string;
		duration_minutes?: number;
		start_date?: string;
		dependencies?: string[];
		task_steps?: Array<{ step: string; completed: boolean }>;
		parent_task_id?: string;
		recurrence_ends?: string;
	}>;
	notes: Array<{
		// For updates
		id?: string; // Note ID for updates
		operation?: 'create' | 'update'; // Operation type

		// Regular fields
		title?: string;
		content: string;
		category?: string;
		tags?: string[];
		project_id?: string;
		project_ref?: string;
	}>;
}

// Legacy interface - use StreamingMessage from sse-messages.ts instead
// Keeping for backward compatibility during migration
export interface DualProcessingStatus {
	type:
		| 'status'
		| 'contextProgress'
		| 'tasksProgress'
		| 'retry'
		| 'complete'
		| 'error'
		| 'contextUpdateRequired';
	message?: string;
	data?: any;
	attempt?: number;
	maxAttempts?: number;
	processName?: string;
	result?: BrainDumpParseResult;
	error?: string;
}

export type BrainDumpTableType = 'project' | 'task' | 'note';

export interface EnrichedBraindump extends BrainDump {
	brain_dump_links: any;
	isNote: boolean;
	isNewProject: boolean;
	linkedProject: any;
	linkedTypes: BrainDumpTableType[];
}
