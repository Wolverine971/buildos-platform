// apps/web/src/lib/types/answer-comparison.ts
// Contract for the "Compare answers" lab: frozen questions, blind candidates,
// sealed votes, and receipts. No model is ever called from this surface.

export const ANSWER_COMPARISON_SOURCE_PACKET_VERSION = 'answer_comparison_source_packet_v1';
export const ANSWER_COMPARISON_RUBRIC_VERSION = 'answer_comparison_rubric_v1';
export const ANSWER_COMPARISON_IDENTITY_VERSION = 'answer_comparison_candidate_identity_v1';
export const ANSWER_COMPARISON_RECEIPTS_VERSION = 'answer_comparison_receipts_v1';

export const ANSWER_COMPARISON_LIMITS = {
	comparisons: 200,
	candidatesPerComparison: 6,
	titleChars: 200,
	questionChars: 8000,
	answerChars: 60000,
	reasonChars: 4000,
	requiredFacts: 12,
	requiredFactChars: 300,
	candidateNameChars: 120,
	sourceRuns: 60
} as const;

export const ANSWER_COMPARISON_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type ComparisonLabel = (typeof ANSWER_COMPARISON_LABELS)[number];

export type ComparisonSetKind = 'exploratory' | 'held_out';

/** Frozen at creation. Every candidate is bound to its hash. */
export type ComparisonSourcePacket = {
	version: typeof ANSWER_COMPARISON_SOURCE_PACKET_VERSION;
	question: string;
	projectId: string | null;
	/** Accepted workflow context hash the answers were produced from; null for manual packets. */
	contextHash: string | null;
	requestHash: string | null;
};

export type ComparisonRubric = {
	version: typeof ANSWER_COMPARISON_RUBRIC_VERSION;
	/** Facts a correct answer must state. Judged by the reviewer, never by a model. */
	requiredFacts: string[];
};

export type WorkflowRunCandidateIdentity = {
	version: typeof ANSWER_COMPARISON_IDENTITY_VERSION;
	kind: 'workflow_run';
	/** Display name used on the scoreboard, e.g. "Launch reviewer v3" or "Project review v2". */
	name: string;
	turnRunId: string;
	sessionId: string | null;
	projectId: string | null;
	planVersion: string | null;
	policyRef: string | null;
	terminalOutcome: string | null;
	contextHash: string | null;
	requestHash: string | null;
	/** Stored run answer digest, so the candidate can be traced back to the inspector. */
	runAnswerSha256: string | null;
	finishedAt: string | null;
	specialist: {
		id: string | null;
		label: string;
		version: number | string | null;
		snapshotHash: string | null;
	} | null;
};

export type ManualCandidateIdentity = {
	version: typeof ANSWER_COMPARISON_IDENTITY_VERSION;
	kind: 'manual';
	name: string;
	note: string | null;
};

export type CandidateIdentity = WorkflowRunCandidateIdentity | ManualCandidateIdentity;

/** Cost and latency receipts. `null` means unknown and is shown as "unknown", never as 0. */
export type CandidateReceipts = {
	version: typeof ANSWER_COMPARISON_RECEIPTS_VERSION;
	costMicroUsd: number | null;
	latencyMs: number | null;
	modelCalls: number | null;
	models: string[];
	/** false when any dispatch is unsettled or uncertain, so the cost is a floor, not a total. */
	settled: boolean | null;
};

export type RubricScore = {
	/** 0 missing, 1 partial, 2 all required facts present. */
	requiredFacts: 0 | 1 | 2;
	/** 0 none, 1 some, 2 many claims not supported by the packet. */
	unsupportedClaims: 0 | 1 | 2;
	abstention: 'appropriate' | 'inappropriate' | 'not_applicable';
};

export type VoteChoice = 'candidate' | 'tie' | 'neither';

/** A candidate as the reviewer sees it. Identity and receipts are null until the reviewer reveals. */
export type BlindCandidateView = {
	id: string;
	label: ComparisonLabel;
	answer: string;
	answerSha256: string;
	identity: CandidateIdentity | null;
	receipts: CandidateReceipts | null;
	/** True when the answer text names its own producer, which can break blinding. Only set after reveal. */
	disclosureRisk: boolean;
};

