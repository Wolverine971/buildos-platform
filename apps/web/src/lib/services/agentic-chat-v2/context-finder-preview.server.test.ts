// apps/web/src/lib/services/agentic-chat-v2/context-finder-preview.server.test.ts
import { describe, expect, it, vi } from 'vitest';
import type {
	ContextFinderDecider,
	ContextFinderReadClient
} from '@buildos/agentic-chat-runtime/context-finder';
import { ContextFinderPreviewError, previewProjectContext } from './context-finder-preview.server';

const projectId = 'af000000-0000-4000-8000-0000000000a1';
const memoId = 'af000000-0000-4000-8000-0000000000d1';
const notesId = 'af000000-0000-4000-8000-0000000000d2';
const taskId = 'af000000-0000-4000-8000-0000000000e1';
const updated = '2026-09-22T12:00:00.000Z';

function client(
	tables: Record<string, unknown>,
	project: unknown = { id: projectId, name: 'Cedar' }
) {
	const calls: Array<[string, string, unknown]> = [];
	const from = vi.fn((table: string) => {
		const query: any = {
			select: () => query,
			eq: (column: string, value: unknown) => (calls.push([table, column, value]), query),
			is: () => query,
			order: () => query,
			limit: () => query,
			abortSignal: () => query,
			maybeSingle: async () => ({ data: project, error: null }),
			then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
				Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve, reject)
		};
		return query;
	});
	return { client: { from } as unknown as ContextFinderReadClient, calls };
}

function decider(score: (key: string) => number) {
	const decide = vi.fn(async (request: { questions: Record<string, unknown> }) => {
		const keys = Object.keys(request.questions);
		return {
			ok: true as const,
			answers: Object.fromEntries(keys.map((k) => [k, { type: 'noul', noul: score(k) }])),
			receipt: {
				modelRequested: 'typesafe/jev-1.13',
				modelUsed: 'typesafe/jev-1.13',
				requestId: 'r',
				inputTokens: 100,
				outputTokens: 10,
				costUsd: 0.0004,
				durationMs: 200,
				requestBytes: 1000,
				questionCount: keys.length,
				attempts: 1
			}
		};
	});
	return { decide, decider: { decide } as unknown as ContextFinderDecider };
}

const tables = {
	onto_documents: [
		{
			id: memoId,
			title: 'Pricing memo',
			type_key: 'document.memo',
			content: '# Pricing\n\n## Tiers\nThree tiers.\n\n## Launch\nIn March.',
			updated_at: updated
		},
		{
			id: notesId,
			title: 'Meeting notes',
			type_key: 'document.notes',
			content: 'Talked about lunch.',
			updated_at: updated
		}
	],
	onto_tasks: [{ id: taskId, title: 'Email the printer', state_key: 'todo', updated_at: updated }]
};

describe('previewProjectContext', () => {
	it('ranks with the caller client and returns an editable plan without record text', async () => {
		const { client: c, calls } = client(tables);
		const { decide, decider: d } = decider((key) =>
			key === 'e_d0' || key.startsWith('h_d0') ? 0.9 : 0.05
		);
		const preview = await previewProjectContext({
			client: c,
			decider: d,
			userId: 'user-1',
			projectId,
			question: '  How should we price the launch?\r\n'
		});
		expect(calls).toContainEqual(['onto_projects', 'id', projectId]);
		expect(decide).toHaveBeenCalled();
		expect(preview.status).toBe('selected');
		expect(preview.question).toBe('How should we price the launch?');
		expect(preview.plan?.items[0]).toMatchObject({ id: memoId, tier: 'full' });
		expect(preview.candidates.map((x) => x.id)).toEqual(
			expect.arrayContaining([memoId, notesId, taskId])
		);
		expect(JSON.stringify(preview)).not.toContain('Three tiers');
	});

	it('reports an unreadable project as not found, before any Jev call', async () => {
		const { client: c } = client(tables, null);
		const { decide, decider: d } = decider(() => 0.9);
		await expect(
			previewProjectContext({
				client: c,
				decider: d,
				userId: 'user-1',
				projectId,
				question: 'Anything?'
			})
		).rejects.toMatchObject({ status: 404 } satisfies Partial<ContextFinderPreviewError>);
		expect(decide).not.toHaveBeenCalled();
	});

	it('rejects malformed input before reading', async () => {
		const { client: c, calls } = client(tables);
		await expect(
			previewProjectContext({
				client: c,
				decider: decider(() => 0.9).decider,
				userId: 'user-1',
				projectId: 'not-a-uuid',
				question: 'Anything?'
			})
		).rejects.toMatchObject({ status: 422 });
		expect(calls).toEqual([]);
	});
});
