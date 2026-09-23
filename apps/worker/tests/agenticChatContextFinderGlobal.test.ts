// apps/worker/tests/agenticChatContextFinderGlobal.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	ChatWorkspaceFinder,
	buildWorkspaceSelectionPayload,
	composeContextFinders,
	loadPreviousFocus
} from '../src/workers/agentic-chat/provider/chat-workspace-finder';
import type { AgenticChatTurnProviderRequestV1 } from '../src/workers/agentic-chat/provider/contracts';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const REDLINE = '30000000-0000-4000-8000-000000000003';
const NINETAKES = '30000000-0000-4000-8000-000000000004';
const DISCOVERY = '50000000-0000-4000-8000-000000000005';
const OFFER_TASK = '50000000-0000-4000-8000-000000000006';
const START = '50000000-0000-4000-8000-000000000007';

const SUMMARIES = [
	{
		id: REDLINE,
		name: 'Redline Training Company Website',
		description: "Website for Logan Valcarce's pistol training company.",
		state_key: 'active',
		next_step_short: 'Send Logan the $1,000 offer.',
		updated_at: '2026-09-23T00:00:00Z'
	},
	{
		id: NINETAKES,
		name: '9takes',
		description: 'Enneagram discussion board.',
		state_key: 'active',
		updated_at: '2026-09-22T00:00:00Z'
	}
];

/** Tables by name; `onto_documents` answers both the START HERE body query and title rows. */
function fakeClient(
	options: { failCards?: boolean; lastSelection?: Record<string, unknown> } = {}
) {
	const tables: Record<string, unknown> = {
		onto_actors: { id: 'actor-1' },
		onto_projects: { id: REDLINE, name: 'Redline Training Company Website' },
		onto_documents: [
			{
				id: DISCOVERY,
				project_id: REDLINE,
				title: 'Logan / Redline — Discovery Notes',
				type_key: 'document.knowledge',
				content: '## Scope\n$1,000 covers design, booking and Stripe.'
			},
			{
				id: START,
				project_id: REDLINE,
				title: 'START HERE',
				type_key: 'document.context.project',
				content: '## Current state\nWaiting on the Cody range venue.'
			}
		],
		onto_tasks: [
			{
				id: OFFER_TASK,
				project_id: REDLINE,
				title: 'Send Logan the Redline website offer',
				state_key: 'todo'
			}
		],
		chat_turn_events: options.lastSelection ? [{ payload: options.lastSelection }] : []
	};
	const calls: string[] = [];
	return {
		calls,
		client: {
			from(table: string) {
				calls.push(table);
				const data = tables[table] ?? [];
				const result = { data, error: null };
				const builder: Record<string, unknown> = {};
				for (const method of ['select', 'eq', 'in', 'is', 'order', 'limit', 'abortSignal'])
					builder[method] = () => builder;
				builder.maybeSingle = () => Promise.resolve(result);
				builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
				return builder;
			},
			rpc: () => ({
				abortSignal: () =>
					Promise.resolve(
						options.failCards
							? { data: null, error: { message: 'boom' } }
							: { data: SUMMARIES, error: null }
					)
			})
		} as never
	};
}

const receipt = {
	modelRequested: 'typesafe/jev-1.13',
	modelUsed: 'typesafe/jev-1.13',
	requestId: 'r',
	inputTokens: 100,
	outputTokens: 10,
	costUsd: 0.0004,
	durationMs: 300,
	requestBytes: 1000,
	questionCount: 1,
	attempts: 1
};

