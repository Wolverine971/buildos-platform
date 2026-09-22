// apps/web/src/lib/services/agentic-chat-v2/answer-comparison-core.ts
// Pure rules for the "Compare answers" lab: packet hashing, blind labels, receipts,
// disclosure checks, request parsing, and the scoreboard. No I/O, no model calls.
import { hashSpecialistWorkbenchValue } from '@buildos/agentic-chat-runtime/specialists';
import {
	ANSWER_COMPARISON_IDENTITY_VERSION,
	ANSWER_COMPARISON_LABELS,
	ANSWER_COMPARISON_LIMITS,
	ANSWER_COMPARISON_RECEIPTS_VERSION,
	ANSWER_COMPARISON_RUBRIC_VERSION,
	ANSWER_COMPARISON_SOURCE_PACKET_VERSION,
	type AddCandidateRequest,
	type AnswerComparisonRequest,
	type BlindCandidateView,
	type CandidateIdentity,
	type CandidateInput,
	type CandidateReceipts,
	type ComparisonLabel,
	type ComparisonRubric,
	type ComparisonSetKind,
	type ComparisonSourceGroup,
	type ComparisonSourcePacket,
	type ComparisonSourceRun,
	type CreateComparisonRequest,
	type RevealRequest,
	type RubricScore,
	type Scoreboard,
	type ScoreboardRow,
	type VoteChoice,
	type VoteRequest,
	type WorkflowRunCandidateIdentity
} from '../../types/answer-comparison';

export class AnswerComparisonValidationError extends Error {}
const invalid = (message: string): never => {
	throw new AnswerComparisonValidationError(message);
};

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const isUuid = (value: unknown): value is string =>
	typeof value === 'string' && UUID.test(value);

/** Plain UTF-8 SHA-256, matching `agentic_chat_sha256_hex_v1(text)` in the database. */
export async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
/** Canonical JSON SHA-256, matching `agentic_chat_sha256_hex_v1(agentic_chat_canonical_json_v1(jsonb))`. */
export const hashCanonical = (value: unknown): Promise<string> =>
	hashSpecialistWorkbenchValue(value);

export function buildSourcePacket(input: {
	question: string;
	projectId: string | null;
	contextHash: string | null;
	requestHash: string | null;
}): ComparisonSourcePacket {
	return {
		version: ANSWER_COMPARISON_SOURCE_PACKET_VERSION,
		question: input.question,
		projectId: input.projectId,
		contextHash: input.contextHash,
		requestHash: input.requestHash
	};
}

export const unknownReceipts = (): CandidateReceipts => ({
	version: ANSWER_COMPARISON_RECEIPTS_VERSION,
	costMicroUsd: null,
	latencyMs: null,
	modelCalls: null,
	models: [],
	settled: null
});

