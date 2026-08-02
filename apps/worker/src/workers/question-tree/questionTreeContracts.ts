// apps/worker/src/workers/question-tree/questionTreeContracts.ts
export type QuestionTreeModelPolicy = 'paid_floor_strict' | 'free_strict';
export type QuestionTreePhase = 'seed' | 'explore' | 'synthesize' | 'done';
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

export interface QuestionTreeJobMetadata {
	run_id: string;
	advance_sequence: number;
}

export interface QuestionTreeRun {
	id: string;
	created_by: string;
	root_node_id: string;
	root_question: string;
	status: QuestionTreeRunStatus;
	phase: QuestionTreePhase;
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
	max_provider_requests: number;
	provider_requests: number;
	config: Record<string, unknown>;
	usage: QuestionTreeUsage;
	synthesis: QuestionTreeSynthesisOutput | null;
	pause_reason: string | null;
	next_retry_at: string | null;
	next_batch_not_before: string | null;
	started_at: string | null;
	completed_at: string | null;
	created_at: string;
	updated_at: string;
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
	normalized_question: string;
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
	lease_owner: string | null;
	lease_expires_at: string | null;
	error_code: string | null;
	error_message: string | null;
	started_at: string | null;
	completed_at: string | null;
	created_at: string;
	updated_at: string;
}

export type QuestionPurpose = 'strengthen' | 'falsify' | 'resolve_unknown' | 'frame';
export type InformationGain = 'low' | 'medium' | 'high';

export interface QuestionTreeProposal {
	id: string;
	run_id: string;
	source_node_id: string;
	rank: number;
	question: string;
	normalized_question: string;
	purpose: QuestionPurpose;
	target_claim: string | null;
	why_it_matters: string;
	expected_information_gain: InformationGain;
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

export interface SeedQuestion {
	question: string;
	unknownAddressed: string;
	whyItMatters: string;
	purpose: 'frame' | 'resolve_unknown' | 'falsify';
	expectedInformationGain: 'medium' | 'high';
}

export interface QuestionTreeSeedOutput {
	questions: SeedQuestion[];
}

export interface QuestionTreeClaim {
	statement: string;
	status: 'probably_right' | 'probably_wrong' | 'unsure';
	basis: string;
}

export interface FollowUpQuestion {
	question: string;
	purpose: 'strengthen' | 'falsify' | 'resolve_unknown';
	targetClaim: string;
	whyItMatters: string;
	expectedInformationGain: InformationGain;
	priority: number;
}

export interface QuestionTreeNodeOutput {
	answer: string;
	thesis: string;
	confidence: number;
	claims: QuestionTreeClaim[];
	followUpQuestions: FollowUpQuestion[];
	stopReason: string;
}

export interface QuestionTreeSynthesisOutput {
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

export interface QuestionTreeUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
	cost_usd: number;
	latency_ms: number;
}

export interface QuestionTreeModelTelemetry extends QuestionTreeUsage {
	model_requested: string;
	model_used: string;
	provider_request_id: string;
	reasoning_tokens: number;
}

export interface QuestionTreeModelResult<T> {
	value: T;
	telemetry: QuestionTreeModelTelemetry;
}

export interface QuestionTreeContextEntry {
	nodeNumber: number;
	question: string;
	answer: string | null;
	thesis: string | null;
}

export interface QuestionTreeModelClient {
	seed(params: {
		run: QuestionTreeRun;
		signal?: AbortSignal;
	}): Promise<QuestionTreeModelResult<QuestionTreeSeedOutput>>;
	answer(params: {
		run: QuestionTreeRun;
		node: QuestionTreeNode;
		ancestry: QuestionTreeContextEntry[];
		signal?: AbortSignal;
	}): Promise<QuestionTreeModelResult<QuestionTreeNodeOutput>>;
	synthesize(params: {
		run: QuestionTreeRun;
		nodes: QuestionTreeNode[];
		proposals: QuestionTreeProposal[];
		signal?: AbortSignal;
	}): Promise<QuestionTreeModelResult<QuestionTreeSynthesisOutput>>;
}
