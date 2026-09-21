// apps/web/src/lib/services/admin/chat-workflow-audit-types.ts
//
// Versioned audit payload for multi-agent chat workflows (Tasker 91). Built server-side
// from the durable workflow tables and consumed by the inspector page and the exports.
// Every field is derived from saved records; nothing here is reconstructed from the live
// registry or from prose. Missing telemetry is represented as coverage, not as data.

export const CHAT_WORKFLOW_AUDIT_VERSION = 'chat_workflow_audit_v1' as const;

export type JsonRecord = Record<string, unknown>;

export type WorkflowAuditCoverageStatus =
	| 'available'
	| 'absent'
	| 'unavailable'
	| 'truncated'
	| 'not_persisted'
	| 'not_applicable';

export interface WorkflowAuditCoverage {
	status: WorkflowAuditCoverageStatus;
	detail: string | null;
	count?: number;
	limit?: number;
}

export type WorkflowAuditTable =
	| 'chat_turn_workflow_runs'
	| 'chat_turn_workflow_steps'
	| 'chat_turn_workflow_dispatches'
	| 'chat_turn_specialist_snapshots'
	| 'chat_turn_document_read_batches'
	| 'chat_turn_specialist_selection_shadows'
	| 'chat_turn_input_artifacts';

export const WORKFLOW_AUDIT_TABLES: readonly WorkflowAuditTable[] = [
	'chat_turn_workflow_runs',
	'chat_turn_workflow_steps',
	'chat_turn_workflow_dispatches',
	'chat_turn_specialist_snapshots',
	'chat_turn_document_read_batches',
	'chat_turn_specialist_selection_shadows',
	'chat_turn_input_artifacts'
];

// ---------------------------------------------------------------------------
// Raw rows (what the loader selects). Optional fields tolerate older schemas.
// ---------------------------------------------------------------------------

export interface WorkflowRunRow {
	turn_run_id: string;
	session_id?: string | null;
	user_id?: string | null;
	request_artifact_id?: string | null;
	project_id?: string | null;
	workflow_version?: string | null;
	policy?: unknown;
	policy_ref?: string | null;
	request_hash?: string | null;
	phase?: string | null;
	terminal_outcome?: string | null;
	max_spend_micro_usd?: number | string | null;
	synthesis_headroom_micro_usd?: number | string | null;
	max_physical_dispatches?: number | string | null;
	max_step_attempts?: number | string | null;
	whole_run_lifetime_ms?: number | string | null;
	deadline_at?: string | null;
	first_execution_started_at?: string | null;
	recovery_count?: number | string | null;
	context_id?: string | null;
	preparation_version?: string | null;
	context_identity?: unknown;
	evidence_versions?: unknown;
	context_payload?: unknown;
	context_hash?: string | null;
	context_bytes?: number | string | null;
	context_accepted_at?: string | null;
	context_accepted_generation?: number | string | null;
	plan_version?: string | null;
	plan?: unknown;
	plan_hash?: string | null;
	plan_installed_at?: string | null;
	plan_installed_generation?: number | string | null;
	answer_id?: string | null;
	answer_editor_step_attempt_id?: string | null;
	answer_text?: string | null;
	answer_text_sha256?: string | null;
	answer_last_batch_id?: string | null;
	synthesis_status?: string | null;
	synthesis_quality?: string | null;
	synthesis_accepted_at?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
	finished_at?: string | null;
}

export interface WorkflowStepRow {
	turn_run_id: string;
	plan_version?: string | null;
	step_key: string;
	capability?: string | null;
	depends_on?: unknown;
	assignment?: unknown;
	status?: string | null;
	attempts_used?: number | string | null;
	attempt_ids?: unknown;
	current_attempt_id?: string | null;
	current_attempt_generation?: number | string | null;
	claimed_at?: string | null;
	quality?: string | null;
	result?: unknown;
	result_hash?: string | null;
	result_bytes?: number | string | null;
	accepted_attempt_id?: string | null;
	accepted_at?: string | null;
	failure_code?: string | null;
	finished_at?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
	/** Present only once the document evidence handoff migration is applied. */
	input_evidence?: unknown;
}

