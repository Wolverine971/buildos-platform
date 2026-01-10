// apps/worker/src/workers/brief/ontologyBriefTypes.ts
/**
 * Type definitions for ontology-based daily brief generation.
 * Aligned with the spec: /docs/specs/DAILY_BRIEF_ONTOLOGY_MIGRATION_SPEC.md
 */

import type { Database } from '@buildos/shared-types';

// Base ontology entity types from database schema
export type OntoProject = Database['public']['Tables']['onto_projects']['Row'];
export type OntoTask = Database['public']['Tables']['onto_tasks']['Row'];
export type OntoGoal = Database['public']['Tables']['onto_goals']['Row'];
export type OntoPlan = Database['public']['Tables']['onto_plans']['Row'];
export type OntoMilestone = Database['public']['Tables']['onto_milestones']['Row'];
export type OntoRisk = Database['public']['Tables']['onto_risks']['Row'];
export type OntoDocument = Database['public']['Tables']['onto_documents']['Row'];
export type OntoOutput = Database['public']['Tables']['onto_outputs']['Row'];
export type OntoRequirement = Database['public']['Tables']['onto_requirements']['Row'];
export type OntoDecision = Database['public']['Tables']['onto_decisions']['Row'];
export type OntoEdge = Database['public']['Tables']['onto_edges']['Row'];
export type OntoActor = Database['public']['Tables']['onto_actors']['Row'];

// ============================================================================
// PROJECT ACTIVITY
// ============================================================================

export interface ProjectActivityEntry {
	projectId: string;
	projectName: string;
	isShared: boolean;
	actorId: string | null;
	actorName: string;
	action: string;
	entityType: string;
	entityId: string;
	entityLabel: string | null;
	createdAt: string;
}

// ============================================================================
// GOAL PROGRESS
// ============================================================================

export interface GoalProgress {
	goal: OntoGoal;
	totalTasks: number;
	completedTasks: number;
	targetDate: string | null;
	targetDaysAway: number | null;
	status: 'on_track' | 'at_risk' | 'behind';
	contributingTasks: OntoTask[];
}

// ============================================================================
// OUTPUT STATUS
// ============================================================================

export interface OutputStatus {
	output: OntoOutput;
	state: string;
	linkedGoals: string[];
	linkedTasks: string[];
	updated_at: string | null;
}

// ============================================================================
// MILESTONE STATUS
// ============================================================================

export interface MilestoneStatus {
	milestone: OntoMilestone;
	daysAway: number;
	isAtRisk: boolean;
	projectName: string;
}

// ============================================================================
// PLAN PROGRESS
// ============================================================================

export interface PlanProgress {
	plan: OntoPlan;
	totalTasks: number;
	completedTasks: number;
	progressPercent: number;
}

// ============================================================================
// UNBLOCKING TASK
// ============================================================================

export interface UnblockingTask {
	task: OntoTask;
	blockedTasks: OntoTask[];
}

// ============================================================================
// RECENT UPDATES
// ============================================================================

export interface RecentUpdates {
	tasks: OntoTask[];
	goals: OntoGoal[];
	outputs: OntoOutput[];
	documents: OntoDocument[];
}

// ============================================================================
// CATEGORIZED TASKS
// ============================================================================

export interface CategorizedTasks {
	// Time-based
	todaysTasks: OntoTask[];
	overdueTasks: OntoTask[];
	upcomingTasks: OntoTask[]; // Next 7 days
	recentlyCompleted: OntoTask[]; // Last 24 hours

	// Status-based
	blockedTasks: OntoTask[];
	inProgressTasks: OntoTask[];

	// Work mode categories (from type_key)
	executeTasks: OntoTask[];
	createTasks: OntoTask[];
	refineTasks: OntoTask[];
	researchTasks: OntoTask[];
	reviewTasks: OntoTask[];
	coordinateTasks: OntoTask[];
	adminTasks: OntoTask[];
	planTasks: OntoTask[];

