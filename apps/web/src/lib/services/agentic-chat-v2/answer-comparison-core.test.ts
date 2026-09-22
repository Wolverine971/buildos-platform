// apps/web/src/lib/services/agentic-chat-v2/answer-comparison-core.test.ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	ANSWER_COMPARISON_IDENTITY_VERSION,
	ANSWER_COMPARISON_RECEIPTS_VERSION,
	type CandidateIdentity,
	type CandidateReceipts,
	type ComparisonSourceRun
} from '$lib/types/answer-comparison';
import {
	AnswerComparisonValidationError,
	assignBlindLabels,
	buildScoreboard,
	buildSourcePacket,
	detectDisclosureRisk,
	groupSourceRuns,
	hashCanonical,
	parseAnswerComparisonRequest,
	sha256Hex,
	summarizeWorkflowReceipts,
	toBlindViews,
	workflowRunIdentity,
	type ScoreboardInput
} from './answer-comparison-core';

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const uuid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const receipts = (over: Partial<CandidateReceipts> = {}): CandidateReceipts => ({
	version: ANSWER_COMPARISON_RECEIPTS_VERSION,
	costMicroUsd: null,
	latencyMs: null,
	modelCalls: null,
	models: [],
	settled: null,
	...over
});
const manual = (name: string): CandidateIdentity => ({
	version: ANSWER_COMPARISON_IDENTITY_VERSION,
	kind: 'manual',
	name,
	note: null
});

describe('packet and answer hashing', () => {
	it('hashes the packet the way the database check does: sorted keys, compact JSON, sha256', async () => {
		const packet = buildSourcePacket({
			question: 'Which blocker matters most?',
			projectId: uuid(9),
			contextHash: 'c'.repeat(64),
			requestHash: null
		});
		const canonical = `{"contextHash":"${'c'.repeat(64)}","projectId":"${uuid(9)}","question":"Which blocker matters most?","requestHash":null,"version":"answer_comparison_source_packet_v1"}`;
		expect(await hashCanonical(packet)).toBe(sha(canonical));
		expect(await sha256Hex('answer text')).toBe(sha('answer text'));
	});
});

describe('blind labels', () => {
	it('are deterministic for one reviewer and differ across reviewers', async () => {
		const ids = [uuid(1), uuid(2), uuid(3)];
		const first = await assignBlindLabels(uuid(10), uuid(20), ids);
		const again = await assignBlindLabels(uuid(10), uuid(20), ids);
		expect(again).toEqual(first);
		expect(Object.keys(first)).toEqual(['A', 'B', 'C']);
		expect(new Set(Object.values(first))).toEqual(new Set(ids));
		const perReviewer = await Promise.all(
			Array.from({ length: 12 }, (_, i) => assignBlindLabels(uuid(10), uuid(100 + i), ids))
		);
		expect(new Set(perReviewer.map((a) => a.A)).size).toBeGreaterThan(1);
		// Position in the stored list never leaks: the same ids in another order label identically.
		expect(await assignBlindLabels(uuid(10), uuid(20), [...ids].reverse())).toEqual(first);
	});
	it('hides identity and receipts until reveal and flags self-naming answers after it', () => {
		const candidates = [
			{
				id: uuid(1),
				identity: manual('Launch reviewer'),
				answer: 'As the Launch reviewer, I think the permit is the blocker.',
				answerSha256: 'x',
				receipts: receipts({ costMicroUsd: 1200 })
			},
			{
				id: uuid(2),
				identity: manual('Baseline'),
				answer: 'The permit.',
				answerSha256: 'y',
				receipts: receipts()
			}
		];
		const assignment = { A: uuid(2), B: uuid(1) } as any;
		const blind = toBlindViews(candidates, assignment, false);
		expect(blind.map((c) => c.label)).toEqual(['A', 'B']);
		expect(blind.map((c) => c.id)).toEqual([uuid(2), uuid(1)]);
		expect(
			blind.every((c) => c.identity === null && c.receipts === null && !c.disclosureRisk)
		).toBe(true);
		const revealed = toBlindViews(candidates, assignment, true);
		expect(revealed[1]!.identity?.name).toBe('Launch reviewer');
		expect(revealed[1]!.receipts?.costMicroUsd).toBe(1200);
		expect(revealed[1]!.disclosureRisk).toBe(true);
		expect(revealed[0]!.disclosureRisk).toBe(false);
	});
	it('ignores short names when checking disclosure', () => {
		expect(detectDisclosureRisk(manual('Jev'), 'Jev says the permit is missing.')).toBe(false);
		expect(
			detectDisclosureRisk(manual('Project review v2'), 'From project   review V2: permit.')
		).toBe(true);
	});
});

