// apps/web/src/routes/api/onboarding/server.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const { saveIntentAndStakesMock, completeOnboardingV3Mock, ensureActorIdMock } = vi.hoisted(() => ({
	saveIntentAndStakesMock: vi.fn(),
	completeOnboardingV3Mock: vi.fn(),
	ensureActorIdMock: vi.fn()
}));

vi.mock('$lib/server/onboarding.service', () => ({
	OnboardingServerService: vi.fn().mockImplementation(() => ({
		saveIntentAndStakes: saveIntentAndStakesMock,
		completeOnboardingV3: completeOnboardingV3Mock,
		saveUserInputs: vi.fn(),
		saveUserInputOnly: vi.fn(),
		getUserContextSummary: vi.fn(),
		completeOnboarding: vi.fn()
	}))
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: ensureActorIdMock
}));

import { POST } from './+server';

// The complete_v3 gate head-counts onto_project_members for the user's actor.
const createSupabaseMock = (workspaceProjectCount: number) => ({
	from: vi.fn(() => ({
		select: vi.fn(() => ({
			eq: vi.fn(() => ({
				is: vi.fn(() => Promise.resolve({ count: workspaceProjectCount, error: null }))
			}))
		}))
	}))
});

const createEvent = (
	body: Record<string, unknown>,
	{ withUser = true, workspaceProjectCount = 0 } = {}
): RequestEvent => {
	return {
		request: {
			json: vi.fn().mockResolvedValue(body)
		},
		locals: {
			supabase: createSupabaseMock(workspaceProjectCount),
			safeGetSession: vi.fn().mockResolvedValue({
				user: withUser ? { id: 'user-1' } : null
			})
		}
	} as unknown as RequestEvent;
};

const completeV3Body = (overrides: Record<string, unknown> = {}) => ({
	action: 'complete_v3',
	onboardingData: {
		intent: 'unstuck',
		stakes: 'medium',
		projectsCreated: 1,
		tasksCreated: 4,
		goalsCreated: 2,
		smsEnabled: false,
		emailEnabled: true,
		timeSpentSeconds: 187,
		...overrides
	}
});

describe('POST /api/onboarding', () => {
	beforeEach(() => {
		saveIntentAndStakesMock.mockReset();
		completeOnboardingV3Mock.mockReset();
		ensureActorIdMock.mockReset();
		ensureActorIdMock.mockResolvedValue('actor-1');
	});

	it('rejects unauthenticated requests', async () => {
		const response = await POST(
			createEvent({ action: 'save_intent_stakes' }, { withUser: false })
		);
		expect(response.status).toBe(401);
	});

	it('validates complete_v3 payload shape', async () => {
		const response = await POST(
			createEvent(completeV3Body({ intent: 'organize', stakes: 'high', projectsCreated: -1 }))
		);

		const payload = await response.json();
		expect(response.status).toBe(400);
		expect(payload.error).toContain('projectsCreated');
		expect(completeOnboardingV3Mock).not.toHaveBeenCalled();
	});

	it('accepts valid complete_v3 payload', async () => {
		const response = await POST(createEvent(completeV3Body(), { workspaceProjectCount: 1 }));

		expect(response.status).toBe(200);
		expect(completeOnboardingV3Mock).toHaveBeenCalledWith('user-1', {
			intent: 'unstuck',
			stakes: 'medium',
			projectsCreated: 1,
			tasksCreated: 4,
			goalsCreated: 2,
			smsEnabled: false,
			emailEnabled: true,
			timeSpentSeconds: 187
		});
	});

	it('rejects non-explore completion when the workspace has zero projects', async () => {
		const response = await POST(
			createEvent(completeV3Body({ projectsCreated: 0, tasksCreated: 0, goalsCreated: 0 }), {
				workspaceProjectCount: 0
			})
		);

		const payload = await response.json();
		expect(response.status).toBe(400);
		expect(payload.error).toContain('first project');
		expect(completeOnboardingV3Mock).not.toHaveBeenCalled();
	});

	it('rejects non-explore completion even when the client claims projects were created', async () => {
		// The gate trusts the workspace count, not the client payload.
		const response = await POST(
			createEvent(completeV3Body({ projectsCreated: 5 }), { workspaceProjectCount: 0 })
		);

		expect(response.status).toBe(400);
		expect(completeOnboardingV3Mock).not.toHaveBeenCalled();
	});

	it('allows explore completion with zero projects (explicit empty-workspace branch)', async () => {
		const response = await POST(
			createEvent(
				completeV3Body({
					intent: 'explore',
					projectsCreated: 0,
					tasksCreated: 0,
					goalsCreated: 0
				}),
				{ workspaceProjectCount: 0 }
			)
		);

		expect(response.status).toBe(200);
		expect(completeOnboardingV3Mock).toHaveBeenCalled();
	});

	it('allows non-explore completion with zero created-this-session when the workspace already has projects', async () => {
		const response = await POST(
			createEvent(completeV3Body({ projectsCreated: 0, tasksCreated: 0, goalsCreated: 0 }), {
				workspaceProjectCount: 3
			})
		);

		expect(response.status).toBe(200);
		expect(completeOnboardingV3Mock).toHaveBeenCalled();
	});
});
