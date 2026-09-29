// packages/shared-types/src/project-loops.types.ts
//
// Types for the Project Loops feature: a per-project reconciliation pass that
// emits reviewable AI suggestions. The loop worker (apps/worker) PRODUCES
// suggestions; the web app (apps/web) EXECUTES them on approval by replaying
// each suggestion's declarative `operations` through the ChatToolExecutor.

import type { AttentionLevel } from './attention.types';

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
export type ProjectSuggestionKind =
	| 'doc_org'
	| 'doc_outdated'
	| 'drift'
	| 'task_conflict'
	| 'audit_recommendation'
	| 'freshness_update';

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
	| 'addressed'
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
	| 'milestone'
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
	/**
	 * Freshness roll-up items with no operation (tasker 106): stale documents and
	 * records the user fixes in chat. Code-authored; never executed on approval.
	 */
	review_items?: ProjectSuggestionReviewItem[];
	/** Content signature of a freshness bundle: an unchanged roll-up keeps its inbox item. */
	signature?: string;
}

export interface ProjectSuggestionReviewItem {
	concern_id: string;
	entity_type: 'task' | 'goal' | 'milestone' | 'document';
	entity_id: string;
	title: string;
	/** One line: why it looks out of date. */
	reason: string;
	/** Composer prefill for "Fix in chat". */
	fix_in_chat_prompt: string;
}

export type ProjectReviewAttentionLevel = AttentionLevel;

export type ProjectReviewIssueCategory =
	| 'project_drift'
	| 'document_drift'
	| 'document_quality'
	| 'task_drift'
	| 'task_conflict'
	| 'risk'
	| 'other';

export type ProjectReviewIssueSeverity = 'minor' | 'important' | 'critical';

export interface ProjectReviewBriefClaim {
	summary: string;
	candidate_ids: string[];
	evidence_refs: ProjectSuggestionEvidenceRef[];
}

export interface ProjectReviewBriefIssue extends ProjectReviewBriefClaim {
	category: ProjectReviewIssueCategory;
	severity: ProjectReviewIssueSeverity;
	headline: string;
	recommendation: string | null;
}

export interface ProjectReviewDecisionOption {
	id: string;
	label: string;
	description: string | null;
}

export interface ProjectReviewBriefDecision {
	question: string;
	recommendation: string;
	why_user_needed: string;
	options: ProjectReviewDecisionOption[];
	recommended_option_id: string | null;
	/** Existing verified suggestion that the primary action may execute directly. */
	recommended_suggestion_id: string | null;
	candidate_ids: string[];
	evidence_refs: ProjectSuggestionEvidenceRef[];
}

export interface ProjectReviewBriefCluster {
	label: string;
	member_candidate_ids: string[];
}

/** Where an item sits in the Project cleanup change set (tasker 112). */
export type ProjectCleanupSection = 'safe_cleanup' | 'needs_call' | 'note';

/** Which producer raised a cleanup item. */
export type ProjectCleanupSource = 'review' | 'audit' | 'radar';

/** Why a finding left the change set. Every close carries one. */
export type ProjectCleanupCloseReason =
	| 'subject_archived'
	| 'subject_deleted'
	| 'already_done'
	| 'no_longer_applies'
	| 'resolved'
	| 'revised'
	| 'merged'
	| 'aged_out';

/**
 * Roll-up state on a project_suggestions row (tasker 112). Every live row of a lineage
 * carries the same lineage-level values; `close` is set when the row leaves the set.
 */
export interface ProjectSuggestionRollup {
	first_seen_at: string;
	last_confirmed_at: string;
	seen_run_ids: string[];
	passes_since_confirmed: number;
	/** One line from the latest roll-up: why this is still worth doing. */
	summary?: string | null;
	section?: ProjectCleanupSection | null;
	close?: {
		reason: ProjectCleanupCloseReason;
		detail: string;
		run_id: string | null;
		at: string;
		merged_into?: string | null;
	} | null;
}

export interface ProjectCleanupGroup {
	title: string;
	section: ProjectCleanupSection;
	/** Lineage ids; the radar bundle is referenced by its suggestion id. */
	item_ids: string[];
	recommendation: string | null;
}

export interface ProjectCleanupClosedItem {
	lineage_id: string;
	title: string;
	reason: ProjectCleanupCloseReason;
	detail: string;
}

