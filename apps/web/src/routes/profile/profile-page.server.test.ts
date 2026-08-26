// apps/web/src/routes/profile/profile-page.server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const isFeatureEnabled = vi.fn();

vi.mock('$lib/utils/feature-flags', () => ({
	FEATURE_KEYS: { cyclesProfileSettings: 'cycles.profile_settings' },
	isFeatureEnabled
}));

vi.mock('$lib/services/stripe-service', () => ({
	StripeService: {
		isEnabled: () => false
	}
}));

function singleRowQuery(data: unknown) {
	const query = {
		select: vi.fn(),
		eq: vi.fn(),
		single: vi.fn(async () => ({ data, error: null }))
	};
	query.select.mockReturnValue(query);
	query.eq.mockReturnValue(query);
	return query;
}

function eventFor(tab: string | null) {
	const userContextQuery = singleRowQuery(null);
	const userQuery = singleRowQuery({
		onboarding_completed_at: '2026-01-01T00:00:00.000Z',
		is_admin: false,
		voice_narration_enabled: false
	});
	const supabase = {
		from: vi.fn((table: string) => {
			if (table === 'user_context') return userContextQuery;
			if (table === 'users') return userQuery;
			throw new Error(`Unexpected table: ${table}`);
		})
	};
	const url = new URL('https://build-os.com/profile');
	if (tab) url.searchParams.set('tab', tab);

	return {
		locals: {
			safeGetSession: vi.fn(async () => ({
				user: {
					id: 'user-1',
					email: 'user@example.com',
					onboarding_completed_at: '2026-01-01T00:00:00.000Z'
				}
			})),
			supabase
		},
		url
	};
}

describe('profile Settings server load', () => {
	beforeEach(() => {
		isFeatureEnabled.mockReset();
	});

	it('falls back to Account when an unflagged user requests Cycles', async () => {
		isFeatureEnabled.mockResolvedValue(false);
		const { load } = await import('./+page.server');
		const result = await load(eventFor('cycles') as never);

		expect(result.activeTab).toBe('account');
		expect(result.cyclesProfileEnabled).toBe(false);
		expect(result.cyclesExecutionAuthority).toBe('preview');
	});

	it('allows a flagged user to deep-link to the read-only Cycles preview', async () => {
		isFeatureEnabled.mockResolvedValue(true);
		const { load } = await import('./+page.server');
		const result = await load(eventFor('cycles') as never);

		expect(result.activeTab).toBe('cycles');
		expect(result.cyclesProfileEnabled).toBe(true);
		expect(result.cyclesExecutionAuthority).toBe('preview');
	});

	it('keeps Brief Settings valid and rejects unknown destinations', async () => {
		isFeatureEnabled.mockResolvedValue(false);
		const { load } = await import('./+page.server');
		const briefs = await load(eventFor('briefs') as never);
		const unknown = await load(eventFor('coordinator') as never);

		expect(briefs.activeTab).toBe('briefs');
		expect(unknown.activeTab).toBe('account');
	});
});
