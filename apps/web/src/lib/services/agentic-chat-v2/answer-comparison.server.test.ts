// apps/web/src/lib/services/agentic-chat-v2/answer-comparison.server.test.ts
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ANSWER_COMPARISON_IDENTITY_VERSION,
	ANSWER_COMPARISON_RECEIPTS_VERSION,
	ANSWER_COMPARISON_RUBRIC_VERSION,
	ANSWER_COMPARISON_SOURCE_PACKET_VERSION
} from '$lib/types/answer-comparison';
import {
	AnswerComparisonValidationError,
	assignBlindLabels,
	hashCanonical
} from './answer-comparison-core';
import {
	addAnswerComparisonCandidate,
	AnswerComparisonStoreError,
	createAnswerComparison,
	getAnswerComparison,
	listAnswerComparisonLab,
	recordAnswerComparisonVote,
	revealAnswerComparison,
	type AnswerComparisonClient
} from './answer-comparison.server';

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const uuid = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USER = uuid(1);
const OTHER = uuid(2);
const CTX = 'c'.repeat(64);
const C1 = uuid(100);
const C2 = uuid(101);
const K1 = uuid(110);
const K2 = uuid(111);
const K3 = uuid(112);
const K4 = uuid(113);
const R1 = uuid(200);
const R2 = uuid(201);
const R3 = uuid(202);
const R4 = uuid(203);

type Filter = ['eq' | 'in', string, unknown];
type Recorded = {
	table: string;
	columns: string;
	filters: Filter[];
	order: [string, { ascending: boolean }] | null;
	limit: number | null;
	single: boolean;
};
const packet = {
	version: ANSWER_COMPARISON_SOURCE_PACKET_VERSION,
	question: 'What is the most important blocker?',
	projectId: uuid(9),
	contextHash: CTX,
	requestHash: 'r'.repeat(64)
};
const identity = (name: string, over: Record<string, unknown> = {}) => ({
	version: ANSWER_COMPARISON_IDENTITY_VERSION,
	kind: 'manual',
	name,
	note: null,
	...over
});
const receipts = (over: Record<string, unknown> = {}) => ({
	version: ANSWER_COMPARISON_RECEIPTS_VERSION,
	costMicroUsd: null,
	latencyMs: null,
	modelCalls: null,
	models: [],
	settled: null,
	...over
});