export type ComparisonVoteView = {
	choice: VoteChoice;
	preferredLabel: ComparisonLabel | null;
	reason: string;
	rubricScores: Partial<Record<ComparisonLabel, RubricScore>>;
	votedAt: string;
	revealedAt: string | null;
};

export type ComparisonDetail = {
	id: string;
	title: string;
	question: string;
	setKind: ComparisonSetKind;
	packet: ComparisonSourcePacket;
	packetSha256: string;
	rubric: ComparisonRubric;
	createdAt: string;
	candidates: BlindCandidateView[];
	vote: ComparisonVoteView | null;
	revealed: boolean;
};

export type ComparisonSummary = {
	id: string;
	title: string;
	setKind: ComparisonSetKind;
	candidateCount: number;
	createdAt: string;
	vote: { choice: VoteChoice; revealed: boolean } | null;
};

export type ScoreboardRow = {
	name: string;
	comparisons: number;
	wins: number;
	losses: number;
	ties: number;
	neither: number;
	requiredFactsMean: number | null;
	unsupportedClaimsMean: number | null;
	abstentionAppropriate: number;
	abstentionInappropriate: number;
	costMicroUsdMean: number | null;
	latencyMsMean: number | null;
};

export type Scoreboard = {
	includesHeldOut: boolean;
	/** Only sealed (revealed) votes count. Unrevealed votes can still change. */
	sealedVotes: number;
	heldOutExcluded: number;
	rows: ScoreboardRow[];
};

/** A finished pilot workflow run from the inspector data, offered as a candidate source. */
export type ComparisonSourceRun = {
	turnRunId: string;
	name: string;
	question: string;
	projectId: string | null;
	contextHash: string | null;
	requestHash: string | null;
	terminalOutcome: string | null;
	finishedAt: string | null;
	answerPreview: string;
	answerChars: number;
	receipts: CandidateReceipts;
};

/** Runs that share one question and one accepted context; only these can be compared blind. */
export type ComparisonSourceGroup = {
	key: string;
	question: string;
	projectId: string | null;
	contextHash: string | null;
	requestHash: string | null;
	runs: ComparisonSourceRun[];
};

export type AnswerComparisonLabData = {
	comparisons: ComparisonSummary[];
	scoreboard: Scoreboard;
	sources: ComparisonSourceGroup[];
	/** Set when pilot runs could not be listed; the lab still works with manual candidates. */
	sourcesNotice: string | null;
};

export type ManualCandidateInput = {
	kind: 'manual';
	name: string;
	answer: string;
	note?: string | null;
	receipts?: Partial<
		Pick<CandidateReceipts, 'costMicroUsd' | 'latencyMs' | 'modelCalls' | 'models'>
	>;
};
export type WorkflowRunCandidateInput = { kind: 'workflow_run'; turnRunId: string };
export type CandidateInput = ManualCandidateInput | WorkflowRunCandidateInput;

export type CreateComparisonRequest = {
	action: 'create';
	/** Client-generated UUID so a retried create cannot make two comparisons. */
	id: string;
	title: string;
	setKind: ComparisonSetKind;
	requiredFacts: string[];
	source:
		| { kind: 'workflow_runs'; turnRunIds: string[] }
		| { kind: 'manual'; question: string; projectId?: string | null };
	candidates: CandidateInput[];
};
export type AddCandidateRequest = {
	action: 'add_candidate';
	comparisonId: string;
	candidate: CandidateInput;
};
export type VoteRequest = {
	action: 'vote';
	comparisonId: string;
	choice: VoteChoice;
	preferredLabel: ComparisonLabel | null;
	reason: string;
	rubricScores: Partial<Record<ComparisonLabel, RubricScore>>;
};
export type RevealRequest = { action: 'reveal'; comparisonId: string };
export type AnswerComparisonRequest =
	| CreateComparisonRequest
	| AddCandidateRequest
	| VoteRequest
	| RevealRequest;

/** Every POST action answers with the comparison as this reviewer may now see it. */
export type AnswerComparisonResponse = { comparison: ComparisonDetail };
