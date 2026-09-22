// apps/web/src/lib/services/agentic-chat-v2/specialist-recommendations.server.test.ts
// Decision policy and replay behavior against an in-memory ledger. No paid calls; the
// real SQL boundary is covered by apps/worker/tests/publishedSpecialistExecution.postgres.test.ts.
import { describe, expect, it, vi } from 'vitest';
import { hashSpecialistWorkbenchValue } from '@buildos/agentic-chat-runtime/specialists';
import type { JevDecider } from '@buildos/smart-llm';
import {
	recommendPublishedSpecialist,
	SpecialistRecommendationError
} from './specialist-recommendations.server';
import type { SpecialistWorkbenchClient } from './specialist-workbench.server';

const USER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const QUESTION = 'What do the saved sources say about the launch?';

function candidate(index: number, overrides: Record<string, unknown> = {}) {
	return {
		draftId: `33333333-3333-4333-8333-00000000000${index}`,
		version: 1,
		draftRevision: 1,
		snapshotHash: String(index).repeat(64).slice(0, 64),
		name: `Specialist ${index}`,
		createdAt: '2026-09-22T00:00:00+00:00',
		description: `Handles question type ${index}.`,
		expertise: ['research synthesis'],
		documentReadEnabled: true,
		...overrides
	};
}

type Row = { input: any; inputHash: string; token: string; result?: any; resultHash?: string };

/** Mirrors the begin/finish RPC contract closely enough to exercise the web service. */
function ledger(candidates: unknown[], options: { finishError?: boolean } = {}) {
	const rows = new Map<string, Row>();
	const receipt = (id: string, row: Row) => ({
		id,
		input: row.input,
		inputHash: row.inputHash,
		...(row.result ? { result: row.result, resultHash: row.resultHash } : {})
	});
	const client = {
		from() {
			throw new Error('unexpected table read');
		},
		async rpc(name: string, args: Record<string, any>) {
			if (name === 'begin_specialist_recommendation_v1') {
				const existing = rows.get(args.p_id);
				if (existing) {
					if (existing.input.question !== args.p_question)
						return { data: { outcome: 'idempotency_conflict' }, error: null };
					return {
						data: existing.result
							? { outcome: 'recorded', receipt: receipt(args.p_id, existing) }
							: { outcome: 'pending' },
						error: null
					};
				}
				const input = {
					version: 'specialist_recommendation_input_v1',
					policy: 'jev_specialist_choice_v1',
					projectId: args.p_project_id,
					question: args.p_question,
					candidates
				};
				const row = {
					input,
					inputHash: await hashSpecialistWorkbenchValue(input),
					token: '44444444-4444-4444-8444-444444444444'
				};
				rows.set(args.p_id, row);
				return {
					data: {
						outcome: 'claimed',
						receipt: receipt(args.p_id, row),
						attemptToken: row.token
					},
					error: null
				};
			}
			if (name === 'finish_specialist_recommendation_v1') {
				if (options.finishError) return { data: null, error: { message: 'offline' } };
				const row = rows.get(args.p_id)!;
				if (row.token !== args.p_attempt_token || row.inputHash !== args.p_input_hash)
					return { data: { outcome: 'not_found' }, error: null };
				row.result = structuredClone(args.p_result);
				row.resultHash = args.p_result_hash;
				return {
					data: { outcome: 'recorded', receipt: receipt(args.p_id, row) },
					error: null
				};
			}
			throw new Error(`unexpected rpc ${name}`);
		}
	};
	return { client: client as unknown as SpecialistWorkbenchClient, rows };
}

function jev(probabilities: Record<string, number>, overrides: Record<string, unknown> = {}) {
	const choice = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]![0];
	const decide = vi.fn(async () => ({
		ok: true,
		answers: {
			specialist: { type: 'choice', choice, probabilities, confidence: probabilities[choice] }
		},
		rawResponse: {},
		receipt: {
			modelRequested: 'typesafe/jev-1.13',
			modelUsed: 'typesafe/jev-1.13',
			requestId: 'gen-test',
			inputTokens: 400,
			outputTokens: 20,
			costUsd: 0.000057372,
			durationMs: 812.4,
			requestBytes: 1500,
			questionCount: 1,
			attempts: 1,
			...overrides
		}
	}));
	return { decide, decider: { decide } as unknown as JevDecider };
}

function request(client: SpecialistWorkbenchClient, decider: JevDecider, requestId?: string) {
	return {
		client,
		decider,
		userId: USER,
		projectId: PROJECT,
		requestId: requestId ?? crypto.randomUUID(),
		question: QUESTION
	};
}

