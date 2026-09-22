// apps/web/src/lib/services/agentic-chat-v2/answer-comparison.server.ts
// Private adapter for the "Compare answers" lab. Every query carries the verified session
// owner. Pilot runs are read from the inspector tables; nothing here calls a model.
import {
	ANSWER_COMPARISON_IDENTITY_VERSION,
	ANSWER_COMPARISON_LIMITS,
	ANSWER_COMPARISON_RECEIPTS_VERSION,
	type AddCandidateRequest,
	type AnswerComparisonLabData,
	type CandidateIdentity,
	type CandidateInput,
	type CandidateReceipts,
	type ComparisonDetail,
	type ComparisonLabel,
	type ComparisonRubric,
	type ComparisonSourceGroup,
	type ComparisonSourcePacket,
	type ComparisonSourceRun,
	type ComparisonSummary,
	type CreateComparisonRequest,
	type RubricScore,
	type VoteChoice,
	type VoteRequest
} from '../../types/answer-comparison';
import {
	AnswerComparisonValidationError,
	assignBlindLabels,
	buildRubric,
	buildScoreboard,
	buildSourcePacket,
	groupSourceRuns,
	hashCanonical,
	previewAnswer,
	sha256Hex,
	summarizeWorkflowReceipts,
	toBlindViews,
	unknownReceipts,
	workflowRunIdentity,
	type ScoreboardInput,
	type StoredCandidate
} from './answer-comparison-core';

type DbResult = { data: unknown; error: { message?: string; code?: string } | null };
interface Query extends PromiseLike<DbResult> {
	select(columns: string): Query;
	eq(column: string, value: unknown): Query;
	in(column: string, values: unknown[]): Query;
	order(column: string, options: { ascending: boolean }): Query;
	limit(count: number): Query;
	maybeSingle(): PromiseLike<DbResult>;
}
export interface AnswerComparisonClient {
	from(table: string): Query;
	rpc(name: string, args: Record<string, unknown>): PromiseLike<DbResult>;
}
export class AnswerComparisonStoreError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}
const unavailable = () =>
	new AnswerComparisonStoreError(503, 'Comparison storage is unavailable. Try again.');
const invalid = (message: string): never => {
	throw new AnswerComparisonValidationError(message);
};

const comparisonTable = 'agentic_chat_answer_comparisons';
const candidateTable = 'agentic_chat_answer_comparison_candidates';
const voteTable = 'agentic_chat_answer_comparison_votes';
const row = (value: unknown) => value as Record<string, any>;
const rows = (value: unknown): Record<string, any>[] => (Array.isArray(value) ? value : []);
function checked(response: DbResult): any {
	if (response.error) throw unavailable();
	return response.data;
}

// ---------------------------------------------------------------------------
// Pilot runs from the inspector data (owner-scoped)
const runColumns =
	'turn_run_id,session_id,project_id,policy_ref,plan_version,terminal_outcome,context_hash,request_hash,answer_text,answer_text_sha256,first_execution_started_at,created_at,finished_at';

type LoadedRun = {
	run: Record<string, any>;
	question: string | null;
	identity: CandidateIdentity;
	receipts: CandidateReceipts;
};