export interface WorkflowDispatchRow {
	dispatch_id: string;
	turn_run_id: string;
	step_key?: string | null;
	step_attempt_id?: string | null;
	physical_attempt?: number | string | null;
	dispatch_kind?: string | null;
	state?: string | null;
	model_requested?: string | null;
	pricing?: unknown;
	serialized_request_bytes?: number | string | null;
	estimated_input_tokens?: number | string | null;
	max_output_tokens?: number | string | null;
	reserved_micro_usd?: number | string | null;
	actual_micro_usd?: number | string | null;
	reserved_generation?: number | string | null;
	provider_request_id?: string | null;
	provider_usage?: unknown;
	reconciliation_id?: string | null;
	reconciliation_receipt?: unknown;
	reserved_at?: string | null;
	dispatched_at?: string | null;
	settled_at?: string | null;
	uncertain_at?: string | null;
	reconciled_at?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
}

export interface SpecialistSnapshotRow {
	turn_run_id: string;
	user_id?: string | null;
	session_id?: string | null;
	project_id?: string | null;
	request_hash?: string | null;
	snapshot?: unknown;
	snapshot_hash?: string | null;
	created_at?: string | null;
}

export interface DocumentReadBatchRow {
	turn_run_id: string;
	request_hash?: string | null;
	document_ids?: unknown;
	result?: unknown;
	result_hash?: string | null;
	step_attempt_id?: string | null;
	execution_generation?: number | string | null;
	created_at?: string | null;
}

export interface SelectionShadowRow {
	turn_run_id: string;
	request_hash?: string | null;
	context_id?: string | null;
	context_hash?: string | null;
	execution_generation?: number | string | null;
	input?: unknown;
	input_hash?: string | null;
	result?: unknown;
	result_hash?: string | null;
	created_at?: string | null;
	completed_at?: string | null;
}

export interface InputArtifactRow {
	id: string;
	turn_run_id: string;
	artifact_version?: string | null;
	content_hash?: string | null;
	content_bytes?: number | string | null;
	history_source?: string | null;
	history_bytes?: number | string | null;
	history?: unknown;
	prepared?: unknown;
	retain_until?: string | null;
	source_prepared_prompt_id?: string | null;
	created_at?: string | null;
}

export interface WorkflowAuditRowSet {
	runs: WorkflowRunRow[];
	steps: WorkflowStepRow[];
	dispatches: WorkflowDispatchRow[];
	snapshots: SpecialistSnapshotRow[];
	readBatches: DocumentReadBatchRow[];
	shadows: SelectionShadowRow[];
	inputArtifacts: InputArtifactRow[];
	tables: Record<WorkflowAuditTable, WorkflowAuditCoverage>;
}

// ---------------------------------------------------------------------------
// Derived payload
// ---------------------------------------------------------------------------

export type WorkflowAuditStepRole = 'planner' | 'specialist' | 'editor' | 'unknown';

export type WorkflowAuditDisplayState =
	| 'pending'
	| 'running'
	| 'accepted'
	| 'partial'
	| 'finalized'
	| 'failed'
	| 'skipped'
	| 'not_completed'
	| 'cancelled'
	| 'unknown';

export type WorkflowAuditSourceCoverage =
	| 'full'
	| 'excerpt'
	| 'empty'
	| 'unavailable'
	| 'inventory_only'
	| 'not_supplied'
	| 'unknown';

export interface WorkflowAuditSourceReceipt {
	step_key: string;
	coverage: WorkflowAuditSourceCoverage;
	via: 'document_read' | 'evidence_handoff' | 'context_inventory' | 'none';
	detail: string | null;
}

export interface WorkflowAuditSource {
	kind: string;
	id: string;
	version: string | null;
	label: string | null;
	receipts: WorkflowAuditSourceReceipt[];
}

export interface WorkflowAuditToolDocument {
	id: string;
	status: string;
	coverage: WorkflowAuditSourceCoverage;
	title: string | null;
	version: string | null;
	content_hash: string | null;
	full_characters: number | null;
	truncated: boolean | null;
	content: string | null;
}

export interface WorkflowAuditToolCall {
	id: string;
	tool: string;
	step_key: string | null;
	step_attempt_id: string | null;
	execution_generation: number | null;
	request_hash: string | null;
	request_hash_matches_run: boolean | null;
	document_ids: string[];
	result_hash: string | null;
	result_version: string | null;
	created_at: string | null;
	documents: WorkflowAuditToolDocument[];
	result: JsonRecord | null;
}

export interface WorkflowAuditStepAttempt {
	attempt_id: string;
	index: number;
	state: 'accepted' | 'current' | 'superseded' | 'unknown';
	dispatch_ids: string[];
}

