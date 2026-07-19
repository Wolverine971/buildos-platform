// packages/shared-types/src/agent-work.types.ts
/**
 * Agent Work types: the Agent Run contract — brief, result envelope, staged
 * mutations (Change Set), control signals, and event log shapes.
 *
 * Design: apps/web/docs/technical/architecture/agent-work/
 *
 * Like tree-agent.types.ts, these intentionally do not depend on generated
 * Database types so the contract can be iterated before DB types are regenerated.
 */

import type { Json } from './database.types';
import type { BuildosAgentScopeMode } from './agent-call.types';

// ============================================================================
// Core enums (string unions mirror DB enums)
// ============================================================================

/** Reuses the Agent Call gateway vocabulary: 'read_only' | 'read_write'. */
export type AgentRunScopeMode = BuildosAgentScopeMode;

export type AgentRunStatus =
	| 'queued'
	| 'running'
	| 'paused'
	| 'needs_input'
	| 'proposal_ready'
	| 'completed'
	| 'partial'
	| 'failed'
	| 'cancelled';

export type AgentRunTrigger = 'chat' | 'manual' | 'scheduled' | 'event';

export type AgentRunContextType = 'project' | 'global';

export type AgentRunEffort = 'standard' | 'deep';

export type AgentRunTemplate = 'agent' | 'deep_research';

/** Default = direct commit; 'stage' is engaged only when a run is dispatched with review. */
export type AgentRunMutationMode = 'commit' | 'stage';

export type AgentRunSignalKind = 'steer' | 'pause' | 'resume' | 'cancel';

export type AgentRunSignalSource = 'user' | 'orchestrator';

export type EntityAction = 'created' | 'updated' | 'deleted';

export type ProposedChangeAction = 'create' | 'update' | 'delete';

// ============================================================================
// The brief (dispatch input)
// ============================================================================

export interface AgentBrief {
	label: string;
	goal: string;
	instructions?: string;
	expected_output?: string;
	context_type: AgentRunContextType;
	project_id?: string | null;
	/** Read-only vs read-write surface. Defaults to 'read_write' on dispatch. */
	scope_mode?: AgentRunScopeMode;
	/**
	 * Optional op allowlist narrowing the tool surface, using the registry op
	 * vocabulary (e.g. 'onto.task.update'). Resolved to concrete tool names via
	 * the registry/policy layer — not arbitrary strings.
	 */
	allowed_ops?: string[] | null;
	/** Higher-reasoning model routing. Defaults to 'standard'. */
	effort?: AgentRunEffort;
	/** Durable orchestration shape. Defaults to a single autonomous agent. */
	run_template?: AgentRunTemplate;
	/** Opt-in: stage mutations for review instead of committing directly (02). */
	review?: boolean;
}

export interface AgentRunBudgets {
	wall_clock_ms?: number;
	max_tokens?: number;
	max_tool_calls?: number;
	/**
	 * Observed LLM-usage ceiling checked between model calls. Paid tools are not
	 * included, and an in-flight provider request can overshoot slightly.
	 */
	max_cost_usd?: number;
}

export interface AgentRunMetrics {
	tokens: number;
	cost_usd: number;
	tool_calls: number;
	duration_ms: number;
}

// ============================================================================
// Result envelope (01 §4)
// ============================================================================

export interface EntityTouch {
	type: string; // 'task' | 'project' | 'document' | 'goal' | 'plan' | 'calendar_event' | ...
	id: string;
	action: EntityAction;
	/** LLM-annotated rationale; never used to infer that a change happened. */
	description: string;
	/** Owning project, when known. Project touches use the project id itself. */
	project_id?: string | null;
	/** Human-readable entity title/name for link text. */
	title?: string | null;
	/** App-relative link to the touched entity when a dedicated route or project-page opener exists. */
	url?: string | null;
	/** App-relative link to the owning project. */
	project_url?: string | null;
}

export interface RunResultArtifact {
	kind: 'document' | 'json';
	id: string;
	title?: string;
}