async function loadRuns(
	client: AnswerComparisonClient,
	userId: string,
	turnRunIds: string[] | null
): Promise<LoadedRun[]> {
	let query = client.from('chat_turn_workflow_runs').select(runColumns).eq('user_id', userId);
	query = turnRunIds ? query.in('turn_run_id', turnRunIds) : query;
	const runs = rows(
		checked(
			await query
				.order('created_at', { ascending: false })
				.limit(turnRunIds ? turnRunIds.length : ANSWER_COMPARISON_LIMITS.sourceRuns)
		)
	).filter((r) => typeof r.answer_text === 'string' && r.answer_text.trim().length > 0);
	if (!runs.length) return [];
	const ids = runs.map((r) => String(r.turn_run_id));
	const [turns, dispatchResult, snapshotResult] = await Promise.all([
		client
			.from('chat_turn_runs')
			.select('id,user_message_id')
			.eq('user_id', userId)
			.in('id', ids),
		client
			.from('chat_turn_workflow_dispatches')
			.select('turn_run_id,state,model_requested,actual_micro_usd')
			.eq('user_id', userId)
			.in('turn_run_id', ids)
			.limit(2000),
		client
			.from('chat_turn_specialist_snapshots')
			.select('turn_run_id,snapshot,snapshot_hash')
			.eq('user_id', userId)
			.in('turn_run_id', ids)
	]);
	const messageIds = rows(checked(turns))
		.map((t) => t.user_message_id)
		.filter((id): id is string => typeof id === 'string');
	const messages = messageIds.length
		? rows(
				checked(
					await client
						.from('chat_messages')
						.select('id,content,role')
						.eq('user_id', userId)
						.in('id', messageIds)
				)
			)
		: [];
	const questionByTurn = new Map<string, string>();
	const contentById = new Map(messages.map((m) => [String(m.id), m]));
	for (const turn of rows(checked(turns))) {
		const message = turn.user_message_id ? contentById.get(String(turn.user_message_id)) : null;
		if (
			message &&
			message.role === 'user' &&
			typeof message.content === 'string' &&
			message.content.trim()
		)
			questionByTurn.set(String(turn.id), message.content.trim());
	}
	// Dispatch and snapshot tables are optional evidence: unavailable means unknown, not zero.
	const dispatchesByTurn = dispatchResult.error
		? null
		: rows(dispatchResult.data).reduce((map, d) => {
				const list = map.get(String(d.turn_run_id)) ?? [];
				list.push(d);
				map.set(String(d.turn_run_id), list);
				return map;
			}, new Map<string, Record<string, any>[]>());
	const snapshotByTurn = new Map(
		(snapshotResult.error ? [] : rows(snapshotResult.data)).map((s) => [
			String(s.turn_run_id),
			s
		])
	);
	return runs.map((run) => {
		const id = String(run.turn_run_id);
		return {
			run,
			question: questionByTurn.get(id) ?? null,
			identity: workflowRunIdentity(
				{ ...run, turn_run_id: id },
				snapshotByTurn.get(id) ?? null
			),
			receipts: summarizeWorkflowReceipts(
				run,
				dispatchesByTurn ? (dispatchesByTurn.get(id) ?? []) : null
			)
		};
	});
}

const normalizeAnswer = (text: unknown) => String(text).replace(/\r\n?/g, '\n').trim();

function toSourceRun(loaded: LoadedRun): ComparisonSourceRun | null {
	if (!loaded.question) return null;
	const answer = normalizeAnswer(loaded.run.answer_text);
	return {
		turnRunId: String(loaded.run.turn_run_id),
		name: loaded.identity.name,
		question: loaded.question,
		projectId: loaded.run.project_id ?? null,
		contextHash: loaded.run.context_hash ?? null,
		requestHash: loaded.run.request_hash ?? null,
		terminalOutcome: loaded.run.terminal_outcome ?? null,
		finishedAt: loaded.run.finished_at ?? null,
		answerPreview: previewAnswer(answer),
		answerChars: answer.length,
		receipts: loaded.receipts
	};
}

export async function listComparisonSources(
	client: AnswerComparisonClient,
	userId: string
): Promise<ComparisonSourceGroup[]> {
	const loaded = await loadRuns(client, userId, null);
	return groupSourceRuns(loaded.map(toSourceRun).filter((r): r is ComparisonSourceRun => !!r));
}

