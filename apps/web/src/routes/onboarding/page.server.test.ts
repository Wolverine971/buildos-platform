import { beforeEach, describe, expect, it, vi } from 'vitest';
const { ensureActor, projects } = vi.hoisted(() => ({ ensureActor: vi.fn(), projects: vi.fn() }));
vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: ensureActor,
	fetchProjectSummaries: projects
}));
import { load } from './+page.server';
import { load as register } from '../register/+page.server';
import { load as signup } from '../signup/+page.server';

describe('onboarding entry and resume', () => {
	beforeEach(() => {
		ensureActor.mockReset().mockResolvedValue('actor');
		projects.mockReset().mockResolvedValue([]);
	});
	it('restores server milestones and preserves an OAuth return without duplicate profile queries', async () => {
		const supabase = { from: vi.fn() };
		const result = await load({
			locals: {
				supabase,
				safeGetSession: async () => ({
					user: {
						id: 'user-1',
						onboarding_step: 3,
						onboarding_project_id: 'project-1',
						onboarding_intent: 'organize',
						onboarding_stakes: 'high'
					}
				})
			},
			depends: vi.fn(),
			url: new URL('https://example.test/onboarding?calendar=1')
		} as any);
		expect(result).toMatchObject({
			savedStep: 3,
			savedProjectId: 'project-1',
			savedIntent: 'organize',
			calendarReturn: true
		});
		expect(supabase.from).not.toHaveBeenCalled();
	});
	it('routes an already completed session to Today before loading projects', async () => {
		await expect(
			load({
				locals: {
					safeGetSession: async () => ({
						user: { id: 'user-1', onboarding_completed_at: '2026-09-09' }
					})
				},
				depends: vi.fn(),
				url: new URL('https://example.test/onboarding')
			} as any)
		).rejects.toMatchObject({ status: 303, location: '/today' });
		expect(ensureActor).not.toHaveBeenCalled();
	});
	it.each([
		{ alias: register, status: 301 },
		{ alias: signup, status: 308 }
	])(
		'preserves invitation and attribution parameters on registration aliases',
		async ({ alias, status }) => {
			const url = new URL(
				'https://example.test/register?redirect=%2Finvites%2Fabc&utm_source=invite'
			);
			await expect(alias({ url } as any)).rejects.toMatchObject({
				status,
				location: '/auth/register?redirect=%2Finvites%2Fabc&utm_source=invite'
			});
		}
	);
});
