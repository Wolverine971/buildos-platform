// apps/web/src/lib/server/builder-profile/builder-profile-drafts.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('./builder-profile.service', () => ({
	BuilderProfileError: class extends Error {},
	loadOwnedProjects: vi.fn(async () => [
		{ id: 'p-own', name: 'BuildOS', description: 'Project notes', facet_stage: 'execution' },
		{ id: 'p-new', name: '9takes', description: 'Discussion site', facet_stage: 'execution' }
	])
}));

import { draftPage } from './builder-profile-drafts';

/** A thenable query stub: every chain method returns itself; awaiting it yields `result`. */
function query(result: { data: unknown }) {
	const q: Record<string, unknown> = {};
	for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit', 'maybeSingle']) {
		q[m] = () => q;
	}
	q.then = (resolve: (v: unknown) => unknown) => resolve({ ...result, error: null });
	return q;
}

function fakeAdmin() {
	const tables: Record<string, { data: unknown }> = {
		users: { data: { name: 'DJ', bio: null } },
		onto_goals: { data: [] },
		builder_profile_projects: {
			data: [
				{
					project_id: 'p-own',
					pitch: 'A thinking environment for people making complex things.'
				}
			]
		}
	};
	return { from: (table: string) => query(tables[table] ?? { data: [] }) };
}

describe('draftPage', () => {
	it("keeps the owner's own pitches and drafts only the missing ones", async () => {
		const getJSONResponse = vi.fn(async () => ({
			headline: 'Founder',
			bio: 'I build software.',
			pitches: [
				{ project_id: 'p-own', pitch: 'AI-first project organization.' },
				{ project_id: 'p-new', pitch: 'Post before you see the replies.' }
			]
		}));

		const draft = await draftPage({
			llm: { getJSONResponse } as never,
			admin: fakeAdmin() as never,
			userId: 'u1',
			projectIds: ['p-own', 'p-new']
		});

		expect(draft.pitches).toEqual([
			{ project_id: 'p-new', pitch: 'Post before you see the replies.' }
		]);
		const call = (getJSONResponse.mock.calls[0] as unknown as [{ userPrompt: string }])[0];
		const input = JSON.parse(call.userPrompt);
		expect(
			input.projects.find((p: { project_id: string }) => p.project_id === 'p-own').owner_pitch
		).toBe('A thinking environment for people making complex things.');
	});
});