export interface WorkflowAuditSpecialistPin {
	id: string;
	version: number | null;
	label: string;
	description: string | null;
	expertise: string[];
	primary_model: string | null;
	fallback_models: string[];
	allowed_tool_ids: string[];
	system_prompt: string | null;
	default_assignment: string | null;
	slot_assignment: string | null;
	source: 'run_snapshot';
}

export interface WorkflowAuditRoleReport {
	version: string | null;
	role: string | null;
	summary: string;
	findings: Array<{
		claim: string;
		basis: string;
		evidence: Array<{ id: string; label: string; version: string | null; kind: string | null }>;
	}>;
	risks: Array<{
		risk: string;
		evidence: Array<{ id: string; label: string; version: string | null; kind: string | null }>;
	}>;
	unknowns: string[];
	recommendation: string;
	unsupported_references: number | null;
	unsupported_findings: number | null;
}

export interface WorkflowAuditPromptCoverage {
	system_prompt: 'run_snapshot' | 'not_persisted' | 'not_applicable';
	assignment: 'stored' | 'missing';
	serialized_request: 'not_persisted';
	rejected_outputs: 'not_persisted';
	accepted_result: 'stored' | 'none' | 'answer_text';
}

export interface WorkflowAuditStepCost {
	settled_micro_usd: number;
	reserved_outstanding_micro_usd: number;
	uncertain_reserved_micro_usd: number;
	dispatch_count: number;
	released_count: number;
}

export interface WorkflowAuditStep {
	key: string;
	label: string;
	role: WorkflowAuditStepRole;
	capability: string | null;
	depends_on: string[];
	plan_version: string | null;
	status: string;
	display_state: WorkflowAuditDisplayState;
	display_note: string | null;
	quality: string | null;
	attempts_used: number;
	attempt_ids: string[];
	attempts: WorkflowAuditStepAttempt[];
	current_attempt_id: string | null;
	current_attempt_generation: number | null;
	accepted_attempt_id: string | null;
	failure_code: string | null;
	claimed_at: string | null;
	accepted_at: string | null;
	finished_at: string | null;
	created_at: string | null;
	updated_at: string | null;
	assignment: JsonRecord | null;
	result: JsonRecord | null;
	result_hash: string | null;
	result_bytes: number | null;
	report: WorkflowAuditRoleReport | null;
	input_evidence: JsonRecord | null;
	input_evidence_coverage: 'stored' | 'not_stored' | 'column_absent' | 'not_applicable';
	specialist: WorkflowAuditSpecialistPin | null;
	specialist_coverage: 'run_snapshot' | 'code_owned_not_stored' | 'not_applicable';
	prompt_coverage: WorkflowAuditPromptCoverage;
	dispatch_ids: string[];
	tool_call_ids: string[];
	cost: WorkflowAuditStepCost;
	timing: { started_at: string | null; ended_at: string | null; duration_ms: number | null };
	received_sources: Array<{
		source_id: string;
		coverage: WorkflowAuditSourceCoverage;
		via: WorkflowAuditSourceReceipt['via'];
	}>;
	source_coverage_summary: string;
}

export type WorkflowAuditDispatchCostState =
	| 'settled'
	| 'released'
	| 'uncertain'
	| 'reserved'
	| 'dispatching'
	| 'unknown';

export interface WorkflowAuditDispatch {
	dispatch_id: string;
	step_key: string | null;
	step_attempt_id: string | null;
	physical_attempt: number | null;
	dispatch_kind: string | null;
	state: string | null;
	cost_state: WorkflowAuditDispatchCostState;
	model_requested: string | null;
	pricing: JsonRecord | null;
	serialized_request_bytes: number | null;
	estimated_input_tokens: number | null;
	max_output_tokens: number | null;
	reserved_micro_usd: number | null;
	actual_micro_usd: number | null;
	reserved_generation: number | null;
	provider_request_id: string | null;
	provider_usage: JsonRecord | null;
	reconciliation_id: string | null;
	reconciliation_receipt: JsonRecord | null;
	reserved_at: string | null;
	dispatched_at: string | null;
	settled_at: string | null;
	uncertain_at: string | null;
	reconciled_at: string | null;
	duration_ms: number | null;
	usage_log_id: string | null;
	usage_log_cost_usd: number | null;
	usage_log_model_used: string | null;
}