export interface RunResult {
	run_id: string;
	label: string;
	status: 'completed' | 'partial' | 'failed' | 'needs_input' | 'proposal_ready';
	/** "Showing its work" — narrative of what it did. */
	summary: string;
	/** The response/finding (may equal summary). */
	answer: string;
	/** Committed changes, system-captured from tool telemetry — never LLM self-report. */
	entities_touched: EntityTouch[];
	/** Staged changes awaiting approval (present only for review runs). */
	proposed_changes?: ChangeSet;
	artifacts?: RunResultArtifact[];
	open_questions?: string[];
	confidence?: number; // 0..1
	metrics: AgentRunMetrics;
	error?: string;
}

/**
 * Fields the LLM is allowed to author via the terminal `submit_result` tool.
 * `entities_touched`, `artifacts`, and `metrics` are attached by the runner.
 */
export interface SubmitResultPayload {
	status: RunResult['status'];
	summary: string;
	answer: string;
	open_questions?: string[];
	confidence?: number;
}

// ============================================================================
// Staged mutations / Change Set (02) — opt-in
// ============================================================================

export type ChangeSetStatus = 'pending' | 'partially_applied' | 'applied' | 'rejected';

export type ProposedChangeDecision = 'approved' | 'rejected' | 'pending';

export interface ProposedChange {
	/** Stable id for per-change approve/reject. */
	id: string;
	/** Registry op, e.g. 'onto.task.update'. */
	op: string;
	entity_type: string;
	/** Present for update/delete; absent for create. */
	entity_id?: string;
	action: ProposedChangeAction;
	/** Current state (for update/delete) — drives the diff UI. */
	before?: Record<string, unknown>;
	/** Proposed state / draft payload. */
	after?: Record<string, unknown>;
	rationale: string;
	decision?: ProposedChangeDecision;
	/** Filled on commit (especially for creates). */
	applied_entity_id?: string;
	/** Filled if this change failed to apply. */
	error?: string;
}

export interface ChangeSet {
	run_id: string;
	status: ChangeSetStatus;
	changes: ProposedChange[];
	created_at: string;
}

/** Per-change decisions submitted to the commit endpoint. */
export interface ChangeSetDecision {
	change_id: string;
	decision: 'approved' | 'rejected';
}

// ============================================================================
// Control signals — steering / interruption (01 §9)
// ============================================================================

export interface AgentRunSignal {
	id: string;
	run_id: string;
	kind: AgentRunSignalKind;
	/** `{ message }` for 'steer'. */
	payload?: { message?: string } | null;
	source: AgentRunSignalSource;
	created_at: string;
	consumed_at?: string | null;
}

export interface SteerSignalPayload {
	message: string;
}

// ============================================================================
// Event log (mirrors agent_run_events rows)
// ============================================================================

export type AgentRunEventType =
	| 'run.status'
	| 'run.narration'
	| 'run.tool_call'
	| 'run.tool_result'
	| 'run.proposal'
	| 'run.needs_input'
	| 'run.steer'
	| 'run.message';

export interface AgentRunEvent {
	id: string;
	run_id: string;
	seq: number;
	event_type: AgentRunEventType;
	payload: Json;
	created_at: string;
}

// ============================================================================
// Run-native tool telemetry (mirrors agent_tool_executions rows)
// ============================================================================

/**
 * One receipt per tool call an Agent Run makes. Keyed by `agent_run_id` with no
 * chat-session dependency, so manual/scheduled runs are first-class. The source
 * of truth for `entities_touched` (01 §5) — reconstructed from successful write ops.
 */
export interface AgentToolExecution {
	id: string;
	agent_run_id: string;
	user_id: string;
	tool_name: string;
	/** Registry op, e.g. 'onto.task.update'. */
	gateway_op?: string | null;
	/** 'read' | 'write' from the tool registry. */
	tool_category?: string | null;
	arguments?: Json;
	result?: Json;
	success: boolean;
	error_message?: string | null;
	/** Ground-truth entity capture (write ops return created/updated ids). */
	entity_kind?: string | null;
	entity_id?: string | null;
	/** Set when the op was staged rather than committed (02). */
	mutation_mode?: AgentRunMutationMode | null;
	proposed_change_id?: string | null;
	execution_time_ms?: number | null;
	tokens_consumed?: number | null;
	created_at: string;
}
