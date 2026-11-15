// apps/web/src/lib/server/workspace/find.service.test.ts
// Workspace search, server side (tasker 159). The model is always a fake: no paid calls.
import { describe, expect, it, vi } from 'vitest';
import type {
	ContextFinderProjectV1,
	WorkspaceFinderDecider,
	WorkspaceProjectInputV1
} from '@buildos/agentic-chat-runtime/context-finder';
import {
	BEST_MATCH_OPERATION,
	FindError,
	createBestMatchMemo,
	findBestMatch,
	findItems,
	resolveOpenTarget,
	toFindItem
} from './find.service';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('word matches', () => {
	it('maps rows and drops ones it cannot open', () => {
		expect(
			toFindItem({
				kind: 'document',
				id: id(1),
				project_id: id(2),
				project_name: 'Workspace',
				in_workspace: true,
				title: 'Gift list',
				snippet: 'the \u0002lake\u0003 house',
				state_key: 'draft',
				type_key: 'document.note',
				due_at: null,
				updated_at: '2026-11-01T00:00:00Z'
			})
		).toMatchObject({
			kind: 'document',
			in_workspace: true,
			snippet: 'the \u0002lake\u0003 house'
		});
		expect(toFindItem({ kind: 'plan', id: id(1), project_id: id(2) })).toBeNull();
		expect(toFindItem({ kind: 'task', id: null, project_id: id(2) })).toBeNull();
	});

	it('calls onto_find_items with the cleaned query and skips one-letter queries', async () => {
		const rpc = vi.fn(() =>
			Promise.resolve({
				data: [{ kind: 'task', id: id(1), project_id: id(2), title: 'Call the gunsmith' }],
				error: null
			})
		);
		const items = await findItems({ session: { rpc } as never, query: '  gunsm  ' });
		expect(rpc).toHaveBeenCalledWith('onto_find_items', { p_query: 'gunsm', p_limit: 40 });
		expect(items.map((x) => x.title)).toEqual(['Call the gunsmith']);

		rpc.mockClear();
		expect(await findItems({ session: { rpc } as never, query: 'g' })).toEqual([]);
		expect(rpc).not.toHaveBeenCalled();
	});

	it('reports a database failure as a search error', async () => {
		const rpc = vi.fn(() => Promise.resolve({ data: null, error: { message: 'boom' } }));
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		await expect(
			findItems({ session: { rpc } as never, query: 'gift' })
		).rejects.toBeInstanceOf(FindError);
	});
});

describe('item links', () => {
	function client(rows: Record<string, Record<string, unknown> | null>) {
		return {
			from: (table: string) => ({
				select: () => ({
					eq: (_column: string, value: string) => ({
						is: () => ({
							maybeSingle: () =>
								Promise.resolve({
									data: rows[`${table}:${value}`] ?? null,
									error: null
								})
						})
					})
				})
			})
		};
	}

	it('finds the item’s project and whether it is the Workspace', async () => {
		const session = client({
			[`onto_tasks:${id(1)}`]: { id: id(1), project_id: id(9) },
			[`onto_projects:${id(9)}`]: { id: id(9), kind: 'workspace' }
		});
		expect(await resolveOpenTarget(session as never, { kind: 'task', id: id(1) })).toEqual({
			kind: 'task',
			id: id(1),
			project_id: id(9),
			workspace: true
		});
	});

	it('is null for an item the person cannot see', async () => {
		expect(
			await resolveOpenTarget(client({}) as never, { kind: 'document', id: id(1) })
		).toBeNull();
	});
});

// ---------- Best match ----------

const receipt = {
	modelRequested: 'jev',
	modelUsed: 'jev',
	requestId: 'r',
	inputTokens: 100,
	outputTokens: 1,
	costUsd: 0.0001,
	durationMs: 10,
	requestBytes: 1,
	questionCount: 1,
	attempts: 1
};

function card(n: number, name: string, kind?: 'workspace'): WorkspaceProjectInputV1 {
	return {
		project: {
			id: id(n),
			name,
			state_key: 'active',
			updated_at: '2026-11-01T00:00:00Z',
			...(kind ? { kind } : {})
		},
		documents: [],
		tasks: [],
		goals: [],
		plans: [],
		milestones: [],
		risks: []
	};
}

const PROJECTS = [card(1, 'Workspace', 'workspace'), card(2, 'The Cadre'), card(3, '9takes')];
const RECORDS: Record<string, ContextFinderProjectV1> = {
	[id(1)]: {
		project: { id: id(1), name: 'Workspace' },
		documents: [
			{
				id: id(11),
				title: 'Gift list',
				type_key: 'document.note',
				state_key: 'draft',
				content: 'Mom: a framed print',
				updated_at: '2026-10-29T00:00:00Z'
			},
			{
				id: id(12),
				title: 'Garage shelving',
				type_key: 'document.note',
				state_key: 'draft',
				content: 'Back wall 11 ft',
				updated_at: '2026-10-17T00:00:00Z'
			}
		],
		tasks: [
			{
				id: id(13),
				title: 'Book dentist appointment',
				state_key: 'todo',
				updated_at: '2026-10-25T00:00:00Z'
			}
		],
		goals: [],
		plans: [],
		milestones: [],
		risks: []
	},
	[id(2)]: {
		project: { id: id(2), name: 'The Cadre' },
		documents: [],
		tasks: [
			{
				id: id(21),
				title: 'Call the armory back',
				state_key: 'todo',
				updated_at: '2026-10-31T00:00:00Z'
			}
		],
		goals: [],
		plans: [{ id: id(22), name: 'Gift plan', state_key: 'active' }],
		milestones: [],
		risks: []
	}
};