/** The roll-up's synthesis, stored on the run as brief.cleanup (brief version 3). */
export interface ProjectCleanupSynthesis {
	bottom_line: string | null;
	recommendation: string | null;
	groups: ProjectCleanupGroup[];
	open_count: number;
	closed_this_pass: ProjectCleanupClosedItem[];
	generated_at: string;
	source: 'llm' | 'heuristic';
}

export interface ProjectCleanupItemRow {
	suggestion_id: string;
	kind: ProjectSuggestionKind;
	title: string;
	operation_count: number;
	/** Operation-derived copy from the integrity check; null for findings with no change. */
	verified_headline: string | null;
	verified_fingerprint: string | null;
	verified_operations?: Array<Record<string, unknown>>;
	cautions?: string[];
	updated_at: string;
}

export interface ProjectCleanupItem {
	/** The lineage id; for the radar bundle, its suggestion id. */
	id: string;
	source: ProjectCleanupSource;
	kind: ProjectSuggestionKind;
	section: ProjectCleanupSection;
	title: string;
	summary: string | null;
	why_now: string | null;
	/** True when approval applies a verified change. */
	executable: boolean;
	rows: ProjectCleanupItemRow[];
	evidence_refs: ProjectSuggestionEvidenceRef[];
	seen_count: number;
	first_seen_at: string;
	updated_at: string;
	/** Radar items fixed in chat (tasker 106). */
	review_items?: ProjectSuggestionReviewItem[];
	audit_id?: string | null;
}

/** One project's living cleanup change set, as the inbox card and chat read it. */
export interface ProjectCleanupView {
	project_id: string;
	items: ProjectCleanupItem[];
	groups: ProjectCleanupGroup[];
	bottom_line: string | null;
	recommendation: string | null;
	synthesized_at: string | null;
	latest_run_id: string | null;
	latest_audit: { id: string; created_at: string | null; summary: string | null } | null;
	counts: { total: number; safe_cleanup: number; needs_call: number; note: number };
	recently_closed: Array<ProjectCleanupClosedItem & { at: string | null }>;
}

export interface ProjectLoopBrief {
	/**
	 * v2 is the post-generator, evidence-bound project-manager synthesis. v3 adds the
	 * roll-up (`cleanup`) and drives the Project cleanup card instead of a brief card.
	 */
	version?: 1 | 2 | 3;
	cleanup?: ProjectCleanupSynthesis | null;
	attention_level?: ProjectReviewAttentionLevel;
	state_summary?: string | null;
	bottom_line?: string | null;
	recommendation?: string | null;
	decision?: ProjectReviewBriefDecision | null;
	what_changed?: ProjectReviewBriefClaim[];
	what_matters_now?: ProjectReviewBriefClaim[];
	tensions_or_contradictions?: ProjectReviewBriefClaim[];
	issues?: ProjectReviewBriefIssue[];
	decision_item_ids?: string[];
	safe_cleanup_item_ids?: string[];
	cluster_members?: ProjectReviewBriefCluster[];
	candidate_ids?: string[];
	no_attention_reason?: string | null;
	/** Legacy v1 fields remain readable for historical project-loop rows. */
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
	/** Parent project loop run. Null only for kind 'freshness_update' (parent is freshness_scan_id). */
	run_id: string | null;
	/** Parent freshness radar scan. Set only for kind 'freshness_update'. */
	freshness_scan_id: string | null;
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
	/** The finding this row belongs to (tasker 112); null on rows written before the roll-up. */
	lineage_id?: string | null;
	rollup?: ProjectSuggestionRollup | null;
	created_at: string;
	decided_at: string | null;
	applied_at: string | null;
	updated_at: string;
}

/** Outcome stored after an approved suggestion's operations are replayed. */
export interface ProjectSuggestionResult {
	ok: boolean;
	applied_operations?: number;
	/** All operations are prevalidated together, then replayed in stored order. */
	execution_policy?: 'prevalidated_sequential';
	/** True when an earlier operation applied before a later replay failed. */
	partial_failure?: boolean;
	errors?: Array<{ tool: string; error: string }>;
}

export interface ProjectSuggestionFeedback {
	/**
	 * User-chosen reasons come from the review UI. `dismissed_without_note` is
	 * synthesized server-side on any dismissal that carries no explicit reason
	 * or note, so every rejected suggestion records feedback the loop can learn
	 * from (see loadPriorDecisions).
	 */
	reason?:
		| 'not_relevant'
		| 'wrong_evidence'
		| 'intentional'
		| 'too_risky'
		| 'other'
		| 'dismissed_without_note';
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
