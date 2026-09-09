import { beforeEach, describe, expect, it, vi } from 'vitest';
const { access } = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock('$lib/server/ontology-project-access', () => ({ requireProjectMemberAccess: access }));
import { saveOnboardingProgress } from './onboarding-progress';

function fixture(overrides = {}, saveError: unknown = null) {
	const row = {
		onboarding_intent: 'organize',
		onboarding_stakes: 'medium',
		onboarding_step: 1,
		onboarding_completed_at: null,
		onboarding_project_id: null,
		...overrides
	};
	const query = {
		select: vi.fn(),
		eq: vi.fn(),
		single: vi.fn(),
		update: vi.fn(),
		lte: vi.fn(),
		is: vi.fn()
	};
	query.select.mockReturnValue(query);
	query.eq.mockReturnValue(query);
	query.single.mockResolvedValue({ data: row, error: null });
	query.update.mockReturnValue(query);
	query.lte.mockReturnValue(query);
	query.is.mockResolvedValue({ error: saveError });
	return { query, locals: { supabase: { from: vi.fn(() => query) } } as unknown as App.Locals };
}

describe('saved onboarding milestones', () => {
	beforeEach(() => {
		access.mockReset();
		access.mockResolvedValue({ ok: true });
	});
	it('checks membership and saves the project before an OAuth round-trip', async () => {
		const { locals, query } = fixture();
		await saveOnboardingProgress(locals, 'user-1', 1, 'project-1');
		expect(access).toHaveBeenCalledWith({
			locals,
			user: { id: 'user-1' },
			projectId: 'project-1'
		});
		expect(query.update).toHaveBeenCalledWith({
			onboarding_step: 1,
			onboarding_project_id: 'project-1'
		});
	});
	it('does not roll a later milestone back', async () => {
		const { locals, query } = fixture({
			onboarding_step: 3,
			onboarding_project_id: 'project-1'
		});
		await saveOnboardingProgress(locals, 'user-1', 1);
		expect(query.update).toHaveBeenCalledWith({ onboarding_step: 3 });
		expect(query.lte).toHaveBeenCalledWith('onboarding_step', 3);
		expect(query.is).toHaveBeenCalledWith('onboarding_completed_at', null);
	});
	it('rejects inaccessible projects without writing', async () => {
		access.mockResolvedValue({ ok: false });
		const { locals, query } = fixture();
		await expect(saveOnboardingProgress(locals, 'user-1', 2, 'project-2')).rejects.toThrow(
			'no longer available'
		);
		expect(query.update).not.toHaveBeenCalled();
	});
	it('requires answers and a reviewed project for non-explorers', async () => {
		await expect(
			saveOnboardingProgress(fixture({ onboarding_intent: null }).locals, 'user-1', 1)
		).rejects.toThrow('intent and stakes');
		await expect(saveOnboardingProgress(fixture().locals, 'user-1', 2)).rejects.toThrow(
			'first project'
		);
	});
	it('allows an explorer to keep an empty workspace', async () => {
		const { locals, query } = fixture({ onboarding_intent: 'explore' });
		await saveOnboardingProgress(locals, 'user-1', 3);
		expect(query.update).toHaveBeenCalledWith({ onboarding_step: 3 });
	});
	it('lets an explorer explicitly clear an unavailable saved project', async () => {
		const { locals, query } = fixture({
			onboarding_intent: 'explore',
			onboarding_project_id: 'old-project'
		});
		await saveOnboardingProgress(locals, 'user-1', 2, null);
		expect(access).not.toHaveBeenCalled();
		expect(query.update).toHaveBeenCalledWith({
			onboarding_step: 2,
			onboarding_project_id: null
		});
	});
	it('keeps completion immutable and surfaces persistence failures', async () => {
		const complete = fixture({ onboarding_completed_at: '2026-09-09' });
		await saveOnboardingProgress(complete.locals, 'user-1', 1);
		expect(complete.query.update).not.toHaveBeenCalled();
		await expect(
			saveOnboardingProgress(fixture({}, new Error('offline')).locals, 'user-1', 1)
		).rejects.toThrow('Could not save');
	});
});
