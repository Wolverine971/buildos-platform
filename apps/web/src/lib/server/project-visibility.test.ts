// apps/web/src/lib/server/project-visibility.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureActorId } = vi.hoisted(() => ({ ensureActorId: vi.fn() }));
vi.mock('$lib/services/ontology/ontology-projects.service', () => ({ ensureActorId }));

import { needsOnboarding, preflightProjectVisibility } from './project-visibility';

type CountResult = { count: number | null; error: unknown };

function fakeSupabase(counts: { members: CountResult; owned: CountResult }) {
	const from = vi.fn((table: string) => {
		const result = table === 'onto_project_members' ? counts.members : counts.owned;
		const chain = {
			select: vi.fn(() => chain),
			eq: vi.fn(() => chain),
			is: vi.fn(() => Promise.resolve(result))
		};
		return chain;
	});
	return { from } as any;
}

describe('project visibility preflight', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		ensureActorId.mockResolvedValue('actor-1');
	});

	it('counts memberships and owned projects without fetching rows', async () => {
		const supabase = fakeSupabase({
			members: { count: 0, error: null },
			owned: { count: 2, error: null }
		});

		await expect(preflightProjectVisibility(supabase, 'user-1')).resolves.toEqual({
			hasProjects: true,
			actorId: 'actor-1'
		});
		expect(supabase.from).toHaveBeenCalledWith('onto_project_members');
		expect(supabase.from).toHaveBeenCalledWith('onto_projects');
	});

	it('skips the project check entirely for a completed user', async () => {
		const supabase = fakeSupabase({
			members: { count: 0, error: null },
			owned: { count: 0, error: null }
		});

		await expect(
			needsOnboarding(supabase, { id: 'user-1', onboarding_completed_at: '2026-01-01' })
		).resolves.toBe(false);
		expect(ensureActorId).not.toHaveBeenCalled();
		expect(supabase.from).not.toHaveBeenCalled();
	});

	it('keeps a returning user with projects out of onboarding when the flag is null', async () => {
		const supabase = fakeSupabase({
			members: { count: 3, error: null },
			owned: { count: 0, error: null }
		});

		await expect(
			needsOnboarding(supabase, { id: 'user-1', onboarding_completed_at: null })
		).resolves.toBe(false);
	});

	it('sends a new user with no projects to onboarding', async () => {
		const supabase = fakeSupabase({
			members: { count: 0, error: null },
			owned: { count: 0, error: null }
		});

		await expect(
			needsOnboarding(supabase, { id: 'user-1', onboarding_completed_at: null })
		).resolves.toBe(true);
	});

	it('falls back to onboarding when the check itself fails', async () => {
		ensureActorId.mockRejectedValue(new Error('rpc down'));

		await expect(
			needsOnboarding(fakeSupabase({} as any), {
				id: 'user-1',
				onboarding_completed_at: null
			})
		).resolves.toBe(true);
	});
});
