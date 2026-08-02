// apps/web/src/lib/services/question-tree/types.ts
export type QuestionTreeModelPolicy = 'paid_floor_strict' | 'free_strict';
export type QuestionTreeRunStatus =
	| 'queued'
	| 'running'
	| 'paused'
	| 'quota_paused'
	| 'synthesizing'
	| 'completed'
	| 'completed_partial'
	| 'cancelled'
	| 'failed';

export interface QuestionTreeUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
	cost_usd: number;
	latency_ms: number;
}

export interface QuestionTreeRun {
	id: string;
	created_by: string;
	root_node_id: string;
	root_question: string;
	status: QuestionTreeRunStatus;
	phase: 'seed' | 'explore' | 'synthesize' | 'done';
	model_policy: QuestionTreeModelPolicy;
	explorer_model_requested: string;
	synthesis_model_requested: string;
	prompt_version: string;
	node_limit: number;
	nodes_created: number;
	nodes_completed: number;
	nodes_failed: number;
	deepest_depth: number;
	frontier_count: number;
	advance_sequence: number;
	provider_requests: number;
	max_provider_requests: number;
	config: Record<string, unknown>;
	usage: QuestionTreeUsage;
	synthesis: QuestionTreeSynthesis | null;
	pause_reason: string | null;
	started_at: string | null;
	completed_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface QuestionTreeClaim {
	statement: string;
	status: 'probably_right' | 'probably_wrong' | 'unsure';
	basis: string;
}

export interface QuestionTreeNode {
	id: string;
	run_id: string;
	parent_node_id: string | null;
	node_kind: 'root' | 'question';
	node_number: number;
	depth: number;
	sibling_index: number | null;
	status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
	question: string;
	answer: string | null;
	thesis: string | null;
	epistemic_assessment: QuestionTreeClaim[] | null;
	confidence: number | null;
	stop_reason: string | null;
	model_requested: string | null;
	model_used: string | null;
	provider_request_id: string | null;
	attempt_count: number;
	prompt_tokens: number;
	completion_tokens: number;
	reasoning_tokens: number;
	cost_usd: number;
	latency_ms: number;
	error_code: string | null;
	error_message: string | null;
	started_at: string | null;
	completed_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface QuestionTreeProposal {
	id: string;
	run_id: string;
	source_node_id: string;
	rank: number;
	question: string;
	purpose: 'strengthen' | 'falsify' | 'resolve_unknown' | 'frame';
	target_claim: string | null;
	why_it_matters: string;
	expected_information_gain: 'low' | 'medium' | 'high';
	model_priority: number | null;
	scheduler_score: number | null;
	status:
		| 'proposed'
		| 'not_selected'
		| 'spawned'
		| 'duplicate'
		| 'invalid'
		| 'below_threshold'
		| 'budget_exhausted'
		| 'cancelled';
	child_node_id: string | null;
	duplicate_of_node_id: string | null;
	validation_error: string | null;
	created_at: string;
	updated_at: string;
}

export interface QuestionTreeEvent {
	id: string;
	run_id: string;
	node_id: string | null;
	seq: number;
	event_type: string;
	payload: Record<string, unknown>;
	created_at: string;
}

export interface QuestionTreeSynthesis {
	finalAnswer: string;
	finalThesis: string;
	probablyRight: string[];
	probablyWrong: string[];
	stillUnsure: string[];
	keyEvidence: Array<{ finding: string; nodeNumbers: number[] }>;
	importantDisagreements: Array<{ issue: string; nodeNumbers: number[] }>;
	recommendedNextResearch: string[];
	limitations: string[];
}

export interface QuestionTreeRunDetail {
	run: QuestionTreeRun;
	nodes: QuestionTreeNode[];
	proposals: QuestionTreeProposal[];
	events: QuestionTreeEvent[];
}

export interface QuestionTreeCreateResult {
	run: QuestionTreeRun;
	root_node: QuestionTreeNode;
	job_id: string;
}

export interface ApiEnvelope<T> {
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
}

export function isQuestionTreeActive(status: QuestionTreeRunStatus): boolean {
	return status === 'queued' || status === 'running' || status === 'synthesizing';
}