describe('recommendPublishedSpecialist', () => {
	it('suggests a clear winner once and replays the saved result without another call', async () => {
		const { client } = ledger([candidate(0), candidate(1)]);
		const { decide, decider } = jev({ none: 0.05, s_0: 0.8, s_1: 0.15 });
		const input = request(client, decider);

		const first = await recommendPublishedSpecialist(input);
		expect(first).toMatchObject({
			status: 'selected',
			selected: { draftId: candidate(0).draftId, version: 1 },
			margin: 0.65,
			costUsd: 0.000057372,
			durationMs: 812
		});
		expect(first).not.toHaveProperty('provider');
		expect(first.ranking.map((r) => r.name)).toEqual(['Specialist 0', 'Specialist 1']);
		expect(await recommendPublishedSpecialist(input)).toEqual(first);
		expect(decide).toHaveBeenCalledOnce();
	});

	it('applies the thresholds to the stored rounded values', async () => {
		const below = ledger([candidate(0), candidate(1)]);
		const low = jev({ none: 0.0, s_0: 0.575, s_1: 0.425 });
		expect(
			await recommendPublishedSpecialist(request(below.client, low.decider))
		).toMatchObject({ status: 'uncertain', selected: null });
		// 0.59996 is stored as 0.6, so the saved receipt alone reproduces the suggestion.
		const floor = ledger([candidate(0), candidate(1)]);
		const atFloor = jev({ none: 0.10004, s_0: 0.59996, s_1: 0.3 });
		expect(
			await recommendPublishedSpecialist(request(floor.client, atFloor.decider))
		).toMatchObject({
			status: 'selected',
			margin: 0.3,
			ranking: [expect.objectContaining({ probability: 0.6 }), expect.anything()]
		});
	});

	it('abstains when the top two are close or when no specialist fits', async () => {
		const close = ledger([candidate(0), candidate(1)]);
		const tied = jev({ none: 0.05, s_0: 0.5, s_1: 0.45 });
		expect(
			await recommendPublishedSpecialist(request(close.client, tied.decider))
		).toMatchObject({
			status: 'uncertain',
			selected: null,
			reason: expect.stringContaining('clear enough fit')
		});
		const none = ledger([candidate(0)]);
		const noFit = jev({ none: 0.9, s_0: 0.1 });
		const result = await recommendPublishedSpecialist(request(none.client, noFit.decider));
		expect(result).toMatchObject({
			status: 'uncertain',
			selected: null,
			reason: expect.stringContaining('None of the published specialists')
		});
		expect(result.ranking).toEqual([expect.objectContaining({ name: 'Specialist 0' })]);
	});

	it('records an unavailable result without a paid call when nothing is published', async () => {
		const { client, rows } = ledger([]);
		const { decide, decider } = jev({ none: 1 });
		const input = request(client, decider);
		expect(await recommendPublishedSpecialist(input)).toMatchObject({
			status: 'unavailable',
			costUsd: null
		});
		expect(decide).not.toHaveBeenCalled();
		expect(rows.get(input.requestId)?.result?.status).toBe('unavailable');
	});

	it('records provider failures and inconsistent rankings as unavailable', async () => {
		const failing = ledger([candidate(0)]);
		const thrown = {
			decide: vi.fn(async () => {
				throw new Error('timeout');
			})
		} as unknown as JevDecider;
		expect((await recommendPublishedSpecialist(request(failing.client, thrown))).status).toBe(
			'unavailable'
		);

		const skewed = ledger([candidate(0), candidate(1)]);
		const badSum = jev({ none: 0.5, s_0: 0.5, s_1: 0.5 });
		expect(
			await recommendPublishedSpecialist(request(skewed.client, badSum.decider))
		).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('inconsistent') });
	});

	it('accepts published names that use emoji up to the workbench code-point limits', async () => {
		const name = '🔬'.repeat(80);
		const { client } = ledger([
			candidate(0, {
				name,
				description: '📚'.repeat(320),
				expertise: ['🧪'.repeat(60)]
			})
		]);
		const { decider } = jev({ none: 0.1, s_0: 0.9 });
		expect(await recommendPublishedSpecialist(request(client, decider))).toMatchObject({
			status: 'selected',
			selected: { name }
		});
	});

	it('stores tiny probabilities and costs in plain decimal form for PostgreSQL hashing', async () => {
		const { client, rows } = ledger([candidate(0), candidate(1)]);
		const { decider } = jev(
			{ none: 0.0000002, s_0: 0.9999996, s_1: 0.0000002 },
			{ costUsd: 3e-7, durationMs: 0.4 }
		);
		const input = request(client, decider);
		const result = await recommendPublishedSpecialist(input);
		expect(result).toMatchObject({ status: 'selected', costUsd: 0, durationMs: 0 });
		const stored = JSON.stringify(rows.get(input.requestId)!.result);
		expect(stored).not.toMatch(/\d[eE][+-]?\d/);
		expect(result.ranking.map((r) => r.probability)).toEqual([1, 0]);
	});

	it('returns pending for an unfinished claim and never calls Jev again for it', async () => {
		const { client } = ledger([candidate(0)], { finishError: true });
		const { decide, decider } = jev({ none: 0.1, s_0: 0.9 });
		const input = request(client, decider);
		await expect(recommendPublishedSpecialist(input)).rejects.toBeInstanceOf(
			SpecialistRecommendationError
		);
		expect(await recommendPublishedSpecialist(input)).toMatchObject({
			status: 'pending',
			selected: null
		});
		expect(decide).toHaveBeenCalledOnce();
	});

	it('rejects a reused request ID for a different question', async () => {
		const { client } = ledger([candidate(0)]);
		const { decider } = jev({ none: 0.1, s_0: 0.9 });
		const input = request(client, decider);
		await recommendPublishedSpecialist(input);
		await expect(
			recommendPublishedSpecialist({ ...input, question: 'A different question entirely' })
		).rejects.toMatchObject({ status: 409 });
	});
});