function fixtures() {
	return {
		agentic_chat_answer_comparisons: [
			{
				id: C1,
				user_id: USER,
				title: 'Permit blocker',
				question: packet.question,
				set_kind: 'exploratory',
				source_packet: packet,
				source_packet_sha256: 'p'.repeat(64),
				rubric: {
					version: ANSWER_COMPARISON_RUBRIC_VERSION,
					requiredFacts: ['Names the permit']
				},
				created_at: '2026-09-21T21:00:00Z'
			},
			{
				id: C2,
				user_id: USER,
				title: 'Held-out: schedule',
				question: 'Which task slips first?',
				set_kind: 'held_out',
				source_packet: {
					...packet,
					question: 'Which task slips first?',
					contextHash: null,
					requestHash: null
				},
				source_packet_sha256: 'q'.repeat(64),
				rubric: { version: ANSWER_COMPARISON_RUBRIC_VERSION, requiredFacts: [] },
				created_at: '2026-09-21T20:00:00Z'
			},
			{
				id: uuid(102),
				user_id: OTHER,
				title: 'Someone else',
				question: 'x',
				set_kind: 'exploratory',
				source_packet: packet,
				source_packet_sha256: 'z'.repeat(64),
				rubric: { version: ANSWER_COMPARISON_RUBRIC_VERSION, requiredFacts: [] },
				created_at: '2026-09-21T22:00:00Z'
			}
		],
		agentic_chat_answer_comparison_candidates: [
			{
				id: K1,
				comparison_id: C1,
				user_id: USER,
				position: 1,
				identity: identity('Launch reviewer v1', {
					kind: 'workflow_run',
					turnRunId: R1,
					contextHash: CTX,
					specialist: {
						id: 'launch',
						label: 'Launch reviewer',
						version: 1,
						snapshotHash: null
					}
				}),
				answer: 'As the Launch reviewer: the permit.',
				answer_sha256: sha('As the Launch reviewer: the permit.'),
				receipts: receipts({
					costMicroUsd: 4100,
					latencyMs: 22500,
					modelCalls: 3,
					settled: true
				})
			},
			{
				id: K2,
				comparison_id: C1,
				user_id: USER,
				position: 2,
				identity: identity('Baseline'),
				answer: 'The permit.',
				answer_sha256: sha('The permit.'),
				receipts: receipts()
			},
			{
				id: K3,
				comparison_id: C2,
				user_id: USER,
				position: 1,
				identity: identity('Launch reviewer v1'),
				answer: 'a',
				answer_sha256: sha('a'),
				receipts: receipts()
			},
			{
				id: K4,
				comparison_id: C2,
				user_id: USER,
				position: 2,
				identity: identity('Baseline'),
				answer: 'b',
				answer_sha256: sha('b'),
				receipts: receipts()
			}
		],
		agentic_chat_answer_comparison_votes: [] as Record<string, unknown>[],
		chat_turn_workflow_runs: [
			{
				turn_run_id: R1,
				user_id: USER,
				session_id: uuid(300),
				project_id: uuid(9),
				policy_ref: 'internal-project-review:v2',
				plan_version: 'agentic_chat_project_review_plan_v1',
				terminal_outcome: 'completed',
				context_hash: CTX,
				request_hash: 'r'.repeat(64),
				answer_text: 'Answer from run one.\r\n',
				answer_text_sha256: 'h1',
				first_execution_started_at: '2026-09-21T20:49:40.000Z',
				created_at: '2026-09-21T20:49:30.000Z',
				finished_at: '2026-09-21T20:50:02.500Z'
			},
			{
				turn_run_id: R2,
				user_id: USER,
				session_id: uuid(301),
				project_id: uuid(9),
				policy_ref: 'internal-project-review:v3',
				plan_version: 'agentic_chat_document_evidence_plan_v1',
				terminal_outcome: 'completed',
				context_hash: CTX,
				request_hash: 'r'.repeat(64),
				answer_text: 'Answer from run two.',
				answer_text_sha256: 'h2',
				first_execution_started_at: '2026-09-21T20:55:00.000Z',
				created_at: '2026-09-21T20:54:00.000Z',
				finished_at: '2026-09-21T20:55:10.000Z'
			},
			{
				turn_run_id: R3,
				user_id: USER,
				session_id: uuid(302),
				project_id: uuid(9),
				policy_ref: 'internal-project-review:v2',
				plan_version: null,
				terminal_outcome: 'completed',
				context_hash: 'd'.repeat(64),
				request_hash: 's'.repeat(64),
				answer_text: 'Different context answer.',
				answer_text_sha256: 'h3',
				first_execution_started_at: null,
				created_at: '2026-09-21T19:00:00.000Z',
				finished_at: '2026-09-21T19:00:30.000Z'
			},
			{
				turn_run_id: R4,
				user_id: OTHER,
				session_id: uuid(303),
				project_id: uuid(9),
				policy_ref: 'internal-project-review:v2',
				plan_version: null,
				terminal_outcome: 'completed',
				context_hash: CTX,
				request_hash: 'r'.repeat(64),
				answer_text: 'Not yours.',
				answer_text_sha256: 'h4',
				first_execution_started_at: null,
				created_at: '2026-09-21T19:00:00.000Z',
				finished_at: null
			},
			{
				turn_run_id: uuid(204),
				user_id: USER,
				answer_text: '',
				context_hash: CTX,
				created_at: '2026-09-21T23:00:00Z'
			}
		],
		chat_turn_runs: [
			{ id: R1, user_id: USER, user_message_id: uuid(400) },
			{ id: R2, user_id: USER, user_message_id: uuid(401) },
			{ id: R3, user_id: USER, user_message_id: uuid(402) },
			{ id: R4, user_id: OTHER, user_message_id: uuid(403) }
		],
		chat_messages: [
			{ id: uuid(400), user_id: USER, role: 'user', content: packet.question },
			{ id: uuid(401), user_id: USER, role: 'user', content: `  ${packet.question}\n` },
			{ id: uuid(402), user_id: USER, role: 'user', content: 'Which task slips first?' },
			{ id: uuid(403), user_id: OTHER, role: 'user', content: packet.question }
		],
		chat_turn_workflow_dispatches: [
			{
				turn_run_id: R1,
				user_id: USER,
				state: 'settled',
				model_requested: 'm/a',
				actual_micro_usd: 1500
			},
			{
				turn_run_id: R1,
				user_id: USER,
				state: 'settled',
				model_requested: 'm/b',
				actual_micro_usd: 2600
			},
			{
				turn_run_id: R2,
				user_id: USER,
				state: 'uncertain',
				model_requested: 'm/a',
				actual_micro_usd: null
			}
		],
		chat_turn_specialist_snapshots: [
			{
				turn_run_id: R1,
				user_id: USER,
				snapshot: {
					slots: {
						project_analyst: {
							definition: { id: 'launch', label: 'Launch reviewer', version: 1 }
						}
					}
				},
				snapshot_hash: 's'.repeat(64)
			}
		]
	};
}