describe('receipts from the dispatch ledger', () => {
	const run = {
		first_execution_started_at: '2026-09-21T20:49:40.000Z',
		created_at: '2026-09-21T20:49:30.000Z',
		finished_at: '2026-09-21T20:50:02.500Z'
	};
	it('sums settled actuals and reports latency from execution start', () => {
		const r = summarizeWorkflowReceipts(run, [
			{ state: 'settled', model_requested: 'm/a', actual_micro_usd: 1500 },
			{ state: 'settled', model_requested: 'm/b', actual_micro_usd: '2500' },
			{ state: 'settled', model_requested: 'm/a', actual_micro_usd: 100 }
		]);
		expect(r).toEqual(
			receipts({
				costMicroUsd: 4100,
				latencyMs: 22500,
				modelCalls: 3,
				models: ['m/a', 'm/b'],
				settled: true
			})
		);
	});
	it('marks the cost a floor when a dispatch has no actual, and unknown when none do', () => {
		expect(
			summarizeWorkflowReceipts(run, [
				{ state: 'settled', model_requested: 'm/a', actual_micro_usd: 1500 },
				{ state: 'uncertain', model_requested: 'm/a', actual_micro_usd: null }
			])
		).toMatchObject({ costMicroUsd: 1500, settled: false, modelCalls: 2 });
		expect(
			summarizeWorkflowReceipts(run, [
				{ state: 'reserved', model_requested: 'm/a', actual_micro_usd: null }
			])
		).toMatchObject({ costMicroUsd: null, settled: false, modelCalls: 1 });
	});
	it('keeps everything unknown when the ledger is unavailable, never zero', () => {
		expect(summarizeWorkflowReceipts(run, null)).toEqual(receipts({ latencyMs: 22500 }));
		expect(summarizeWorkflowReceipts({ created_at: 'not a date' }, [])).toEqual(
			receipts({ modelCalls: 0 })
		);
	});
});

describe('run identity', () => {
	const run = {
		turn_run_id: uuid(1),
		policy_ref: 'internal-project-review:v2',
		plan_version: 'agentic_chat_project_review_plan_v1',
		context_hash: 'c'.repeat(64)
	};
	it('names the analyst specialist when a snapshot recorded one', () => {
		const identity = workflowRunIdentity(run, {
			snapshot: {
				slots: {
					project_analyst: {
						definition: { id: 'launch', label: 'Launch reviewer', version: 3 }
					}
				}
			},
			snapshot_hash: 's'.repeat(64)
		});
		expect(identity).toMatchObject({
			kind: 'workflow_run',
			name: 'Launch reviewer v3',
			contextHash: 'c'.repeat(64),
			specialist: {
				id: 'launch',
				label: 'Launch reviewer',
				version: 3,
				snapshotHash: 's'.repeat(64)
			}
		});
	});
	it('falls back to a readable policy name', () => {
		expect(workflowRunIdentity(run, null).name).toBe('Project review v2');
		expect(workflowRunIdentity({ turn_run_id: uuid(1) }, null).name).toBe('Workflow run');
	});
});