// ---------------------------------------------------------------------------
// Stored rows → views
function storedCandidate(value: unknown): StoredCandidate {
	const r = row(value);
	return {
		id: String(r.id),
		identity: r.identity as CandidateIdentity,
		answer: String(r.answer),
		answerSha256: String(r.answer_sha256),
		receipts: r.receipts as CandidateReceipts
	};
}
type StoredVote = {
	labelAssignment: Record<string, string>;
	choice: VoteChoice;
	preferredCandidateId: string | null;
	reason: string;
	rubricScores: Record<string, RubricScore | undefined>;
	votedAt: string;
	revealedAt: string | null;
};
function storedVote(value: unknown): StoredVote | null {
	if (!value) return null;
	const r = row(value);
	return {
		labelAssignment: (r.label_assignment ?? {}) as Record<string, string>,
		choice: r.choice as VoteChoice,
		preferredCandidateId: r.preferred_candidate_id ?? null,
		reason: String(r.reason ?? ''),
		rubricScores: (r.rubric_scores ?? {}) as Record<string, RubricScore | undefined>,
		votedAt: String(r.voted_at),
		revealedAt: r.revealed_at ?? null
	};
}

async function labelsFor(
	comparisonId: string,
	userId: string,
	candidates: StoredCandidate[],
	vote: StoredVote | null
): Promise<Record<ComparisonLabel, string>> {
	// A recorded vote pins the labels the reviewer saw; before that they are derived.
	if (vote && Object.keys(vote.labelAssignment).length === candidates.length)
		return vote.labelAssignment as Record<ComparisonLabel, string>;
	return assignBlindLabels(
		comparisonId,
		userId,
		candidates.map((c) => c.id)
	);
}

async function buildDetail(
	userId: string,
	comparison: Record<string, any>,
	candidates: StoredCandidate[],
	vote: StoredVote | null
): Promise<ComparisonDetail> {
	const id = String(comparison.id);
	const assignment = await labelsFor(id, userId, candidates, vote);
	const revealed = !!vote?.revealedAt;
	const labelOf = new Map(
		Object.entries(assignment).map(([label, cid]) => [cid, label as ComparisonLabel])
	);
	const rubricScores: Partial<Record<ComparisonLabel, RubricScore>> = {};
	if (vote)
		for (const [cid, score] of Object.entries(vote.rubricScores)) {
			const label = labelOf.get(cid);
			if (label && score) rubricScores[label] = score;
		}
	return {
		id,
		title: String(comparison.title),
		question: String(comparison.question),
		setKind: comparison.set_kind,
		packet: comparison.source_packet as ComparisonSourcePacket,
		packetSha256: String(comparison.source_packet_sha256),
		rubric: comparison.rubric as ComparisonRubric,
		createdAt: String(comparison.created_at),
		candidates: toBlindViews(candidates, assignment, revealed),
		vote: vote
			? {
					choice: vote.choice,
					preferredLabel: vote.preferredCandidateId
						? (labelOf.get(vote.preferredCandidateId) ?? null)
						: null,
					reason: vote.reason,
					rubricScores,
					votedAt: vote.votedAt,
					revealedAt: vote.revealedAt
				}
			: null,
		revealed
	};
}

async function loadComparison(client: AnswerComparisonClient, userId: string, id: string) {
	const comparison = checked(
		await client
			.from(comparisonTable)
			.select(
				'id,title,question,set_kind,source_packet,source_packet_sha256,rubric,created_at'
			)
			.eq('user_id', userId)
			.eq('id', id)
			.maybeSingle()
	);
	if (!comparison) throw new AnswerComparisonStoreError(404, 'Comparison not found.');
	const [candidates, vote] = await Promise.all([
		client
			.from(candidateTable)
			.select('id,identity,answer,answer_sha256,receipts,position')
			.eq('user_id', userId)
			.eq('comparison_id', id)
			.order('position', { ascending: true })
			.limit(ANSWER_COMPARISON_LIMITS.candidatesPerComparison),
		client
			.from(voteTable)
			.select(
				'label_assignment,choice,preferred_candidate_id,reason,rubric_scores,voted_at,revealed_at'
			)
			.eq('reviewer_user_id', userId)
			.eq('comparison_id', id)
			.maybeSingle()
	]);
	return {
		comparison: row(comparison),
		candidates: rows(checked(candidates)).map(storedCandidate),
		vote: storedVote(checked(vote))
	};
}