function fakeClient(data: ReturnType<typeof fixtures>, options: { failing?: string[] } = {}) {
	const calls: Recorded[] = [];
	const rpc = vi.fn<AnswerComparisonClient['rpc']>(async () => ({
		data: { outcome: 'created', id: C1 },
		error: null
	}));
	const client: AnswerComparisonClient = {
		from(table: string) {
			const q: Recorded = {
				table,
				columns: '',
				filters: [],
				order: null,
				limit: null,
				single: false
			};
			const run = () => {
				calls.push(q);
				if (options.failing?.includes(table))
					return { data: null, error: { message: 'boom' } };
				let rows = (data as Record<string, Record<string, unknown>[]>)[table] ?? [];
				for (const [op, column, value] of q.filters)
					rows = rows.filter((r) =>
						op === 'eq' ? r[column] === value : (value as unknown[]).includes(r[column])
					);
				if (q.order) {
					const [column, { ascending }] = q.order;
					rows = [...rows].sort((a, b) =>
						String(a[column]) < String(b[column])
							? ascending
								? -1
								: 1
							: ascending
								? 1
								: -1
					);
				}
				if (q.limit !== null) rows = rows.slice(0, q.limit);
				return { data: q.single ? (rows[0] ?? null) : rows, error: null };
			};
			const builder: any = {
				select: (columns: string) => ((q.columns = columns), builder),
				eq: (column: string, value: unknown) => (
					q.filters.push(['eq', column, value]),
					builder
				),
				in: (column: string, value: unknown[]) => (
					q.filters.push(['in', column, value]),
					builder
				),
				order: (column: string, o: { ascending: boolean }) => (
					(q.order = [column, o]),
					builder
				),
				limit: (n: number) => ((q.limit = n), builder),
				maybeSingle: () => ((q.single = true), builder),
				then: (resolve: any, reject: any) =>
					Promise.resolve().then(run).then(resolve, reject)
			};
			return builder;
		},
		rpc
	};
	return { client, calls, rpc };
}

const ownerScoped = (calls: Recorded[]) =>
	calls.every((c) =>
		c.filters.some(
			([op, column, value]) =>
				op === 'eq' && ['user_id', 'reviewer_user_id'].includes(column) && value === USER
		)
	);

let data: ReturnType<typeof fixtures>;
beforeEach(() => {
	data = fixtures();
});

