// apps/web/src/lib/server/projects/merged-project-redirect.test.ts
import { describe, expect, it, vi } from 'vitest';
import { mergedProjectLocation, readMergedProjectDestination } from './merged-project-redirect';
import { loadProjectItemPage } from './project-item-page';

const SOURCE = '11111111-1111-4111-8111-111111111111';
const DEST = '22222222-2222-4222-8222-222222222222';
const TASK = '33333333-3333-4333-8333-333333333333';

function client(answer: { data?: unknown; error?: unknown } | Error) {
	return {
		rpc: vi.fn(async () => {
			if (answer instanceof Error) throw answer;
			return { data: answer.data ?? null, error: answer.error ?? null };
		})
	};
}

describe('readMergedProjectDestination', () => {
	it('returns the destination only for a merged answer', async () => {
		const merged = client({ data: { status: 'merged', destination_project_id: DEST } });
		expect(await readMergedProjectDestination(merged, SOURCE)).toBe(DEST);
		expect(merged.rpc).toHaveBeenCalledWith('get_project_route_redirect', {
			p_project_id: SOURCE
		});
	});

	it.each([
		['not merged', client({ data: null })],
		['an RPC error', client({ error: { message: 'function not found' } })],
		['a thrown error', client(new Error('network'))],
		['a malformed id', client({ data: { status: 'merged', destination_project_id: 'x' } })],
		['a self-loop', client({ data: { status: 'merged', destination_project_id: SOURCE } })],
		['another status', client({ data: { status: 'moved', destination_project_id: DEST } })]
	])('never redirects on %s', async (_, supabase) => {
		expect(await readMergedProjectDestination(supabase, SOURCE)).toBeNull();
	});
});

describe('mergedProjectLocation', () => {
	it('keeps the sub-page and the query under the destination', () => {
		const url = new URL(`https://buildos.test/projects/${SOURCE}/tasks/${TASK}?from=chat`);
		expect(mergedProjectLocation(url, SOURCE, DEST)).toBe(
			`/projects/${DEST}/tasks/${TASK}?from=chat`
		);
	});
});

describe('loadProjectItemPage on a combined project', () => {
	it('forwards a task page to the same task under the destination', async () => {
		const fetch = vi.fn(async () => new Response('{}', { status: 404 }));
		const url = new URL(`https://buildos.test/projects/${SOURCE}/tasks/${TASK}`);
		await expect(
			loadProjectItemPage({
				kind: 'task',
				projectId: SOURCE,
				itemId: TASK,
				fetch: fetch as unknown as typeof globalThis.fetch,
				locals: {
					supabase: client({
						data: { status: 'merged', destination_project_id: DEST }
					})
				} as unknown as App.Locals,
				url
			})
		).rejects.toMatchObject({ status: 307, location: `/projects/${DEST}/tasks/${TASK}` });
	});
});
