// apps/worker/tests/agenticChatAboutYou.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	ChatAboutYou,
	loadAboutYouProfile,
	type AboutYouReadClient
} from '../src/workers/agentic-chat/provider/chat-about-you';
import type { AgenticChatTurnProviderRequestV1 } from '../src/workers/agentic-chat/provider/contracts';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const NOTE = [
	'# About you',
	'',
	'_BuildOS keeps this note._',
	'',
	'## How you like answers',
	'',
	'- Outcome first, in product terms _(Oct 2026)_',
	'',
	'## Schedule and constraints',
	'',
	'- Works late into the night _(Oct 2026)_',
	'',
	'## Where you are',
	'',
	'- Glen Burnie, MD _(Oct 2026)_'
].join('\n');

function request(
	overrides: Partial<AgenticChatTurnProviderRequestV1> = {}
): AgenticChatTurnProviderRequestV1 {
	return {
		messages: [
			{ role: 'system', content: 'system prompt' },
			{ role: 'user', content: 'Plan my week around the BuildOS launch' }
		],
		tools: [],
		toolChoice: 'auto',
		userId: USER_ID,
		sessionId: 'session-1',
		turnRunId: 'turn-1',
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

/** Answers by table; records which tables were read. */
function fakeClient(tables: Record<string, Record<string, unknown> | null>) {
	const reads: string[] = [];
	const client: AboutYouReadClient = {
		from(table: string) {
			reads.push(table);
			const query = {
				select: () => query,
				eq: () => query,
				is: () => query,
				order: () => query,
				limit: () => query,
				maybeSingle: async () => ({ data: tables[table] ?? null, error: null })
			};
			return query as never;
		}
	};
	return { client, reads };
}

const receipt = {
	modelRequested: 'jev',
	modelUsed: 'jev',
	requestId: null,
	inputTokens: null,
	outputTokens: null,
	costUsd: 0.001,
	durationMs: 200,
	requestBytes: 10,
	questionCount: 2,
	attempts: 1
};

describe('loadAboutYouProfile', () => {
	it('finds the Workspace through the actor when the turn has no Workspace id', async () => {
		const { client, reads } = fakeClient({
			users: { preferences: { response_length: 'concise' }, onboarding_stakes: null },
			onto_actors: { id: 'actor-1' },
			onto_projects: { id: 'ws-1' },
			onto_documents: { content: NOTE }
		});
		const profile = await loadAboutYouProfile(
			client,
			USER_ID,
			null,
			new AbortController().signal
		);
		expect(reads).toEqual(['users', 'onto_actors', 'onto_projects', 'onto_documents']);
		expect(profile.sections.map((section) => section.heading)).toEqual([
			'How you like answers',
			'Schedule and constraints',
			'Where you are'
		]);
		expect(profile.settings).toMatchObject({ responseLength: 'concise', stakes: null });
	});

	it('has no settings when the person chose none', async () => {
		const { client } = fakeClient({ users: { preferences: {}, onboarding_stakes: null } });
		const profile = await loadAboutYouProfile(
			client,
			USER_ID,
			'ws-1',
			new AbortController().signal
		);
		expect(profile).toEqual({ sections: [], settings: null });
	});
});

describe('ChatAboutYou', () => {
	it('gives everyone the always-on part without a model call', async () => {
		const { client } = fakeClient({
			users: { preferences: {}, onboarding_stakes: 'high' },
			onto_documents: { content: NOTE }
		});
		const decide = vi.fn();
		const port = new ChatAboutYou({ client, decider: { decide }, gateUserIds: [] });
		const result = await port.load(request({ workspaceProjectId: 'ws-1' }));
		expect(decide).not.toHaveBeenCalled();
		expect(result?.gate).toBeNull();
		expect(result?.injection).toContain(
			'How they like answers: Outcome first, in product terms'
		);
		expect(result?.injection).toContain('be careful and precise');
		expect(result?.injection).not.toContain('Works late');
	});

	it('loads only the sections Jev says change the answer, for the cohort', async () => {
		const { client } = fakeClient({
			users: { preferences: {}, onboarding_stakes: null },
			onto_documents: { content: NOTE }
		});
		const decide = vi.fn(async () => ({
			ok: true as const,
			answers: { a_A0: { noul: 0.82 }, a_A1: { noul: 0.05 } },
			receipt
		}));
		const port = new ChatAboutYou({ client, decider: { decide }, gateUserIds: [USER_ID] });
		const result = await port.load(request({ workspaceProjectId: 'ws-1' }));
		expect(decide).toHaveBeenCalledTimes(1);
		expect(result?.gate?.selected.map((section) => section.heading)).toEqual([
			'Schedule and constraints'
		]);
		expect(result?.injection).toContain(
			'- Schedule and constraints: Works late into the night.'
		);
		expect(result?.injection).not.toContain('Glen Burnie');
	});

	it('caches the profile per person for a minute', async () => {
		const { client, reads } = fakeClient({
			users: { preferences: {}, onboarding_stakes: null },
			onto_documents: { content: NOTE }
		});
		let now = 1_000;
		const port = new ChatAboutYou({ client, now: () => now });
		await port.load(request({ workspaceProjectId: 'ws-1' }));
		await port.load(request({ workspaceProjectId: 'ws-1' }));
		expect(reads).toEqual(['users', 'onto_documents']);
		now += 61_000;
		await port.load(request({ workspaceProjectId: 'ws-1' }));
		expect(reads).toHaveLength(4);
	});

	it('fails open when the reads fail', async () => {
		const client: AboutYouReadClient = {
			from() {
				throw new Error('db down');
			}
		};
		const port = new ChatAboutYou({ client });
		expect(await port.load(request({ workspaceProjectId: 'ws-1' }))).toBeNull();
	});

	it('returns nothing to inject for a person with no note and no settings', async () => {
		const { client } = fakeClient({ users: { preferences: null, onboarding_stakes: null } });
		const port = new ChatAboutYou({ client });
		const result = await port.load(request({ workspaceProjectId: 'ws-1' }));
		expect(result).toEqual({ injection: null, gate: null });
	});
});