describe('listing the lab', () => {
	it('scopes every table read to the owner and builds summaries, sources, and the scoreboard', async () => {
		data.agentic_chat_answer_comparison_votes.push({
			comparison_id: C1,
			reviewer_user_id: USER,
			label_assignment: { A: K2, B: K1 },
			choice: 'candidate',
			preferred_candidate_id: K1,
			reason: 'B names the permit.',
			rubric_scores: {
				[K1]: { requiredFacts: 2, unsupportedClaims: 0, abstention: 'not_applicable' }
			},
			voted_at: '2026-09-21T21:05:00Z',
			revealed_at: '2026-09-21T21:06:00Z'
		});
		const { client, calls } = fakeClient(data);
		const lab = await listAnswerComparisonLab(client, USER);
		expect(ownerScoped(calls)).toBe(true);
		expect(lab.comparisons.map((c) => [c.id, c.candidateCount, c.vote])).toEqual([
			[C1, 2, { choice: 'candidate', revealed: true }],
			[C2, 2, null]
		]);
		expect(lab.scoreboard).toMatchObject({ sealedVotes: 1, heldOutExcluded: 0 });
		expect(lab.scoreboard.rows[0]).toMatchObject({
			name: 'Launch reviewer v1',
			wins: 1,
			requiredFactsMean: 2,
			costMicroUsdMean: 4100
		});
		// Sources: R1 and R2 share the question and context; R3 is alone; R4 belongs to another user;
		// the run with no answer is skipped.
		expect(lab.sourcesNotice).toBeNull();
		expect(lab.sources.map((g) => g.runs.map((r) => r.turnRunId))).toEqual([[R2, R1], [R3]]);
		const [group] = lab.sources;
		expect(group!.question).toBe(packet.question);
		expect(group!.runs[1]).toMatchObject({
			name: 'Launch reviewer v1',
			answerChars: 20,
			receipts: {
				costMicroUsd: 4100,
				latencyMs: 22500,
				modelCalls: 2,
				models: ['m/a', 'm/b'],
				settled: true
			}
		});
		expect(group!.runs[0]).toMatchObject({
			name: 'Project review v3',
			receipts: { costMicroUsd: null, settled: false, modelCalls: 1 }
		});
	});
	it('still lists comparisons when pilot runs cannot be read, with a notice and no fake receipts', async () => {
		const { client } = fakeClient(data, { failing: ['chat_turn_workflow_runs'] });
		const lab = await listAnswerComparisonLab(client, USER);
		expect(lab.comparisons).toHaveLength(2);
		expect(lab.sources).toEqual([]);
		expect(lab.sourcesNotice).toMatch(/could not be listed/);
	});
	it('treats an unavailable dispatch ledger as unknown cost, not zero', async () => {
		const { client } = fakeClient(data, { failing: ['chat_turn_workflow_dispatches'] });
		const lab = await listAnswerComparisonLab(client, USER);
		expect(lab.sources[0]!.runs[1]!.receipts).toMatchObject({
			costMicroUsd: null,
			modelCalls: null,
			latencyMs: 22500
		});
	});
});

describe('reading one comparison', () => {
	it('hides identities and receipts until the reviewer has revealed', async () => {
		const { client, calls } = fakeClient(data);
		const detail = await getAnswerComparison(client, USER, C1);
		expect(ownerScoped(calls)).toBe(true);
		expect(detail.revealed).toBe(false);
		expect(detail.vote).toBeNull();
		expect(detail.candidates.map((c) => c.label)).toEqual(['A', 'B']);
		expect(detail.candidates.every((c) => c.identity === null && c.receipts === null)).toBe(
			true
		);
		expect(detail.candidates.map((c) => c.id).sort()).toEqual([K1, K2].sort());
		const expected = await assignBlindLabels(C1, USER, [K1, K2]);
		expect(detail.candidates.map((c) => [c.label, c.id])).toEqual(Object.entries(expected));
	});
	it('uses the labels the reviewer voted with and discloses after reveal', async () => {
		data.agentic_chat_answer_comparison_votes.push({
			comparison_id: C1,
			reviewer_user_id: USER,
			label_assignment: { A: K2, B: K1 },
			choice: 'candidate',
			preferred_candidate_id: K1,
			reason: 'B names the permit.',
			rubric_scores: {
				[K1]: { requiredFacts: 2, unsupportedClaims: 0, abstention: 'not_applicable' }
			},
			voted_at: '2026-09-21T21:05:00Z',
			revealed_at: '2026-09-21T21:06:00Z'
		});
		const detail = await getAnswerComparison(fakeClient(data).client, USER, C1);
		expect(detail.revealed).toBe(true);
		expect(detail.candidates.map((c) => [c.label, c.identity?.name, c.disclosureRisk])).toEqual(
			[
				['A', 'Baseline', false],
				['B', 'Launch reviewer v1', true]
			]
		);
		expect(detail.candidates[1]!.receipts?.costMicroUsd).toBe(4100);
		expect(detail.vote).toEqual({
			choice: 'candidate',
			preferredLabel: 'B',
			reason: 'B names the permit.',
			rubricScores: {
				B: { requiredFacts: 2, unsupportedClaims: 0, abstention: 'not_applicable' }
			},
			votedAt: '2026-09-21T21:05:00Z',
			revealedAt: '2026-09-21T21:06:00Z'
		});
	});
	it('is not found for another owner', async () => {
		await expect(getAnswerComparison(fakeClient(data).client, OTHER, C1)).rejects.toMatchObject(
			{ status: 404 }
		);
	});
});