type RunLike = {
	first_execution_started_at?: string | null;
	created_at?: string | null;
	finished_at?: string | null;
};
type DispatchLike = {
	state?: string | null;
	model_requested?: string | null;
	actual_micro_usd?: number | string | null;
};
const num = (value: unknown): number | null => {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};
const ms = (value: string | null | undefined): number | null => {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Receipts from the run's own dispatch ledger. Cost is the sum of settled actuals; when any
 * dispatch has no actual the sum is a floor and `settled` is false. Missing data stays null.
 */
export function summarizeWorkflowReceipts(
	run: RunLike,
	dispatches: DispatchLike[] | null
): CandidateReceipts {
	const started = ms(run.first_execution_started_at) ?? ms(run.created_at);
	const finished = ms(run.finished_at);
	const latencyMs =
		started !== null && finished !== null && finished >= started ? finished - started : null;
	if (!dispatches) return { ...unknownReceipts(), latencyMs };
	const actuals = dispatches.map((d) => num(d.actual_micro_usd));
	const known = actuals.filter((v): v is number => v !== null);
	const settled = dispatches.length > 0 && known.length === dispatches.length;
	return {
		version: ANSWER_COMPARISON_RECEIPTS_VERSION,
		costMicroUsd: known.length ? known.reduce((a, b) => a + b, 0) : null,
		latencyMs,
		modelCalls: dispatches.length,
		models: Array.from(
			new Set(dispatches.map((d) => d.model_requested).filter((m): m is string => !!m))
		).sort(),
		settled: dispatches.length ? settled : null
	};
}

const humanPolicy = (policyRef: string | null, planVersion: string | null): string => {
	const ref = policyRef ?? planVersion;
	if (!ref) return 'Workflow run';
	const match = /^internal-project-review:v(\d+)$/.exec(ref);
	if (match) return `Project review v${match[1]}`;
	return ref.replace(/^agentic_chat_/, '').replace(/_/g, ' ');
};

/** Identity for a pilot run: the analyst specialist when a snapshot recorded one, else the policy. */
export function workflowRunIdentity(
	run: {
		turn_run_id: string;
		session_id?: string | null;
		project_id?: string | null;
		plan_version?: string | null;
		policy_ref?: string | null;
		terminal_outcome?: string | null;
		context_hash?: string | null;
		request_hash?: string | null;
		answer_text_sha256?: string | null;
		finished_at?: string | null;
	},
	snapshot: { snapshot?: unknown; snapshot_hash?: string | null } | null
): WorkflowRunCandidateIdentity {
	const definition = (snapshot?.snapshot as any)?.slots?.project_analyst?.definition;
	const label = typeof definition?.label === 'string' ? definition.label : null;
	const specialist = label
		? {
				id: typeof definition.id === 'string' ? definition.id : null,
				label,
				version:
					typeof definition.version === 'number' || typeof definition.version === 'string'
						? definition.version
						: null,
				snapshotHash: snapshot?.snapshot_hash ?? null
			}
		: null;
	const name = specialist
		? `${specialist.label}${specialist.version !== null ? ` v${specialist.version}` : ''}`
		: humanPolicy(run.policy_ref ?? null, run.plan_version ?? null);
	return {
		version: ANSWER_COMPARISON_IDENTITY_VERSION,
		kind: 'workflow_run',
		name: name.slice(0, ANSWER_COMPARISON_LIMITS.candidateNameChars),
		turnRunId: run.turn_run_id,
		sessionId: run.session_id ?? null,
		projectId: run.project_id ?? null,
		planVersion: run.plan_version ?? null,
		policyRef: run.policy_ref ?? null,
		terminalOutcome: run.terminal_outcome ?? null,
		contextHash: run.context_hash ?? null,
		requestHash: run.request_hash ?? null,
		runAnswerSha256: run.answer_text_sha256 ?? null,
		finishedAt: run.finished_at ?? null,
		specialist
	};
}

/** Blind labels per reviewer: order candidates by sha256(comparison:reviewer:candidate). */
export async function assignBlindLabels(
	comparisonId: string,
	reviewerId: string,
	candidateIds: string[]
): Promise<Record<ComparisonLabel, string>> {
	if (candidateIds.length > ANSWER_COMPARISON_LABELS.length)
		invalid('Too many candidates to label.');
	const keyed = await Promise.all(
		candidateIds.map(async (id) => ({
			id,
			key: await sha256Hex(`${comparisonId}:${reviewerId}:${id}`)
		}))
	);
	keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
	const assignment = {} as Record<ComparisonLabel, string>;
	keyed.forEach((entry, index) => {
		assignment[ANSWER_COMPARISON_LABELS[index]!] = entry.id;
	});
	return assignment;
}

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ');
/** True when the answer names its producer. Only meaningful to show after reveal. */
export function detectDisclosureRisk(identity: CandidateIdentity, answer: string): boolean {
	const haystack = normalize(answer);
	const needles = [identity.name];
	if (identity.kind === 'workflow_run' && identity.specialist)
		needles.push(identity.specialist.label);
	return needles.some((needle) => {
		const n = normalize(needle).trim();
		return n.length >= 4 && haystack.includes(n);
	});
}

export function previewAnswer(text: string, chars = 160): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	return flat.length > chars ? `${flat.slice(0, chars - 1)}…` : flat;
}