describe('source grouping', () => {
	const sourceRun = (over: Partial<ComparisonSourceRun>): ComparisonSourceRun => ({
		turnRunId: uuid(1),
		name: 'Project review v2',
		question: 'Q?',
		projectId: uuid(9),
		contextHash: 'c'.repeat(64),
		requestHash: 'r'.repeat(64),
		terminalOutcome: 'completed',
		finishedAt: '2026-09-21T20:50:02.500Z',
		answerPreview: 'The permit.',
		answerChars: 11,
		receipts: receipts(),
		...over
	});
	it('groups runs by accepted context and request, largest groups first, newest run first', () => {
		const groups = groupSourceRuns([
			sourceRun({ turnRunId: uuid(1), finishedAt: '2026-09-21T20:00:00Z' }),
			sourceRun({ turnRunId: uuid(2), finishedAt: '2026-09-21T21:00:00Z' }),
			sourceRun({
				turnRunId: uuid(3),
				contextHash: 'd'.repeat(64),
				finishedAt: '2026-09-21T22:00:00Z'
			})
		]);
		expect(groups.map((g) => g.runs.map((r) => r.turnRunId))).toEqual([
			[uuid(2), uuid(1)],
			[uuid(3)]
		]);
	});
});

describe('request parsing', () => {
	const create = {
		action: 'create',
		id: uuid(50),
		title: 'Permit blocker',
		setKind: 'held_out',
		requiredFacts: ['Names the missing permit', ''],
		source: { kind: 'workflow_runs', turnRunIds: [uuid(1), uuid(2), uuid(1)] },
		candidates: [
			{ kind: 'workflow_run', turnRunId: uuid(1) },
			{
				kind: 'manual',
				name: 'Baseline',
				answer: 'The permit.\r\n',
				receipts: { costMicroUsd: 12.4 }
			}
		]
	};
	it('normalizes a create request and dedupes source runs', () => {
		const parsed = parseAnswerComparisonRequest(create);
		expect(parsed).toEqual({
			action: 'create',
			id: uuid(50),
			title: 'Permit blocker',
			setKind: 'held_out',
			requiredFacts: ['Names the missing permit'],
			source: { kind: 'workflow_runs', turnRunIds: [uuid(1), uuid(2)] },
			candidates: [
				{ kind: 'workflow_run', turnRunId: uuid(1) },
				{
					kind: 'manual',
					name: 'Baseline',
					answer: 'The permit.',
					note: null,
					receipts: { costMicroUsd: 12, latencyMs: null, modelCalls: null, models: [] }
				}
			]
		});
	});
	it.each([
		[
			'one candidate',
			{ ...create, candidates: create.candidates.slice(0, 1) },
			/two candidates/
		],
		[
			'manual source with runs',
			{ ...create, source: { kind: 'manual', question: 'Q?' } },
			/cannot take pilot runs/
		],
		['bad set kind', { ...create, setKind: 'secret' }, /Set kind/],
		['bad id', { ...create, id: 'nope' }, /UUID/],
		['unknown action', { action: 'judge' }, /Unsupported/],
		[
			'vote without preference',
			{
				action: 'vote',
				comparisonId: uuid(1),
				choice: 'candidate',
				reason: 'x',
				rubricScores: {}
			},
			/preferred/
		],
		[
			'tie with preference',
			{
				action: 'vote',
				comparisonId: uuid(1),
				choice: 'tie',
				preferredLabel: 'A',
				reason: 'x',
				rubricScores: {}
			},
			/no preferred/
		],
		[
			'bad rubric',
			{
				action: 'vote',
				comparisonId: uuid(1),
				choice: 'neither',
				reason: 'x',
				rubricScores: {
					A: { requiredFacts: 3, unsupportedClaims: 0, abstention: 'appropriate' }
				}
			},
			/Required facts must be/
		],
		[
			'unknown label',
			{
				action: 'vote',
				comparisonId: uuid(1),
				choice: 'neither',
				reason: 'x',
				rubricScores: {
					Z: { requiredFacts: 1, unsupportedClaims: 0, abstention: 'appropriate' }
				}
			},
			/Unknown answer label/
		]
	])('rejects %s', (_name, body, message) => {
		expect(() => parseAnswerComparisonRequest(body)).toThrow(AnswerComparisonValidationError);
		expect(() => parseAnswerComparisonRequest(body)).toThrow(message);
	});
	it('parses a vote with per-label rubric scores', () => {
		expect(
			parseAnswerComparisonRequest({
				action: 'vote',
				comparisonId: uuid(1),
				choice: 'candidate',
				preferredLabel: 'B',
				reason: '  B names the permit.  ',
				rubricScores: {
					B: { requiredFacts: 2, unsupportedClaims: 0, abstention: 'not_applicable' }
				}
			})
		).toEqual({
			action: 'vote',
			comparisonId: uuid(1),
			choice: 'candidate',
			preferredLabel: 'B',
			reason: 'B names the permit.',
			rubricScores: {
				B: { requiredFacts: 2, unsupportedClaims: 0, abstention: 'not_applicable' }
			}
		});
	});
});