export async function getAnswerComparison(
	client: AnswerComparisonClient,
	userId: string,
	id: string
): Promise<ComparisonDetail> {
	const { comparison, candidates, vote } = await loadComparison(client, userId, id);
	return buildDetail(userId, comparison, candidates, vote);
}

export async function listAnswerComparisonLab(
	client: AnswerComparisonClient,
	userId: string,
	options: { includeHeldOut?: boolean } = {}
): Promise<AnswerComparisonLabData> {
	const includeHeldOut = options.includeHeldOut === true;
	const comparisons = rows(
		checked(
			await client
				.from(comparisonTable)
				.select('id,title,set_kind,created_at')
				.eq('user_id', userId)
				.order('created_at', { ascending: false })
				.limit(ANSWER_COMPARISON_LIMITS.comparisons)
		)
	);
	const ids = comparisons.map((c) => String(c.id));
	const [candidates, votes, sources] = await Promise.all([
		ids.length
			? client
					.from(candidateTable)
					.select('id,comparison_id,identity,receipts')
					.eq('user_id', userId)
					.in('comparison_id', ids)
					.limit(
						ANSWER_COMPARISON_LIMITS.comparisons *
							ANSWER_COMPARISON_LIMITS.candidatesPerComparison
					)
			: Promise.resolve({ data: [], error: null } as DbResult),
		ids.length
			? client
					.from(voteTable)
					.select(
						'comparison_id,choice,preferred_candidate_id,rubric_scores,revealed_at,label_assignment,reason,voted_at'
					)
					.eq('reviewer_user_id', userId)
					.in('comparison_id', ids)
					.limit(ANSWER_COMPARISON_LIMITS.comparisons)
			: Promise.resolve({ data: [], error: null } as DbResult),
		listComparisonSources(client, userId).then(
			(groups) => ({ groups, notice: null as string | null }),
			() => ({
				groups: [] as ComparisonSourceGroup[],
				notice: 'Pilot runs could not be listed. Written answers still work.'
			})
		)
	]);
	const candidatesByComparison = new Map<string, StoredCandidate[]>();
	for (const c of rows(checked(candidates))) {
		const list = candidatesByComparison.get(String(c.comparison_id)) ?? [];
		list.push({ ...storedCandidate({ ...c, answer: '', answer_sha256: '' }) });
		candidatesByComparison.set(String(c.comparison_id), list);
	}
	const voteByComparison = new Map(
		rows(checked(votes)).map((v) => [String(v.comparison_id), storedVote(v)!])
	);
	const summaries: ComparisonSummary[] = comparisons.map((c) => {
		const vote = voteByComparison.get(String(c.id)) ?? null;
		return {
			id: String(c.id),
			title: String(c.title),
			setKind: c.set_kind,
			candidateCount: candidatesByComparison.get(String(c.id))?.length ?? 0,
			createdAt: String(c.created_at),
			vote: vote ? { choice: vote.choice, revealed: !!vote.revealedAt } : null
		};
	});
	const scoreboardInput: ScoreboardInput[] = comparisons.map((c) => {
		const vote = voteByComparison.get(String(c.id)) ?? null;
		return {
			setKind: c.set_kind,
			candidates: candidatesByComparison.get(String(c.id)) ?? [],
			vote: vote
				? {
						choice: vote.choice,
						preferredCandidateId: vote.preferredCandidateId,
						rubricScores: vote.rubricScores,
						revealedAt: vote.revealedAt
					}
				: null
		};
	});
	return {
		comparisons: summaries,
		scoreboard: buildScoreboard(scoreboardInput, includeHeldOut),
		sources: sources.groups,
		sourcesNotice: sources.notice
	};
}

// ---------------------------------------------------------------------------
// Writes
type CandidatePayload = {
	id: string;
	identity: CandidateIdentity;
	answer: string;
	answerSha256: string;
	receipts: CandidateReceipts;
};