	// Relationship-based
	unblockingTasks: OntoTask[];
	goalAlignedTasks: OntoTask[];
	recentlyUpdated: OntoTask[];
}

// ============================================================================
// PROJECT WITH RELATIONS (Main data structure)
// ============================================================================

export interface OntoProjectWithRelations {
	project: OntoProject;
	isShared: boolean;
	activityLogs: ProjectActivityEntry[];
	tasks: OntoTask[];
	goals: OntoGoal[];
	plans: OntoPlan[];
	milestones: OntoMilestone[];
	risks: OntoRisk[];
	documents: OntoDocument[];
	outputs: OntoOutput[];
	requirements: OntoRequirement[];
	decisions: OntoDecision[];
	edges: OntoEdge[];

	// Computed relationships
	tasksByPlan: Map<string, OntoTask[]>;
	taskDependencies: Map<string, string[]>; // taskId -> depends on taskIds
	goalProgress: Map<string, GoalProgress>;
	recentUpdates: RecentUpdates;
}

// ============================================================================
// BRIEF CONTENT SECTIONS
// ============================================================================

export interface StrategicAlignmentSection {
	activeGoals: GoalProgress[];
	outputsInFlight: OutputStatus[];
	upcomingMilestones: MilestoneStatus[];
}

export interface AttentionRequiredSection {
	blockedTasks: OntoTask[];
	activeRisks: OntoRisk[];
	overdueItems: OntoTask[];
	requirements: OntoRequirement[];
	decisions: OntoDecision[];
}

export interface RecentlyUpdatedSummary {
	updatedTasks: number;
	updatedGoals: number;
	updatedOutputs: number;
	updatedDocuments: number;
	items: Array<{
		kind: string;
		id: string;
		title: string;
		updatedAt: string;
	}>;
}

export interface TodaysFocusSection {
	highPriority: OntoTask[];
	unblockingTasks: UnblockingTask[];
	scheduledByWorkMode: {
		execute: OntoTask[];
		create: OntoTask[];
		refine: OntoTask[];
		research: OntoTask[];
		review: OntoTask[];
		coordinate: OntoTask[];
		admin: OntoTask[];
		plan: OntoTask[];
	};
	recentlyUpdated: RecentlyUpdatedSummary;
}

export interface ProjectStatusSection {
	project: OntoProject;
	healthStage: string;
	scale: string;
	context: string | null;
	nextSteps: string[];
	activePlan: PlanProgress | null;
	goals: GoalProgress[];
	outputs: OutputStatus[];
	decisions: OntoDecision[];
	requirements: OntoRequirement[];
	todaysTasks: OntoTask[];
	thisWeekSummary: string;
}

export interface ContextReferencesSection {
	recentDocuments: OntoDocument[];
	contextDocument: OntoDocument | null;
}

// ============================================================================
// BRIEF METADATA
// ============================================================================

export interface OntologyBriefMetadata {
	// Counts
	totalProjects: number;
	totalTasks: number;
	totalGoals: number;
	totalMilestones: number;
	activeRisksCount: number;
	totalOutputs: number;
	recentUpdatesCount: number;

	// Analysis
	blockedCount: number;
	overdueCount: number;
	goalsAtRisk: number;
	milestonesThisWeek: number;
	outputsInReview: number;

	// Graph stats
	totalEdges: number;
	dependencyChains: number;

	// Generation info
	generatedVia: string;
	timezone: string;
	isReengagement?: boolean;
	daysSinceLastLogin?: number;
}

// ============================================================================
// DAILY BRIEF STRUCTURE
// ============================================================================

export interface OntologyDailyBrief {
	id: string;
	userId: string;
	actorId: string;
	briefDate: string;

