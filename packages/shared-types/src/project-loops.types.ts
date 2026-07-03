// packages/shared-types/src/project-loops.types.ts
//
// Types for the Project Loops feature: a per-project reconciliation pass that
// emits reviewable AI suggestions. The loop worker (apps/worker) PRODUCES
// suggestions; the web app (apps/web) EXECUTES them on approval by replaying
// each suggestion's declarative `operations` through the ChatToolExecutor.

export type ProjectLoopTriggerReason =
	| 'end_of_day'
	| 'scheduled'
	| 'burst'
	| 'critical_change'
	| 'manual';

export type ProjectLoopRunStatus =
	| 'queued'
	| 'running'
	| 'waiting_review'
	| 'completed'
	| 'failed';

/** The reconciliation jobs a project loop performs. */
export type ProjectSuggestionKind = 'doc_org' | 'doc_outdated' | 'drift' | 'task_conflict';

/**
 * 1 = info/low (flags, tags) — one-click apply.
 * 2 = medium (new tasks, doc moves) — reviewed, batch-approvable.
 * 3 = high (merges/deletes, large restructures) — always explicit approval.
 */
export type ProjectLoopRiskTier = 1 | 2 | 3;

export type ProjectSuggestionStatus =
	| 'pending'
	| 'approved'
	| 'delegated'
	| 'applied'
	| 'rejected'
	| 'superseded'
	| 'failed';

/**
 * A single deferred tool call. `tool` is a ChatToolExecutor write-tool name
 * (e.g. 'move_document_in_tree', 'update_onto_task', 'link_onto_entities').
 * `args` is the tool's argument object. On approval the web app converts each
 * LoopOperation into a ChatToolCall and executes it.
 */
export interface LoopOperation {
	tool: string;
	args: Record<string, unknown>;
	/** Human-readable description shown in the review UI. */
	label?: string;
}

export type ProjectSuggestionFreshnessState = 'fresh' | 'changed' | 'stale' | 'unknown';

export type ProjectSuggestionEvidenceType =
	| 'project'
	| 'goal'
	| 'document'
	| 'task'
	| 'calendar_event'
	| 'external'
	| 'unknown';

export interface ProjectSuggestionEvidenceRef {
	entity_type: ProjectSuggestionEvidenceType;
	entity_id?: string;
	title: string;
	reason?: string;
	excerpt?: string;
	updated_at?: string;
}

export interface ProjectSuggestionPreview {
	kind?: 'doc_tree' | 'outdated_flag' | 'task_merge' | 'drift' | 'brief' | 'generic';
	summary: string;
	before?: string[];
	after?: string[];
	impact?: string;
}

export interface ProjectLoopBrief {
	current_goal: string | null;
	recent_changes: string[];
	open_decisions: string[];
	stale_assumptions: string[];
	contradictions_or_drift: string[];
	next_best_action: string | null;
	generated_at?: string;
	source?: 'heuristic' | 'llm';
}

export interface ProjectLoopRun {
	id: string;
	project_id: string;
	user_id: string;
	trigger_reason: ProjectLoopTriggerReason;
	status: ProjectLoopRunStatus;
	brief: ProjectLoopBrief | null;
	summary: string | null;
	suggestion_count: number;
	error_message: string | null;
	cost_usd: number | null;
	chat_session_id: string | null;
	queue_job_id: string | null;
	created_at: string;
	started_at: string | null;
	finished_at: string | null;
	updated_at: string;
}

export interface ProjectSuggestion {
	id: string;
	run_id: string;
	project_id: string;
	chat_session_id: string | null;
	agent_run_id: string | null;
	kind: ProjectSuggestionKind;
	risk_tier: ProjectLoopRiskTier;
	title: string;
	rationale: string | null;
	why_now: string | null;
	confidence: number | null;
	evidence_refs: ProjectSuggestionEvidenceRef[];
	preview: ProjectSuggestionPreview | null;
	operations: LoopOperation[];
	status: ProjectSuggestionStatus;
	freshness_state: ProjectSuggestionFreshnessState;
	reversible: boolean | null;
	undo_operations: LoopOperation[] | null;
	source_fingerprint: string | null;
	user_feedback: ProjectSuggestionFeedback | null;
	sort_order: number;
	depends_on: string | null;
	result: ProjectSuggestionResult | null;
	created_at: string;
	decided_at: string | null;
	applied_at: string | null;
	updated_at: string;
}

/** Outcome stored after an approved suggestion's operations are replayed. */
export interface ProjectSuggestionResult {
	ok: boolean;
	applied_operations?: number;
	errors?: Array<{ tool: string; error: string }>;
}

export interface ProjectSuggestionFeedback {
	reason?: 'not_relevant' | 'wrong_evidence' | 'intentional' | 'too_risky' | 'other';
	note?: string;
	created_at?: string;
}

/**
 * What the loop agent returns for a single suggestion before persistence.
 * Mirrors ProjectSuggestion minus the row-managed fields.
 */
export interface ProposedSuggestion {
	kind: ProjectSuggestionKind;
	risk_tier: ProjectLoopRiskTier;
	title: string;
	rationale?: string;
	why_now?: string;
	confidence?: number;
	evidence_refs?: ProjectSuggestionEvidenceRef[];
	preview?: ProjectSuggestionPreview;
	operations: LoopOperation[];
	freshness_state?: ProjectSuggestionFreshnessState;
	reversible?: boolean;
	undo_operations?: LoopOperation[];
	source_fingerprint?: string;
	sort_order?: number;
}