async function resolveCandidates(
	client: AnswerComparisonClient,
	userId: string,
	inputs: CandidateInput[],
	packet: ComparisonSourcePacket | null
): Promise<{ payloads: CandidatePayload[]; runs: LoadedRun[] }> {
	const runIds = inputs.filter((c) => c.kind === 'workflow_run').map((c) => c.turnRunId);
	const runs = runIds.length ? await loadRuns(client, userId, runIds) : [];
	const byId = new Map(runs.map((r) => [String(r.run.turn_run_id), r]));
	const payloads: CandidatePayload[] = [];
	for (const input of inputs) {
		if (input.kind === 'workflow_run') {
			const loaded = byId.get(input.turnRunId);
			if (!loaded)
				throw new AnswerComparisonStoreError(404, 'A selected pilot run was not found.');
			if (packet && (loaded.run.context_hash ?? null) !== packet.contextHash)
				invalid('Every pilot run must answer from the same accepted context.');
			if (packet && loaded.question && loaded.question !== packet.question)
				invalid('Every pilot run must answer the same question.');
			const answer = normalizeAnswer(loaded.run.answer_text);
			payloads.push({
				id: crypto.randomUUID(),
				identity: loaded.identity,
				answer,
				answerSha256: await sha256Hex(answer),
				receipts: loaded.receipts
			});
		} else {
			const answer = input.answer;
			payloads.push({
				id: crypto.randomUUID(),
				identity: {
					version: ANSWER_COMPARISON_IDENTITY_VERSION,
					kind: 'manual',
					name: input.name,
					note: input.note ?? null
				},
				answer,
				answerSha256: await sha256Hex(answer),
				receipts: {
					version: ANSWER_COMPARISON_RECEIPTS_VERSION,
					costMicroUsd: input.receipts?.costMicroUsd ?? null,
					latencyMs: input.receipts?.latencyMs ?? null,
					modelCalls: input.receipts?.modelCalls ?? null,
					models: input.receipts?.models ?? [],
					settled: input.receipts?.costMicroUsd != null ? true : null
				}
			});
		}
	}
	return { payloads, runs };
}

function outcome(value: unknown, expected: string[]): Record<string, any> {
	const r = row(value);
	if (!r || typeof r.outcome !== 'string') throw unavailable();
	if (r.outcome === 'not_found')
		throw new AnswerComparisonStoreError(404, 'Comparison not found.');
	if (r.outcome === 'limit_reached')
		throw new AnswerComparisonStoreError(409, 'The comparison limit has been reached.');
	if (r.outcome === 'locked')
		throw new AnswerComparisonStoreError(409, 'Votes exist, so candidates are locked.');
	if (r.outcome === 'sealed')
		throw new AnswerComparisonStoreError(409, 'This vote is sealed and cannot change.');
	if (r.outcome === 'vote_required')
		throw new AnswerComparisonStoreError(409, 'Save a vote before revealing.');
	if (!expected.includes(r.outcome)) throw unavailable();
	return r;
}

export async function createAnswerComparison(
	client: AnswerComparisonClient,
	userId: string,
	request: CreateComparisonRequest
): Promise<ComparisonDetail> {
	let packet: ComparisonSourcePacket;
	if (request.source.kind === 'manual') {
		packet = buildSourcePacket({
			question: request.source.question,
			projectId: request.source.projectId ?? null,
			contextHash: null,
			requestHash: null
		});
	} else {
		const sourceRuns = await loadRuns(client, userId, request.source.turnRunIds);
		if (sourceRuns.length !== request.source.turnRunIds.length)
			throw new AnswerComparisonStoreError(404, 'A selected pilot run was not found.');
		const first = sourceRuns[0]!;
		if (!first.question)
			throw new AnswerComparisonValidationError('The selected run has no recorded question.');
		packet = buildSourcePacket({
			question: first.question,
			projectId: first.run.project_id ?? null,
			contextHash: first.run.context_hash ?? null,
			requestHash: first.run.request_hash ?? null
		});
		for (const loaded of sourceRuns) {
			if ((loaded.run.context_hash ?? null) !== packet.contextHash)
				invalid('Every pilot run must answer from the same accepted context.');
			if (loaded.question !== packet.question)
				invalid('Every pilot run must answer the same question.');
		}
		const selected = new Set(request.source.turnRunIds);
		for (const candidate of request.candidates)
			if (candidate.kind === 'workflow_run' && !selected.has(candidate.turnRunId))
				invalid('Every pilot-run candidate must come from the selected source runs.');
	}
	const { payloads } = await resolveCandidates(client, userId, request.candidates, packet);
	const result = outcome(
		checked(
			await client.rpc('create_answer_comparison_v1', {
				p_user_id: userId,
				p_id: request.id,
				p_title: request.title,
				p_set_kind: request.setKind,
				p_source_packet: packet,
				p_source_packet_sha256: await hashCanonical(packet),
				p_rubric: buildRubric(request.requiredFacts),
				p_candidates: payloads
			})
		),
		['created', 'exists']
	);
	return getAnswerComparison(client, userId, String(result.id));
}