/** Runs are comparable only when they answered the same question from the same context. */
export function groupSourceRuns(runs: ComparisonSourceRun[]): ComparisonSourceGroup[] {
	const groups = new Map<string, ComparisonSourceGroup>();
	for (const run of runs) {
		const key = `${run.contextHash ?? 'no-context'}|${run.requestHash ?? normalize(run.question)}`;
		const group = groups.get(key) ?? {
			key,
			question: run.question,
			projectId: run.projectId,
			contextHash: run.contextHash,
			requestHash: run.requestHash,
			runs: []
		};
		group.runs.push(run);
		groups.set(key, group);
	}
	const latest = (group: ComparisonSourceGroup) =>
		Math.max(...group.runs.map((r) => ms(r.finishedAt) ?? 0));
	return [...groups.values()]
		.map((group) => ({
			...group,
			runs: [...group.runs].sort((a, b) => (ms(b.finishedAt) ?? 0) - (ms(a.finishedAt) ?? 0))
		}))
		.sort((a, b) => b.runs.length - a.runs.length || latest(b) - latest(a));
}

// ---------------------------------------------------------------------------
// Request parsing (422 on any shape error; the store never sees unparsed input)
const text = (value: unknown, max: number, field: string, min = 1): string => {
	if (typeof value !== 'string') invalid(`${field} must be text.`);
	const trimmed = (value as string).replace(/\r\n?/g, '\n').trim();
	if (trimmed.length < min) invalid(`${field} is required.`);
	if (trimmed.length > max) invalid(`${field} exceeds ${max} characters.`);
	return trimmed;
};
const setKind = (value: unknown): ComparisonSetKind =>
	value === 'exploratory' || value === 'held_out'
		? value
		: invalid('Set kind must be exploratory or held_out.');
const optionalNumber = (value: unknown, field: string): number | null => {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
		invalid(`${field} must be a non-negative number or null.`);
	return Math.round(value as number);
};

export function parseCandidateInput(value: unknown): CandidateInput {
	const raw = (value ?? {}) as Record<string, unknown>;
	if (raw.kind === 'workflow_run') {
		if (!isUuid(raw.turnRunId)) invalid('Candidate run id is invalid.');
		return { kind: 'workflow_run', turnRunId: raw.turnRunId as string };
	}
	if (raw.kind !== 'manual') invalid('Candidate kind must be workflow_run or manual.');
	const receipts = (raw.receipts ?? {}) as Record<string, unknown>;
	const models = Array.isArray(receipts.models)
		? receipts.models.map((m) => text(m, 120, 'Model name'))
		: [];
	return {
		kind: 'manual',
		name: text(raw.name, ANSWER_COMPARISON_LIMITS.candidateNameChars, 'Candidate name'),
		answer: text(raw.answer, ANSWER_COMPARISON_LIMITS.answerChars, 'Answer'),
		note: raw.note == null || raw.note === '' ? null : text(raw.note, 1000, 'Note'),
		receipts: {
			costMicroUsd: optionalNumber(receipts.costMicroUsd, 'Cost'),
			latencyMs: optionalNumber(receipts.latencyMs, 'Latency'),
			modelCalls: optionalNumber(receipts.modelCalls, 'Model calls'),
			models
		}
	};
}

export function parseRubricFacts(value: unknown): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) invalid('Required facts must be a list.');
	const facts = (value as unknown[])
		.map((fact) =>
			typeof fact === 'string' ? fact.trim() : invalid('Required facts must be text.')
		)
		.filter((fact) => fact.length > 0);
	if (facts.length > ANSWER_COMPARISON_LIMITS.requiredFacts) invalid('Too many required facts.');
	for (const fact of facts)
		if (fact.length > ANSWER_COMPARISON_LIMITS.requiredFactChars)
			invalid('A required fact is too long.');
	return facts;
}

export function buildRubric(requiredFacts: string[]): ComparisonRubric {
	return { version: ANSWER_COMPARISON_RUBRIC_VERSION, requiredFacts };
}

