// apps/worker/src/workers/project-emoji/projectEmojiWorker.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../lib/services/smart-llm-service', () => ({ SmartLLMService: vi.fn() }));

import { processPickProjectEmojiJob } from './projectEmojiWorker';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

type Project = {
	name: string;
	description: string | null;
	deleted_at: string | null;
	icon_emoji: unknown;
};

/** A tiny onto_projects / onto_documents stand-in that records the update it receives. */
function fakeDb(project: Project | null, opts: { startHere?: string; written?: boolean } = {}) {
	const updates: unknown[] = [];
	const chain = (result: unknown) => {
		const node: Record<string, unknown> = {};
		for (const method of ['select', 'eq', 'is', 'order', 'limit']) node[method] = () => node;
		node.maybeSingle = () => Promise.resolve(result);
		node.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
		return node;
	};
	const db = {
		from: (table: string) => {
			if (table === 'onto_documents') {
				return chain({
					data: opts.startHere ? { content: opts.startHere } : null,
					error: null
				});
			}
			return {
				...chain({ data: project ? { id: PROJECT_ID, ...project } : null, error: null }),
				update: (values: unknown) => {
					updates.push(values);
					return chain({
						data: opts.written === false ? [] : [{ id: PROJECT_ID }],
						error: null
					});
				}
			};
		}
	};
	return { db: db as never, updates };
}

const job = () =>
	({
		id: 'job-1',
		userId: USER_ID,
		data: { projectId: PROJECT_ID, userId: USER_ID },
		attempts: 0,
		signal: new AbortController().signal,
		log: vi.fn(),
		updateProgress: vi.fn()
	}) as never;

const llm = (answer: unknown) => ({ getJSONResponse: vi.fn().mockResolvedValue(answer) });
const good = { first: { emoji: '💰', why: 'the sale' }, second: { emoji: '🚪', why: 'the exit' } };

describe('processPickProjectEmojiJob', () => {
	it('picks from the project and its START HERE, and fills the empty slot', async () => {
		const { db, updates } = fakeDb(
			{
				name: 'Beyond Exit Planning',
				description: 'Owner exits',
				deleted_at: null,
				icon_emoji: null
			},
			{ startHere: 'Rod helps owners sell.' }
		);
		const model = llm(good);
		const result = await processPickProjectEmojiJob(job(), { supabase: db, llm: model });
		expect(result).toMatchObject({ outcome: 'picked', glyphs: ['💰', '🚪'] });
		expect(model.getJSONResponse.mock.calls[0]![0].userPrompt).toContain(
			'Rod helps owners sell.'
		);
		expect(updates[0]).toMatchObject({ icon_emoji: { glyphs: ['💰', '🚪'], source: 'llm' } });
	});

	it('leaves a project alone when it already has emoji or was deleted', async () => {
		for (const project of [
			{
				name: 'A',
				description: null,
				deleted_at: null,
				icon_emoji: { glyphs: ['🧭'], source: 'user' }
			},
			{ name: 'B', description: null, deleted_at: '2026-10-01', icon_emoji: null }
		]) {
			const { db, updates } = fakeDb(project);
			const model = llm(good);
			const result = await processPickProjectEmojiJob(job(), { supabase: db, llm: model });
			expect(result.outcome).toBe('skipped');
			expect(model.getJSONResponse).not.toHaveBeenCalled();
			expect(updates).toEqual([]);
		}
	});

	it('does not overwrite emoji someone chose while it was picking', async () => {
		const { db } = fakeDb(
			{ name: 'A', description: null, deleted_at: null, icon_emoji: null },
			{ written: false }
		);
		const result = await processPickProjectEmojiJob(job(), { supabase: db, llm: llm(good) });
		expect(result).toMatchObject({ outcome: 'skipped', reason: 'emoji set while picking' });
	});

	it('keeps the initials when the model never gives a usable pick', async () => {
		const { db, updates } = fakeDb({
			name: 'A',
			description: null,
			deleted_at: null,
			icon_emoji: null
		});
		const result = await processPickProjectEmojiJob(job(), {
			supabase: db,
			llm: llm({ first: { emoji: 'money' } })
		});
		expect(result.outcome).toBe('failed');
		expect(updates).toEqual([]);
	});
});
