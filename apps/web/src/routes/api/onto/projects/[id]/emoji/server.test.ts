// apps/web/src/routes/api/onto/projects/[id]/emoji/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';

const access = vi.hoisted(() => ({ require: vi.fn() }));
vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: access.require
}));

import { PUT } from './+server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function event(body: unknown, stored: unknown = null, updatedRow: unknown = { id: PROJECT_ID }) {
	const update = vi.fn();
	const supabase = {
		from: vi.fn(() => ({
			select: () => ({
				eq: () => ({
					maybeSingle: async () => ({ data: { icon_emoji: stored }, error: null })
				})
			}),
			update: (values: unknown) => {
				update(values);
				return {
					eq: () => ({
						select: () => ({
							maybeSingle: async () => ({ data: updatedRow, error: null })
						})
					})
				};
			}
		}))
	};
	return {
		update,
		event: {
			params: { id: PROJECT_ID },
			request: { json: async () => body },
			locals: { supabase }
		} as unknown as RequestEvent
	};
}

describe('PUT /api/onto/projects/[id]/emoji', () => {
	beforeEach(() => {
		access.require.mockResolvedValue({
			ok: true,
			projectId: PROJECT_ID,
			userId: 'user-1',
			actorId: 'actor-1'
		});
	});

	it('saves the owner’s pick and keeps the automatic suggestions', async () => {
		const { event: e, update } = event(
			{ glyphs: ['💰', '🚪'] },
			{ glyphs: ['📖', '🔚'], source: 'llm', ranked: [['📖', 0.3]], input_hash: 'abc' }
		);
		const response = await PUT(e);
		expect(response.status).toBe(200);
		const saved = update.mock.calls[0]![0].icon_emoji;
		expect(saved).toMatchObject({
			glyphs: ['💰', '🚪'],
			source: 'user',
			chosen_by: 'actor-1',
			ranked: [['📖', 0.3]],
			input_hash: 'abc'
		});
		const json = await response.json();
		expect(json.data.emoji).toEqual({
			glyphs: ['💰', '🚪'],
			source: 'user',
			suggestions: ['📖']
		});
		expect(access.require).toHaveBeenCalledWith(
			expect.objectContaining({ requiredAccess: 'write' })
		);
	});

	it('saves an empty list for initials', async () => {
		const { event: e, update } = event({ glyphs: [] });
		expect((await PUT(e)).status).toBe(200);
		expect(update.mock.calls[0]![0].icon_emoji).toMatchObject({ glyphs: [], source: 'user' });
	});

	it('refuses text and more than two emoji', async () => {
		for (const glyphs of [['money'], ['💰', '🚪', '📖'], '💰']) {
			const { event: e, update } = event({ glyphs });
			expect((await PUT(e)).status).toBe(400);
			expect(update).not.toHaveBeenCalled();
		}
	});

	it('stops without write access', async () => {
		access.require.mockResolvedValue({
			ok: false,
			response: new Response(null, { status: 403 })
		});
		const { event: e, update } = event({ glyphs: ['💰'] });
		expect((await PUT(e)).status).toBe(403);
		expect(update).not.toHaveBeenCalled();
	});

	it('reports a refused update (RLS) as forbidden', async () => {
		const { event: e } = event({ glyphs: ['💰'] }, null, null);
		expect((await PUT(e)).status).toBe(403);
	});
});