function parseCreate(raw: Record<string, unknown>): CreateComparisonRequest {
	if (!isUuid(raw.id)) invalid('Comparison id must be a UUID.');
	const source = (raw.source ?? {}) as Record<string, unknown>;
	const candidates = Array.isArray(raw.candidates) ? raw.candidates.map(parseCandidateInput) : [];
	if (candidates.length < 2) invalid('A comparison needs at least two candidates.');
	if (candidates.length > ANSWER_COMPARISON_LIMITS.candidatesPerComparison)
		invalid(
			`A comparison holds at most ${ANSWER_COMPARISON_LIMITS.candidatesPerComparison} candidates.`
		);
	let parsedSource: CreateComparisonRequest['source'];
	if (source.kind === 'workflow_runs') {
		const ids = Array.isArray(source.turnRunIds) ? source.turnRunIds : [];
		if (!ids.length || !ids.every(isUuid)) invalid('Source run ids are invalid.');
		parsedSource = { kind: 'workflow_runs', turnRunIds: Array.from(new Set(ids as string[])) };
	} else if (source.kind === 'manual') {
		if (candidates.some((c) => c.kind === 'workflow_run'))
			invalid('A manual question cannot take pilot runs as candidates.');
		parsedSource = {
			kind: 'manual',
			question: text(source.question, ANSWER_COMPARISON_LIMITS.questionChars, 'Question'),
			projectId: isUuid(source.projectId) ? (source.projectId as string) : null
		};
	} else invalid('Source must be workflow_runs or manual.');
	return {
		action: 'create',
		id: raw.id as string,
		title: text(raw.title, ANSWER_COMPARISON_LIMITS.titleChars, 'Title'),
		setKind: setKind(raw.setKind),
		requiredFacts: parseRubricFacts(raw.requiredFacts),
		source: parsedSource!,
		candidates
	};
}

const LABELS = new Set<string>(ANSWER_COMPARISON_LABELS);
function parseRubricScore(value: unknown): RubricScore {
	const raw = (value ?? {}) as Record<string, unknown>;
	const score = (v: unknown, field: string): 0 | 1 | 2 =>
		v === 0 || v === 1 || v === 2 ? v : invalid(`${field} must be 0, 1, or 2.`);
	const abstention = raw.abstention;
	if (
		abstention !== 'appropriate' &&
		abstention !== 'inappropriate' &&
		abstention !== 'not_applicable'
	)
		invalid('Abstention must be appropriate, inappropriate, or not_applicable.');
	return {
		requiredFacts: score(raw.requiredFacts, 'Required facts'),
		unsupportedClaims: score(raw.unsupportedClaims, 'Unsupported claims'),
		abstention: abstention as RubricScore['abstention']
	};
}
function parseVote(raw: Record<string, unknown>): VoteRequest {
	if (!isUuid(raw.comparisonId)) invalid('Comparison id must be a UUID.');
	const choice = raw.choice;
	if (choice !== 'candidate' && choice !== 'tie' && choice !== 'neither')
		invalid('Choice must be candidate, tie, or neither.');
	const preferredLabel = raw.preferredLabel;
	if (
		choice === 'candidate' &&
		(typeof preferredLabel !== 'string' || !LABELS.has(preferredLabel))
	)
		invalid('Pick the preferred answer.');
	if (choice !== 'candidate' && preferredLabel != null)
		invalid('Tie and neither take no preferred answer.');
	const scores = (raw.rubricScores ?? {}) as Record<string, unknown>;
	if (typeof scores !== 'object' || Array.isArray(scores)) invalid('Rubric scores are invalid.');
	const rubricScores: Partial<Record<ComparisonLabel, RubricScore>> = {};
	for (const [label, score] of Object.entries(scores)) {
		if (!LABELS.has(label)) invalid(`Unknown answer label ${label}.`);
		rubricScores[label as ComparisonLabel] = parseRubricScore(score);
	}
	return {
		action: 'vote',
		comparisonId: raw.comparisonId as string,
		choice: choice as VoteChoice,
		preferredLabel: choice === 'candidate' ? (preferredLabel as ComparisonLabel) : null,
		reason: text(raw.reason, ANSWER_COMPARISON_LIMITS.reasonChars, 'Reason'),
		rubricScores
	};
}

export function parseAnswerComparisonRequest(body: unknown): AnswerComparisonRequest {
	const raw = (body ?? {}) as Record<string, unknown>;
	switch (raw.action) {
		case 'create':
			return parseCreate(raw);
		case 'add_candidate': {
			if (!isUuid(raw.comparisonId)) invalid('Comparison id must be a UUID.');
			const request: AddCandidateRequest = {
				action: 'add_candidate',
				comparisonId: raw.comparisonId as string,
				candidate: parseCandidateInput(raw.candidate)
			};
			return request;
		}
		case 'vote':
			return parseVote(raw);
		case 'reveal': {
			if (!isUuid(raw.comparisonId)) invalid('Comparison id must be a UUID.');
			const request: RevealRequest = {
				action: 'reveal',
				comparisonId: raw.comparisonId as string
			};
			return request;
		}
		default:
			return invalid('Unsupported comparison action.');
	}
}