describe('creating a comparison from pilot runs', () => {
	const request = {
		action: 'create' as const,
		id: C1,
		title: 'Permit blocker',
		setKind: 'exploratory' as const,
		requiredFacts: ['Names the permit'],
		source: { kind: 'workflow_runs' as const, turnRunIds: [R1, R2] },
		candidates: [
			{ kind: 'workflow_run' as const, turnRunId: R1 },
			{ kind: 'workflow_run' as const, turnRunId: R2 },
			{
				kind: 'manual' as const,
				name: 'Baseline',
				answer: 'The permit.',
				note: null,
				receipts: { costMicroUsd: null, latencyMs: 900, modelCalls: 1, models: ['m/x'] }
			}
		]
	};
	it('freezes the question and context into a hashed packet and binds every candidate to it', async () => {
		const { client, rpc } = fakeClient(data);
		await createAnswerComparison(client, USER, request);
		expect(rpc).toHaveBeenCalledTimes(1);
		const args = rpc.mock.calls[0]![1] as Record<string, any>;
		expect(args.p_user_id).toBe(USER);
		expect(args.p_id).toBe(C1);
		expect(args.p_set_kind).toBe('exploratory');
		expect(args.p_source_packet).toEqual(packet);
		expect(args.p_source_packet_sha256).toBe(await hashCanonical(packet));
		expect(args.p_rubric).toEqual({
			version: ANSWER_COMPARISON_RUBRIC_VERSION,
			requiredFacts: ['Names the permit']
		});
		expect(args.p_candidates).toHaveLength(3);
		const [one, two, manual] = args.p_candidates;
		expect(one.identity).toMatchObject({
			kind: 'workflow_run',
			turnRunId: R1,
			name: 'Launch reviewer v1',
			contextHash: CTX
		});
		expect(one.answer).toBe('Answer from run one.');
		expect(one.answerSha256).toBe(sha('Answer from run one.'));
		expect(one.receipts).toMatchObject({ costMicroUsd: 4100, modelCalls: 2, settled: true });
		expect(two.identity).toMatchObject({
			kind: 'workflow_run',
			turnRunId: R2,
			name: 'Project review v3'
		});
		expect(two.receipts).toMatchObject({ costMicroUsd: null, settled: false });
		expect(manual.identity).toEqual(identity('Baseline'));
		expect(manual.answerSha256).toBe(sha('The permit.'));
		expect(manual.receipts).toEqual(
			receipts({ latencyMs: 900, modelCalls: 1, models: ['m/x'] })
		);
	});
	it('refuses a run that answered from a different accepted context', async () => {
		const { client, rpc } = fakeClient(data);
		await expect(
			createAnswerComparison(client, USER, {
				...request,
				source: { kind: 'workflow_runs', turnRunIds: [R1, R3] },
				candidates: [
					{ kind: 'workflow_run', turnRunId: R1 },
					{ kind: 'workflow_run', turnRunId: R3 }
				]
			})
		).rejects.toThrow(AnswerComparisonValidationError);
		expect(rpc).not.toHaveBeenCalled();
	});
	it("never sees another owner's runs", async () => {
		const { client, rpc } = fakeClient(data);
		await expect(
			createAnswerComparison(client, USER, {
				...request,
				source: { kind: 'workflow_runs', turnRunIds: [R1, R4] },
				candidates: [
					{ kind: 'workflow_run', turnRunId: R1 },
					{ kind: 'workflow_run', turnRunId: R4 }
				]
			})
		).rejects.toMatchObject({ status: 404 });
		expect(rpc).not.toHaveBeenCalled();
	});
	it('maps storage outcomes to statuses', async () => {
		const { client, rpc } = fakeClient(data);
		rpc.mockResolvedValueOnce({ data: { outcome: 'limit_reached' }, error: null });
		await expect(createAnswerComparison(client, USER, request)).rejects.toMatchObject({
			status: 409
		});
		rpc.mockResolvedValueOnce({ data: { outcome: 'exists', id: C1 }, error: null });
		expect((await createAnswerComparison(client, USER, request)).id).toBe(C1);
		rpc.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
		await expect(createAnswerComparison(client, USER, request)).rejects.toBeInstanceOf(
			AnswerComparisonStoreError
		);
	});
});

