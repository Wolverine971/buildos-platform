// apps/web/src/routes/api/onboarding/server.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const { saveIntentAndStakesMock, completeOnboardingV3Mock } = vi.hoisted(() => ({
	saveIntentAndStakesMock: vi.fn(),
	completeOnboardingV3Mock: vi.fn()
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

import { POST } from './+server';

const createEvent = (body: Record<string, unknown>, withUser = true): RequestEvent => {
	return {
		request: {
			json: vi.fn().mockResolvedValue(body)
		},
		locals: {
			supabase: {},
			safeGetSession: vi.fn().mockResolvedValue({
				user: withUser ? { id: 'user-1' } : null
			})
		}
	} as unknown as RequestEvent;
};

describe('POST /api/onboarding', () => {
	beforeEach(() => {
		saveIntentAndStakesMock.mockReset();
		completeOnboardingV3Mock.mockReset();
	});

	it('rejects unauthenticated requests', async () => {
		const response = await POST(createEvent({ action: 'save_intent_stakes' }, false));
		expect(response.status).toBe(401);
	});

	it('validates complete_v3 payload shape', async () => {
		const response = await POST(
			createEvent({
				action: 'complete_v3',
				onboardingData: {
					intent: 'organize',
					stakes: 'high',
					projectsCreated: -1,
					tasksCreated: 2,
					goalsCreated: 1,
					smsEnabled: true,
					emailEnabled: false
				}
			})
		);

		const payload = await response.json();
		expect(response.status).toBe(400);
		expect(payload.error).toContain('projectsCreated');
		expect(completeOnboardingV3Mock).not.toHaveBeenCalled();
	});

	it('accepts valid complete_v3 payload', async () => {
		const response = await POST(
			createEvent({
				action: 'complete_v3',
				onboardingData: {
					intent: 'unstuck',
					stakes: 'medium',
					projectsCreated: 1,
					tasksCreated: 4,
					goalsCreated: 2,
					smsEnabled: false,
					emailEnabled: true,
					timeSpentSeconds: 187
				}
			})
		);

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
});