	// Content sections
	executiveSummary: string;
	strategicAlignment: StrategicAlignmentSection;
	attentionRequired: AttentionRequiredSection;
	todaysFocus: TodaysFocusSection;
	projectStatus: ProjectStatusSection[];
	contextReferences: ContextReferencesSection;
	recentUpdates: RecentUpdates;

	// AI analysis
	llmAnalysis: string;
	priorityActions: string[];

	// Metadata
	metadata: OntologyBriefMetadata;
	generationStatus: string;
	generationCompletedAt: string;
}

// ============================================================================
// BRIEF DATA (for LLM prompts)
// ============================================================================

export interface OntologyBriefData {
	briefDate: string;
	timezone: string;
	goals: GoalProgress[];
	outputs: OutputStatus[];
	risks: OntoRisk[];
	requirements: OntoRequirement[];
	decisions: OntoDecision[];
	todaysTasks: OntoTask[];
	blockedTasks: OntoTask[];
	overdueTasks: OntoTask[];
	highPriorityCount: number;
	recentUpdates: RecentUpdates;
	tasksByWorkMode: Record<string, OntoTask[]>;
	projects: ProjectBriefData[];
	// Strategic task splits per PROJECT_CONTEXT_ENRICHMENT_SPEC.md
	recentlyUpdatedTasks: OntoTask[]; // Updated in last 7 days, ordered by updated_at desc, cap 10
	upcomingTasks: OntoTask[]; // Due/start in next 7 days (deduplicated from recent), cap 5
}

export interface ProjectBriefData {
	project: OntoProject;
	isShared: boolean;
	activityLogs: ProjectActivityEntry[];
	goals: GoalProgress[];
	outputs: OutputStatus[];
	requirements: OntoRequirement[];
	decisions: OntoDecision[];
	nextSteps: string[];
	nextMilestone: string | null;
	activePlan: OntoPlan | null;
	todaysTasks: OntoTask[];
	thisWeekTasks: OntoTask[];
	blockedTasks: OntoTask[];
	unblockingTasks: OntoTask[];
	// Strategic task splits per PROJECT_CONTEXT_ENRICHMENT_SPEC.md
	recentlyUpdatedTasks: OntoTask[]; // Updated in last 7 days, ordered by updated_at desc
	upcomingTasks: OntoTask[]; // Due/start in next 7 days (deduplicated from recent)
}

// ============================================================================
// TASK ANALYSIS TYPES (for LLM)
// ============================================================================

export interface OntologyTaskAnalysis {
	id: string;
	title: string;
	stateKey: string;
	typeKey: string | null;
	priority: number | null;
	dueAt: string | null;
	dueAtFormatted: string | null;
	projectId: string;
	projectName: string;
	link: string;
	workMode: string | null;
	isBlocked: boolean;
	blockedBy: string[];
	supportsGoals: string[];
}

export interface OntologyGoalAnalysis {
	id: string;
	name: string;
	stateKey: string;
	targetDate: string | null;
	targetDaysAway: number | null;
	status: 'on_track' | 'at_risk' | 'behind';
	totalTasks: number;
	completedTasks: number;
	projectId: string;
	projectName: string;
	link: string;
}

// ============================================================================
// DATABASE TABLE TYPES (for new ontology brief tables)
// ============================================================================

export interface OntologyDailyBriefRow {
	id: string;
	user_id: string;
	actor_id: string;
	brief_date: string;
	executive_summary: string;
	llm_analysis: string | null;
	priority_actions: string[];
	metadata: OntologyBriefMetadata;
	generation_status: string;
	generation_error: string | null;
	generation_started_at: string | null;
	generation_completed_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface OntologyProjectBriefRow {
	id: string;
	daily_brief_id: string;
	project_id: string;
	brief_content: string;
	metadata: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

export interface OntologyBriefEntityRow {
	id: string;
	daily_brief_id: string;
	project_id: string | null;
	entity_kind: string;
	entity_id: string;
	role: string | null;
	created_at: string;
}