export interface WorkflowAuditSelectionShadow {
	request_hash: string | null;
	request_hash_matches_run: boolean | null;
	context_id: string | null;
	context_hash: string | null;
	context_matches_run: boolean | null;
	execution_generation: number | null;
	input_hash: string | null;
	result_hash: string | null;
	created_at: string | null;
	completed_at: string | null;
	status: 'observed' | 'unavailable' | 'pending' | 'unknown';
	reason: string | null;
	baseline_bundle: string | null;
	selected_bundle: string | null;
	recommended_bundle: string | null;
	agrees_with_baseline: boolean | null;
	probabilities: Record<string, number> | null;
	confidence: number | null;
	margin: number | null;
	model_requested: string | null;
	model_used: string | null;
	cost_usd: number | null;
	duration_ms: number | null;
	attempts: number | null;
	candidates: Array<{
		id: string;
		description: string | null;
		specialists: string[];
		tools: string[];
	}>;
	input: JsonRecord | null;
	result: JsonRecord | null;
}

export interface WorkflowAuditGraphNode {
	id: string;
	kind: 'request' | 'context' | 'step' | 'tool' | 'answer' | 'shadow';
	label: string;
	sublabel: string | null;
	state:
		| WorkflowAuditDisplayState
		| 'available'
		| 'missing'
		| 'observed'
		| 'unavailable'
		| 'pending';
	step_key: string | null;
	ref_id: string | null;
	column: number;
	lane: number;
}

export interface WorkflowAuditGraphEdge {
	id: string;
	from: string;
	to: string;
	kind: 'input' | 'dependency' | 'evidence' | 'synthesis' | 'tool' | 'observation';
	label: string | null;
}

export interface WorkflowAuditGraph {
	source: 'saved_plan' | 'step_rows' | 'none';
	nodes: WorkflowAuditGraphNode[];
	edges: WorkflowAuditGraphEdge[];
	parallel_groups: Array<{ id: string; step_keys: string[] }>;
	sequential_handoffs: Array<{
		from: string;
		to: string;
		via: 'plan_dependency' | 'evidence_binding';
	}>;
	columns: number;
	lanes: number;
}

export type WorkflowAuditTimelineKind =
	| 'turn'
	| 'workflow'
	| 'context'
	| 'plan'
	| 'step'
	| 'attempt'
	| 'dispatch'
	| 'tool'
	| 'shadow'
	| 'answer'
	| 'recovery'
	| 'event'
	| 'capture';

export interface WorkflowAuditTimelineEntry {
	id: string;
	at: string;
	end_at: string | null;
	kind: WorkflowAuditTimelineKind;
	lane: string;
	title: string;
	detail: string | null;
	severity: 'info' | 'success' | 'warning' | 'error';
	step_key: string | null;
	attempt_id: string | null;
	dispatch_id: string | null;
	parallel_with: string[];
	generation: number | null;
}

export interface WorkflowAuditCosts {
	budget_micro_usd: number | null;
	synthesis_headroom_micro_usd: number | null;
	settled_micro_usd: number;
	settled_usd: number;
	reserved_outstanding_micro_usd: number;
	uncertain_reserved_micro_usd: number;
	uncertain_dispatch_count: number;
	released_count: number;
	physical_dispatches: number;
	max_physical_dispatches: number | null;
	dispatch_counts: Record<string, number>;
	selector: {
		status: WorkflowAuditSelectionShadow['status'];
		cost_usd: number | null;
		model: string | null;
		duration_ms: number | null;
	} | null;
	usage_logs: {
		matched: number;
		matched_cost_usd: number;
		unmatched: number;
		unmatched_cost_usd: number;
		note: string;
	};
	note: string;
}

export interface WorkflowAuditTiming {
	turn_started_at: string | null;
	workflow_created_at: string | null;
	first_execution_started_at: string | null;
	context_accepted_at: string | null;
	plan_installed_at: string | null;
	synthesis_accepted_at: string | null;
	finished_at: string | null;
	captured_at: string;
	running: boolean;
	wall_clock_ms: number | null;
	queue_and_preparation_ms: number | null;
	lanes: Array<{
		step_key: string;
		label: string;
		started_at: string | null;
		ended_at: string | null;
		duration_ms: number | null;
	}>;
	parallel_overlap_ms: number | null;
	sum_of_lane_ms: number | null;
}

export interface WorkflowAuditCoverageNote {
	scope: string;
	status: WorkflowAuditCoverageStatus;
	detail: string;
}