export async function addAnswerComparisonCandidate(
	client: AnswerComparisonClient,
	userId: string,
	request: AddCandidateRequest
): Promise<ComparisonDetail> {
	const { comparison, candidates } = await loadComparison(client, userId, request.comparisonId);
	if (candidates.length >= ANSWER_COMPARISON_LIMITS.candidatesPerComparison)
		throw new AnswerComparisonStoreError(409, 'This comparison is full.');
	const packet = comparison.source_packet as ComparisonSourcePacket;
	if (request.candidate.kind === 'workflow_run' && packet.contextHash === null)
		invalid('A manual question cannot take pilot runs as candidates.');
	const { payloads } = await resolveCandidates(client, userId, [request.candidate], packet);
	outcome(
		checked(
			await client.rpc('add_answer_comparison_candidate_v1', {
				p_user_id: userId,
				p_comparison_id: request.comparisonId,
				p_candidate: payloads[0]
			})
		),
		['added']
	);
	return getAnswerComparison(client, userId, request.comparisonId);
}

export async function recordAnswerComparisonVote(
	client: AnswerComparisonClient,
	userId: string,
	request: VoteRequest
): Promise<ComparisonDetail> {
	const { candidates, vote } = await loadComparison(client, userId, request.comparisonId);
	if (candidates.length < 2)
		throw new AnswerComparisonStoreError(409, 'Add a second candidate before voting.');
	if (vote?.revealedAt)
		throw new AnswerComparisonStoreError(409, 'This vote is sealed and cannot change.');
	const assignment = await labelsFor(request.comparisonId, userId, candidates, vote);
	const preferred = request.preferredLabel ? (assignment[request.preferredLabel] ?? null) : null;
	if (request.choice === 'candidate' && !preferred) invalid('Pick the preferred answer.');
	const rubricScores: Record<string, RubricScore> = {};
	for (const [label, score] of Object.entries(request.rubricScores)) {
		const candidateId = assignment[label as ComparisonLabel];
		if (!candidateId) invalid(`Answer ${label} is not part of this comparison.`);
		if (score) rubricScores[candidateId] = score;
	}
	outcome(
		checked(
			await client.rpc('record_answer_comparison_vote_v1', {
				p_user_id: userId,
				p_comparison_id: request.comparisonId,
				p_label_assignment: assignment,
				p_choice: request.choice,
				p_preferred_candidate_id: preferred,
				p_reason: request.reason,
				p_rubric_scores: rubricScores
			})
		),
		['voted']
	);
	return getAnswerComparison(client, userId, request.comparisonId);
}

export async function revealAnswerComparison(
	client: AnswerComparisonClient,
	userId: string,
	comparisonId: string
): Promise<ComparisonDetail> {
	outcome(
		checked(
			await client.rpc('reveal_answer_comparison_v1', {
				p_user_id: userId,
				p_comparison_id: comparisonId
			})
		),
		['revealed']
	);
	return getAnswerComparison(client, userId, comparisonId);
}

export { unknownReceipts };
