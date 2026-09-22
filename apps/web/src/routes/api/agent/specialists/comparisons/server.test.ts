// apps/web/src/routes/api/agent/specialists/comparisons/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
	env: { AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS: 'ff000000-0000-4000-8000-000000000001' },
	client: { marker: 'service' },
	create: vi.fn(),
	list: vi.fn(),
	get: vi.fn(),
	createComparison: vi.fn(),
	addCandidate: vi.fn(),
	vote: vi.fn(),
	reveal: vi.fn()
}));
vi.mock('$env/dynamic/private', () => ({ env: state.env }));
vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: state.create }));
vi.mock('$lib/services/agentic-chat-v2/answer-comparison.server', async (original) => ({
	...(await original<object>()),
	listAnswerComparisonLab: state.list,
	getAnswerComparison: state.get,
	createAnswerComparison: state.createComparison,
	addAnswerComparisonCandidate: state.addCandidate,
	recordAnswerComparisonVote: state.vote,
	revealAnswerComparison: state.reveal
}));
import { GET, POST } from './+server';
import { AnswerComparisonStoreError } from '$lib/services/agentic-chat-v2/answer-comparison.server';

const user = 'ff000000-0000-4000-8000-000000000001';
const comparisonId = 'fd000000-0000-4000-8000-000000000001';
const runId = 'fd000000-0000-4000-8000-000000000002';
const base = 'http://localhost/api/agent/specialists/comparisons';
function event(
	body: unknown,
	options: {
		userId?: string | null;
		origin?: string;
		contentType?: string;
		raw?: boolean;
		search?: string;
	} = {}
) {
	const url = new URL(`${base}${options.search ?? ''}`);
	return {
		url,
		locals: {
			safeGetSession: async () => ({
				user: options.userId === null ? null : { id: options.userId ?? user }
			})
		},
		request: new Request(url, {
			method: 'POST',
			headers: {
				origin: options.origin ?? url.origin,
				'content-type': options.contentType ?? 'application/json'
			},
			body: options.raw ? String(body) : JSON.stringify(body)
		})
	} as any;
}
const detail = { id: comparisonId, candidates: [] };
beforeEach(() => {
	vi.clearAllMocks();
	state.create.mockReturnValue(state.client);
	state.list.mockResolvedValue({
		comparisons: [],
		scoreboard: { rows: [] },
		sources: [],
		sourcesNotice: null
	});
	state.get.mockResolvedValue(detail);
	state.createComparison.mockResolvedValue(detail);
	state.addCandidate.mockResolvedValue(detail);
	state.vote.mockResolvedValue(detail);
	state.reveal.mockResolvedValue(detail);
});

describe('answer comparison API', () => {
	it.each([
		[null, 401],
		['ff000000-0000-4000-8000-000000000002', 404]
	] as const)('rejects access before touching storage: %s', async (userId, status) => {
		expect((await POST(event({ action: 'reveal', comparisonId }, { userId }))).status).toBe(
			status
		);
		expect((await GET(event(null, { userId }))).status).toBe(status);
		expect(state.create).not.toHaveBeenCalled();
	});
	it('requires same-origin JSON, bounds the body, and validates before creating a client', async () => {
		expect((await POST(event({}, { origin: 'https://evil.example' }))).status).toBe(403);
		expect((await POST(event({}, { contentType: 'text/plain' }))).status).toBe(415);
		expect((await POST(event('x'.repeat(400001), { raw: true }))).status).toBe(413);
		expect((await POST(event('{broken', { raw: true }))).status).toBe(422);
		const invalid = await POST(event({ action: 'create', id: 'nope' }));
		expect(invalid.status).toBe(422);
		expect((await invalid.json()).error).toMatch(/UUID/);
		expect(state.create).not.toHaveBeenCalled();
	});
	it('lists the lab and honours the held-out toggle with no-store caching', async () => {
		const response = await GET(event(null));
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toContain('no-store');
		expect(state.list).toHaveBeenCalledWith(state.client, user, { includeHeldOut: false });
		await GET(event(null, { search: '?heldOut=1' }));
		expect(state.list).toHaveBeenLastCalledWith(state.client, user, { includeHeldOut: true });
	});
	it('reads one comparison by id and rejects a malformed id before storage', async () => {
		const response = await GET(event(null, { search: `?id=${comparisonId}` }));
		expect(await response.json()).toEqual({ comparison: detail });
		expect(state.get).toHaveBeenCalledWith(state.client, user, comparisonId);
		expect((await GET(event(null, { search: '?id=abc' }))).status).toBe(422);
		expect(state.get).toHaveBeenCalledTimes(1);
	});
	it('dispatches parsed actions with the verified owner, ignoring any client-sent user id', async () => {
		const create = {
			action: 'create',
			id: comparisonId,
			title: 'Permit blocker',
			setKind: 'exploratory',
			requiredFacts: ['Names the permit'],
			source: { kind: 'workflow_runs', turnRunIds: [runId] },
			candidates: [
				{ kind: 'workflow_run', turnRunId: runId },
				{ kind: 'manual', name: 'Baseline', answer: 'The permit.' }
			],
			userId: 'attacker'
		};
		expect((await POST(event(create))).status).toBe(200);
		expect(state.createComparison).toHaveBeenCalledWith(
			state.client,
			user,
			expect.objectContaining({ action: 'create', id: comparisonId, title: 'Permit blocker' })
		);
		await POST(
			event({
				action: 'add_candidate',
				comparisonId,
				candidate: { kind: 'workflow_run', turnRunId: runId }
			})
		);
		expect(state.addCandidate).toHaveBeenCalledWith(state.client, user, {
			action: 'add_candidate',
			comparisonId,
			candidate: { kind: 'workflow_run', turnRunId: runId }
		});
		await POST(
			event({
				action: 'vote',
				comparisonId,
				choice: 'tie',
				preferredLabel: null,
				reason: 'Both name the permit.',
				rubricScores: {
					A: { requiredFacts: 2, unsupportedClaims: 0, abstention: 'not_applicable' }
				}
			})
		);
		expect(state.vote).toHaveBeenCalledWith(
			state.client,
			user,
			expect.objectContaining({ choice: 'tie' })
		);
		const reveal = await POST(event({ action: 'reveal', comparisonId }));
		expect(await reveal.json()).toEqual({ comparison: detail });
		expect(state.reveal).toHaveBeenCalledWith(state.client, user, comparisonId);
	});
	it('maps store and unknown failures without leaking internals', async () => {
		state.reveal.mockRejectedValueOnce(
			new AnswerComparisonStoreError(409, 'Save a vote before revealing.')
		);
		const conflict = await POST(event({ action: 'reveal', comparisonId }));
		expect(conflict.status).toBe(409);
		expect((await conflict.json()).error).toBe('Save a vote before revealing.');
		state.reveal.mockRejectedValueOnce(new Error('pg: relation missing'));
		const unknown = await POST(event({ action: 'reveal', comparisonId }));
		expect(unknown.status).toBe(503);
		expect((await unknown.json()).error).not.toMatch(/relation/);
	});
});