// ---------------------------------------------------------------------------
// Views
export type StoredCandidate = {
	id: string;
	identity: CandidateIdentity;
	answer: string;
	answerSha256: string;
	receipts: CandidateReceipts;
};

export function toBlindViews(
	candidates: StoredCandidate[],
	assignment: Record<ComparisonLabel, string>,
	revealed: boolean
): BlindCandidateView[] {
	const byId = new Map(candidates.map((c) => [c.id, c]));
	return ANSWER_COMPARISON_LABELS.filter((label) => assignment[label]).map((label) => {
		const candidate = byId.get(assignment[label]);
		if (!candidate) invalid('Blind label assignment does not match the candidates.');
		const c = candidate!;
		return {
			id: c.id,
			label,
			answer: c.answer,
			answerSha256: c.answerSha256,
			identity: revealed ? c.identity : null,
			receipts: revealed ? c.receipts : null,
			disclosureRisk: revealed ? detectDisclosureRisk(c.identity, c.answer) : false
		};
	});
}

// ---------------------------------------------------------------------------
// Scoreboard: sealed votes only, held-out excluded unless asked for
export type ScoreboardInput = {
	setKind: ComparisonSetKind;
	candidates: Pick<StoredCandidate, 'id' | 'identity' | 'receipts'>[];
	vote: {
		choice: VoteChoice;
		preferredCandidateId: string | null;
		rubricScores: Record<string, RubricScore | undefined>;
		revealedAt: string | null;
	} | null;
};

type Accumulator = ScoreboardRow & {
	facts: number[];
	unsupported: number[];
	costs: number[];
	latencies: number[];
};
const mean = (values: number[]): number | null =>
	values.length
		? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
		: null;

export function buildScoreboard(
	comparisons: ScoreboardInput[],
	includeHeldOut: boolean
): Scoreboard {
	const rows = new Map<string, Accumulator>();
	let sealedVotes = 0;
	let heldOutExcluded = 0;
	for (const comparison of comparisons) {
		if (!comparison.vote?.revealedAt) continue;
		if (comparison.setKind === 'held_out' && !includeHeldOut) {
			heldOutExcluded += 1;
			continue;
		}
		sealedVotes += 1;
		const vote = comparison.vote;
		for (const candidate of comparison.candidates) {
			const name = candidate.identity.name;
			const row =
				rows.get(name) ??
				({
					name,
					comparisons: 0,
					wins: 0,
					losses: 0,
					ties: 0,
					neither: 0,
					requiredFactsMean: null,
					unsupportedClaimsMean: null,
					abstentionAppropriate: 0,
					abstentionInappropriate: 0,
					costMicroUsdMean: null,
					latencyMsMean: null,
					facts: [],
					unsupported: [],
					costs: [],
					latencies: []
				} satisfies Accumulator);
			row.comparisons += 1;
			if (vote.choice === 'tie') row.ties += 1;
			else if (vote.choice === 'neither') row.neither += 1;
			else if (vote.preferredCandidateId === candidate.id) row.wins += 1;
			else row.losses += 1;
			const score = vote.rubricScores[candidate.id];
			if (score) {
				row.facts.push(score.requiredFacts);
				row.unsupported.push(score.unsupportedClaims);
				if (score.abstention === 'appropriate') row.abstentionAppropriate += 1;
				if (score.abstention === 'inappropriate') row.abstentionInappropriate += 1;
			}
			if (candidate.receipts.costMicroUsd !== null)
				row.costs.push(candidate.receipts.costMicroUsd);
			if (candidate.receipts.latencyMs !== null)
				row.latencies.push(candidate.receipts.latencyMs);
			rows.set(name, row);
		}
	}
	return {
		includesHeldOut: includeHeldOut,
		sealedVotes,
		heldOutExcluded,
		rows: [...rows.values()]
			.map(({ facts, unsupported, costs, latencies, ...row }) => ({
				...row,
				requiredFactsMean: mean(facts),
				unsupportedClaimsMean: mean(unsupported),
				costMicroUsdMean: mean(costs),
				latencyMsMean: mean(latencies)
			}))
			.sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name))
	};
}