/** Hop 1 answers scope + dig + per-project scores; hop 2 scores records by key prefix. */
function fakeDecider(hop1: { scope: string; dig: number; redline: number; ninetakes: number }) {
	const decide = vi.fn(
		async (request: { state: Record<string, unknown>; questions: Record<string, unknown> }) => {
			const answers: Record<string, unknown> = {};
			if ('scope' in request.questions) {
				answers.scope = {
					type: 'choice',
					choice: hop1.scope,
					probabilities: { [hop1.scope]: 0.9 },
					confidence: 0.9
				};
				answers.dig = { type: 'noul', noul: hop1.dig };
				const cards = request.state.projects as { ref: string; name: string }[];
				for (const card of cards)
					answers[`p_${card.ref}`] = {
						type: 'noul',
						noul: card.name === '9takes' ? hop1.ninetakes : hop1.redline
					};
			} else
				for (const key of Object.keys(request.questions))
					answers[key] = { type: 'noul', noul: key.startsWith('h_') ? 0.8 : 0.9 };
			return { ok: true as const, answers, receipt };
		}
	);
	return { decide, decider: { decide } as never };
}

function request(
	overrides: Partial<AgenticChatTurnProviderRequestV1> = {}
): AgenticChatTurnProviderRequestV1 {
	return {
		messages: [
			{ role: 'system', content: 'system prompt' },
			{ role: 'user', content: 'Did I save anything about Logan and the pistol site?' }
		],
		tools: [],
		toolChoice: 'auto',
		userId: USER_ID,
		sessionId: SESSION_ID,
		turnRunId: '40000000-0000-4000-8000-000000000004',
		streamRunId: 'stream-1',
		clientTurnId: 'client-turn-1',
		contextType: 'global',
		entityId: null,
		projectId: null,
		queueJobId: 'job-1',
		processingToken: 'token',
		executionGeneration: 1,
		providerRound: 'initial',
		logicalProviderRound: 1,
		signal: new AbortController().signal,
		...overrides
	} as AgenticChatTurnProviderRequestV1;
}