/** Hop 1 scores cards by name; hop 2 scores records by title. Records the questions asked. */
function fakeDecider(input: {
	projectScores: Record<string, number>;
	recordScores: Record<string, number>;
	scope?: 'projects' | 'portfolio' | 'none';
	failHop1?: boolean;
}): WorkspaceFinderDecider & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		async decide(request) {
			const state = request.state as {
				current_request?: string;
				projects?: { ref: string; name: string }[];
				project?: { name: string };
				packets?: { ref: string; title: string }[];
			};
			const answers: Record<string, unknown> = {};
			if ('scope' in request.questions) {
				calls.push(`projects:${state.current_request}`);
				if (input.failHop1) return { ok: false, error: 'jev_timeout', receipt };
				answers.scope = {
					type: 'choice',
					choice: input.scope ?? 'none',
					probabilities: {},
					confidence: 0.9
				};
				answers.dig = { type: 'noul', noul: 0.1 };
				answers.save = { type: 'noul', noul: 0.1 };
				for (const project of state.projects ?? [])
					answers[`p_${project.ref}`] = {
						type: 'noul',
						noul: input.projectScores[project.name] ?? 0.05
					};
				return { ok: true, answers, receipt };
			}
			calls.push(
				`records:${state.project?.name}:${Object.keys(request.questions).every((key) => key.startsWith('e_'))}`
			);
			for (const key of Object.keys(request.questions)) {
				const packet = state.packets?.find((p) => `e_${p.ref}` === key);
				answers[key] = {
					type: 'noul',
					noul: input.recordScores[packet?.title ?? ''] ?? 0.05
				};
			}
			return { ok: true, answers, receipt };
		}
	};
}

function deps(decider: ReturnType<typeof fakeDecider>) {
	return {
		decider,
		loadProjects: vi.fn(async () => PROJECTS),
		loadProject: vi.fn(async (projectId: string) => RECORDS[projectId]!),
		userId: 'u1'
	};
}

describe('best match', () => {
	it('runs hop 2 even when hop 1 calls the scope "none", and returns the right note first', async () => {
		const decider = fakeDecider({
			projectScores: { Workspace: 0.9, 'The Cadre': 0.6 },
			recordScores: { 'Gift list': 0.92, 'Call the armory back': 0.7, 'Gift plan': 0.99 }
		});
		const input = deps(decider);
		const result = await findBestMatch({ ...input, query: 'what to get mom for christmas' });

		expect(result.status).toBe('selected');
		expect(result.items.map((x) => x.title)).toEqual(['Gift list', 'Call the armory back']);
		expect(result.items[0]).toMatchObject({
			kind: 'document',
			id: id(11),
			project_id: id(1),
			in_workspace: true,
			project_name: 'Workspace',
			type_key: 'document.note',
			p: 0.92
		});
		// Plans are left to the word matches; only the records' stage ran (no heading calls).
		expect(decider.calls).toEqual([
			'projects:Find the saved note, doc, task or project this search is looking for: what to get mom for christmas',
			'records:Workspace:true',
			'records:The Cadre:true'
		]);
		expect(input.loadProject).toHaveBeenCalledTimes(2);
	});

	it('drops records below the floor and far below the top one', async () => {
		const decider = fakeDecider({
			projectScores: { Workspace: 0.9 },
			recordScores: {
				'Gift list': 0.95,
				'Garage shelving': 0.52,
				'Book dentist appointment': 0.3
			}
		});
		const result = await findBestMatch({ ...deps(decider), query: 'gift ideas mom' });
		expect(result.items.map((x) => x.title)).toEqual(['Gift list']);
	});

	it('fails open when hop 1 fails', async () => {
		const decider = fakeDecider({ projectScores: {}, recordScores: {}, failHop1: true });
		const result = await findBestMatch({ ...deps(decider), query: 'gift ideas mom' });
		expect(result).toMatchObject({ status: 'unavailable', items: [] });
	});

	it('fails open when loading the cards throws', async () => {
		const decider = fakeDecider({ projectScores: {}, recordScores: {} });
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const result = await findBestMatch({
			...deps(decider),
			loadProjects: async () => {
				throw new Error('db down');
			},
			query: 'gift ideas mom'
		});
		expect(result.status).toBe('unavailable');
		expect(decider.calls).toEqual([]);
	});

	it('is empty when no project clears the floor', async () => {
		const decider = fakeDecider({ projectScores: { Workspace: 0.1 }, recordScores: {} });
		const result = await findBestMatch({ ...deps(decider), query: 'quarterly taxes form' });
		expect(result.status).toBe('empty');
		expect(decider.calls).toHaveLength(1);
	});

	it('logs usage under its own operation', () => {
		expect(BEST_MATCH_OPERATION).toBe('workspace_find_best_match');
	});
});

describe('best match memo', () => {
	it('keeps answers for a while, never failures', () => {
		const memo = createBestMatchMemo(1000, 2);
		const answer = { query: 'q', status: 'selected' as const, items: [], ms: 5 };
		memo.set('a', answer, 0);
		expect(memo.get('a', 500)).toEqual(answer);
		expect(memo.get('a', 1500)).toBeNull();
		memo.set('b', { ...answer, status: 'unavailable' }, 0);
		expect(memo.get('b', 1)).toBeNull();
	});
});