describe('adding a candidate later', () => {
	it('binds a pilot run to the frozen packet and rejects a context mismatch', async () => {
		const { client, rpc } = fakeClient(data);
		rpc.mockResolvedValue({ data: { outcome: 'added', id: C1 }, error: null });
		await addAnswerComparisonCandidate(client, USER, {
			action: 'add_candidate',
			comparisonId: C1,
			candidate: { kind: 'workflow_run', turnRunId: R2 }
		});
		const args = rpc.mock.calls[0]![1] as Record<string, any>;
		expect(args.p_candidate.identity).toMatchObject({ turnRunId: R2, contextHash: CTX });
		await expect(
			addAnswerComparisonCandidate(client, USER, {
				action: 'add_candidate',
				comparisonId: C1,
				candidate: { kind: 'workflow_run', turnRunId: R3 }
			})
		).rejects.toThrow(/same accepted context/);
		await expect(
			addAnswerComparisonCandidate(client, USER, {
				action: 'add_candidate',
				comparisonId: C2,
				candidate: { kind: 'workflow_run', turnRunId: R1 }
			})
		).rejects.toThrow(/manual question/);
	});
});

describe('voting and revealing', () => {
	const vote = {
		action: 'vote' as const,
		comparisonId: C1,
		choice: 'candidate' as const,
		preferredLabel: 'B' as const,
		reason: 'B names the permit.',
		rubricScores: {
			B: {
				requiredFacts: 2 as const,
				unsupportedClaims: 0 as const,
				abstention: 'not_applicable' as const
			}
		}
	};
	it('translates blind labels into candidate ids and records what the reviewer saw', async () => {
		const { client, rpc } = fakeClient(data);
		rpc.mockResolvedValue({ data: { outcome: 'voted', id: C1 }, error: null });
		await recordAnswerComparisonVote(client, USER, vote);
		const assignment = await assignBlindLabels(C1, USER, [K1, K2]);
		const args = rpc.mock.calls[0]![1] as Record<string, any>;
		expect(rpc.mock.calls[0]![0]).toBe('record_answer_comparison_vote_v1');
		expect(args).toMatchObject({
			p_user_id: USER,
			p_comparison_id: C1,
			p_label_assignment: assignment,
			p_choice: 'candidate',
			p_preferred_candidate_id: assignment.B,
			p_reason: 'B names the permit.',
			p_rubric_scores: { [assignment.B]: vote.rubricScores.B }
		});
	});
	it('refuses to change a sealed vote and requires a vote before reveal', async () => {
		data.agentic_chat_answer_comparison_votes.push({
			comparison_id: C1,
			reviewer_user_id: USER,
			label_assignment: { A: K1, B: K2 },
			choice: 'tie',
			preferred_candidate_id: null,
			reason: 'Same.',
			rubric_scores: {},
			voted_at: '2026-09-21T21:05:00Z',
			revealed_at: '2026-09-21T21:06:00Z'
		});
		const { client, rpc } = fakeClient(data);
		await expect(recordAnswerComparisonVote(client, USER, vote)).rejects.toMatchObject({
			status: 409
		});
		expect(rpc).not.toHaveBeenCalled();
		rpc.mockResolvedValueOnce({ data: { outcome: 'vote_required' }, error: null });
		await expect(revealAnswerComparison(client, USER, C2)).rejects.toMatchObject({
			status: 409
		});
		rpc.mockResolvedValueOnce({ data: { outcome: 'revealed', id: C1 }, error: null });
		expect((await revealAnswerComparison(client, USER, C1)).revealed).toBe(true);
	});
});
