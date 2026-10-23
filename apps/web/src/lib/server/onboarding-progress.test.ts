// apps/web/src/lib/server/onboarding-progress.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { access, isWorkspace, workspaceHasItems, ensureActorId } = vi.hoisted(() => ({
	access: vi.fn(),
	isWorkspace: vi.fn(),
	workspaceHasItems: vi.fn(),
	ensureActorId: vi.fn()
}));
vi.mock('$lib/server/ontology-project-access', () => ({ requireProjectMemberAccess: access }));
vi.mock('$lib/server/workspace-guard', () => ({
	isWorkspaceProjectId: isWorkspace,
	workspaceHasLiveItems: workspaceHasItems
}));
vi.mock('$lib/services/ontology/ontology-projects.service', () => ({ ensureActorId }));
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
		isWorkspace.mockReset();
		isWorkspace.mockResolvedValue(false);
		workspaceHasItems.mockReset();
		workspaceHasItems.mockResolvedValue(false);
		ensureActorId.mockReset();
		ensureActorId.mockResolvedValue('actor-1');
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
	it('never saves the Workspace as the first project', async () => {
		isWorkspace.mockResolvedValue(true);
		workspaceHasItems.mockResolvedValue(true);
		const { locals, query } = fixture();
		await saveOnboardingProgress(locals, 'user-1', 2, 'workspace-1');
		expect(access).not.toHaveBeenCalled();
		expect(query.update).toHaveBeenCalledWith({
			onboarding_step: 2,
			onboarding_project_id: null
		});
	});
	it('lets a non-explorer continue with loose items in the Workspace', async () => {
		workspaceHasItems.mockResolvedValue(true);
		const { locals, query } = fixture();
		await saveOnboardingProgress(locals, 'user-1', 2);
		expect(workspaceHasItems).toHaveBeenCalledWith(locals.supabase, 'actor-1');
		expect(query.update).toHaveBeenCalledWith({ onboarding_step: 2 });
	});
	it('still asks for a first project when the Workspace is the only pick and it is empty', async () => {
		isWorkspace.mockResolvedValue(true);
		const { locals, query } = fixture();
		await expect(saveOnboardingProgress(locals, 'user-1', 2, 'workspace-1')).rejects.toThrow(
			'first project'
		);
		expect(query.update).not.toHaveBeenCalled();
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