describe('ChatWorkspaceFinder', () => {
	it('only runs for allowlisted users on global turns', async () => {
		const { decide, decider } = fakeDecider({
			scope: 'projects',
			dig: 0.9,
			redline: 0.9,
			ninetakes: 0.1
		});
		const finder = new ChatWorkspaceFinder({
			mode: 'on',
			userIds: [USER_ID],
			client: fakeClient().client,
			decider
		});
		expect(await finder.find(request({ projectId: REDLINE }))).toBeNull();
		expect(await finder.find(request({ contextType: 'calendar' }))).toBeNull();
		expect(await finder.find(request({ userId: SESSION_ID }))).toBeNull();
		expect(decide).not.toHaveBeenCalled();
	});

	it('digs into the focused project and injects its records in on mode', async () => {
		const finder = new ChatWorkspaceFinder({
			mode: 'on',
			userIds: [USER_ID],
			client: fakeClient().client,
			decider: fakeDecider({ scope: 'projects', dig: 0.9, redline: 0.94, ninetakes: 0.08 })
				.decider
		});
		const found = (await finder.find(request()))!;
		const payload = found.step.type === 'semantic' ? found.step.eventPayload : null;
		expect(payload).toMatchObject({
			type: 'context_selection',
			status: 'selected',
			visible: true,
			injected: true,
			project_id: null,
			workspace: { scope: 'projects', dig: true, checked: 2 },
			projects: [{ id: REDLINE, name: 'Redline Training Company Website', hop2: 'ran' }]
		});
		const items = (payload as { items: { id: string; project_id: string }[] }).items;
		expect(items.map((item) => item.id)).toContain(DISCOVERY);
		expect(items.every((item) => item.project_id === REDLINE)).toBe(true);
		expect(JSON.stringify(payload)).not.toContain('$1,000 covers');
		expect(found.injection).toContain('# Project: Redline Training Company Website');
		expect(found.injection).toContain('$1,000 covers design');
	});

	it('gives the project brief without hop 2 when the message only needs the project', async () => {
		const { decide, decider } = fakeDecider({
			scope: 'projects',
			dig: 0.2,
			redline: 0.9,
			ninetakes: 0.1
		});
		const finder = new ChatWorkspaceFinder({
			mode: 'on',
			userIds: [USER_ID],
			client: fakeClient().client,
			decider
		});
		const found = (await finder.find(request()))!;
		expect(decide).toHaveBeenCalledTimes(1);
		expect(found.injection).toContain('Waiting on the Cody range venue.');
		expect(found.injection).toContain(
			`- task ${OFFER_TASK} Send Logan the Redline website offer`
		);
	});

	it('shows nothing and injects nothing when the message needs no saved work', async () => {
		const finder = new ChatWorkspaceFinder({
			mode: 'on',
			userIds: [USER_ID],
			client: fakeClient().client,
			decider: fakeDecider({ scope: 'none', dig: 0.1, redline: 0.8, ninetakes: 0.1 }).decider
		});
		const found = (await finder.find(request()))!;
		const payload = found.step.type === 'semantic' ? found.step.eventPayload : null;
		expect(payload).toMatchObject({ visible: false, injected: false, status: 'empty' });
		expect(found.injection).toBeNull();
	});

	it('publishes chips without injecting in chips mode, and fails open', async () => {
		const chips = new ChatWorkspaceFinder({
			mode: 'chips',
			userIds: [USER_ID],
			client: fakeClient().client,
			decider: fakeDecider({ scope: 'projects', dig: 0.9, redline: 0.9, ninetakes: 0.1 })
				.decider
		});
		expect((await chips.find(request()))!.injection).toBeNull();

		const broken = new ChatWorkspaceFinder({
			mode: 'on',
			userIds: [USER_ID],
			client: fakeClient({ failCards: true }).client,
			decider: fakeDecider({ scope: 'projects', dig: 0.9, redline: 0.9, ninetakes: 0.1 })
				.decider
		});
		const found = (await broken.find(request()))!;
		const payload = found.step.type === 'semantic' ? found.step.eventPayload : null;
		expect(payload).toMatchObject({ status: 'unavailable', failure: 'load_or_rank_failed' });
		expect(found.injection).toBeNull();
	});

	it('still throws when the turn itself is cancelled', async () => {
		const controller = new AbortController();
		controller.abort(new Error('cancelled'));
		const finder = new ChatWorkspaceFinder({
			mode: 'on',
			userIds: [USER_ID],
			client: fakeClient().client,
			decider: fakeDecider({ scope: 'projects', dig: 0.9, redline: 0.9, ninetakes: 0.1 })
				.decider
		});
		await expect(finder.find(request({ signal: controller.signal }))).rejects.toThrow();
	});
});

describe('global finder helpers', () => {
	it("reads the previous turn's focused projects", async () => {
		const { client } = fakeClient({
			lastSelection: { projects: [{ id: NINETAKES }, { id: REDLINE }] }
		});
		expect(await loadPreviousFocus(client, SESSION_ID, new AbortController().signal)).toEqual([
			NINETAKES,
			REDLINE
		]);
		const { client: projectTurn } = fakeClient({ lastSelection: { project_id: REDLINE } });
		expect(
			await loadPreviousFocus(projectTurn, SESSION_ID, new AbortController().signal)
		).toEqual([REDLINE]);
	});

	it('routes project turns and global turns to their own finder', async () => {
		const project = { find: vi.fn(async () => null) };
		const workspace = { find: vi.fn(async () => null) };
		const both = composeContextFinders(project, workspace)!;
		await both.find(request({ projectId: REDLINE }));
		await both.find(request());
		expect(project.find).toHaveBeenCalledTimes(1);
		expect(workspace.find).toHaveBeenCalledTimes(1);
		expect(composeContextFinders(undefined, undefined)).toBeUndefined();
	});

	it('marks a finder failure as unavailable with no projects', () => {
		expect(
			buildWorkspaceSelectionPayload({
				request: request(),
				mode: 'chips',
				context: null,
				injected: false,
				failure: 'deadline',
				elapsedMs: 3_500
			})
		).toMatchObject({ status: 'unavailable', projects: [], items: [], workspace: null });
	});
});