export interface WorkflowAuditProgressEvent {
	id: string;
	sequence_index: number | null;
	created_at: string | null;
	execution_generation: number | null;
	phase: string | null;
	terminal_outcome: string | null;
	execution_state: string | null;
	step_statuses: Record<string, string>;
	coverage_gap: string | null;
}

export interface WorkflowAuditRun {
	turn_run_id: string;
	session_id: string | null;
	user_id: string | null;
	project_id: string | null;
	request_artifact_id: string | null;
	turn_index: number | null;
	turn_status: string | null;
	turn_finished_reason: string | null;
	turn_failure_code: string | null;
	request_message: string;
	workflow_version: string | null;
	policy_ref: string | null;
	policy: JsonRecord | null;
	plan_version: string | null;
	request_hash: string | null;
	phase: string | null;
	terminal_outcome: string | null;
	is_terminal: boolean;
	outcome_label: string;
	supported: boolean;
	unsupported_reason: string | null;
	limits: {
		max_spend_micro_usd: number | null;
		synthesis_headroom_micro_usd: number | null;
		max_physical_dispatches: number | null;
		max_step_attempts: number | null;
		whole_run_lifetime_ms: number | null;
	};
	deadline_at: string | null;
	recovery_count: number;
	created_at: string | null;
	updated_at: string | null;
	finished_at: string | null;
	context: {
		context_id: string;
		preparation_version: string | null;
		context_identity: JsonRecord | null;
		evidence_versions: Array<{
			kind: string;
			id: string;
			version: string | null;
			observed_at: string | null;
		}>;
		context_hash: string | null;
		context_bytes: number | null;
		accepted_at: string | null;
		accepted_generation: number | null;
		payload: JsonRecord | null;
	} | null;
	plan: {
		version: string | null;
		hash: string | null;
		installed_at: string | null;
		installed_generation: number | null;
		planner_outcome: string | null;
		planner_step_attempt_id: string | null;
		planner_result_hash: string | null;
		steps: Array<{ key: string; capability: string | null; depends_on: string[] }>;
		assignments: Record<string, JsonRecord>;
		raw: JsonRecord | null;
	} | null;
	answer: {
		answer_id: string | null;
		editor_step_attempt_id: string | null;
		text: string;
		text_sha256: string | null;
		last_batch_id: string | null;
		synthesis_status: string | null;
		synthesis_quality: string | null;
		synthesis_accepted_at: string | null;
	};
	steps: WorkflowAuditStep[];
	/** Step rows saved for this turn under another plan version; kept verbatim (redacted), not merged. */
	unmatched_step_rows: JsonRecord[];
	dispatches: WorkflowAuditDispatch[];
	tool_calls: WorkflowAuditToolCall[];
	specialist_snapshot: {
		snapshot_hash: string | null;
		version: string | null;
		profile_id: string | null;
		profile_version: number | null;
		engine_version: string | null;
		request_hash_matches_run: boolean | null;
		created_at: string | null;
		slots: Record<string, WorkflowAuditSpecialistPin>;
		raw: JsonRecord | null;
	} | null;
	selection_shadow: WorkflowAuditSelectionShadow | null;
	input_artifact: {
		id: string;
		artifact_version: string | null;
		content_hash: string | null;
		content_bytes: number | null;
		history_source: string | null;
		history_bytes: number | null;
		history_count: number | null;
		retain_until: string | null;
		created_at: string | null;
		request: JsonRecord | null;
		history: unknown[];
		request_hash_matches_run: boolean | null;
	} | null;
	progress_events: WorkflowAuditProgressEvent[];
	sources: WorkflowAuditSource[];
	graph: WorkflowAuditGraph;
	timeline: WorkflowAuditTimelineEntry[];
	costs: WorkflowAuditCosts;
	timing: WorkflowAuditTiming;
	coverage: WorkflowAuditCoverageNote[];
	redactions: number;
}

export interface ChatWorkflowAuditPayload {
	version: typeof CHAT_WORKFLOW_AUDIT_VERSION;
	captured_at: string;
	/** The payload comes from several queries; it is a capture, not a snapshot. */
	atomic: false;
	runs: WorkflowAuditRun[];
	ordinary_turn_ids: string[];
	tables: Record<WorkflowAuditTable, WorkflowAuditCoverage>;
	counts: {
		runs: number;
		steps: number;
		dispatches: number;
		snapshots: number;
		read_batches: number;
		shadows: number;
		input_artifacts: number;
		redactions: number;
	};
	notes: string[];
}