describe('scoreboard', () => {
	const launch = {
		id: uuid(1),
		identity: manual('Launch reviewer v1'),
		receipts: receipts({ costMicroUsd: 2000, latencyMs: 10000 })
	};
	const base = {
		id: uuid(2),
		identity: manual('Baseline'),
		receipts: receipts({ costMicroUsd: 500, latencyMs: null })
	};
	const score = (requiredFacts: 0 | 1 | 2, unsupportedClaims: 0 | 1 | 2) => ({
		requiredFacts,
		unsupportedClaims,
		abstention: 'not_applicable' as const
	});
	const comparisons: ScoreboardInput[] = [
		{
			setKind: 'exploratory',
			candidates: [launch, base],
			vote: {
				choice: 'candidate',
				preferredCandidateId: uuid(1),
				rubricScores: { [uuid(1)]: score(2, 0), [uuid(2)]: score(1, 1) },
				revealedAt: '2026-09-21T21:00:00Z'
			}
		},
		{
			setKind: 'exploratory',
			candidates: [launch, base],
			vote: {
				choice: 'tie',
				preferredCandidateId: null,
				rubricScores: {},
				revealedAt: '2026-09-21T21:00:00Z'
			}
		},
		{
			setKind: 'exploratory',
			candidates: [launch, base],
			vote: {
				choice: 'candidate',
				preferredCandidateId: uuid(2),
				rubricScores: {},
				revealedAt: null
			}
		},
		{
			setKind: 'held_out',
			candidates: [launch, base],
			vote: {
				choice: 'neither',
				preferredCandidateId: null,
				rubricScores: {},
				revealedAt: '2026-09-21T21:00:00Z'
			}
		}
	];
	it('counts sealed exploratory votes only, by default', () => {
		const board = buildScoreboard(comparisons, false);
		expect(board).toMatchObject({ includesHeldOut: false, sealedVotes: 2, heldOutExcluded: 1 });
		expect(board.rows).toEqual([
			expect.objectContaining({
				name: 'Launch reviewer v1',
				comparisons: 2,
				wins: 1,
				losses: 0,
				ties: 1,
				neither: 0,
				requiredFactsMean: 2,
				unsupportedClaimsMean: 0,
				costMicroUsdMean: 2000,
				latencyMsMean: 10000
			}),
			expect.objectContaining({
				name: 'Baseline',
				wins: 0,
				losses: 1,
				ties: 1,
				requiredFactsMean: 1,
				unsupportedClaimsMean: 1,
				costMicroUsdMean: 500,
				latencyMsMean: null
			})
		]);
	});
	it('includes the held-out set only when asked', () => {
		const board = buildScoreboard(comparisons, true);
		expect(board).toMatchObject({ includesHeldOut: true, sealedVotes: 3, heldOutExcluded: 0 });
		expect(board.rows[0]).toMatchObject({
			name: 'Launch reviewer v1',
			comparisons: 3,
			neither: 1
		});
	});
});
