// apps/web/src/lib/server/consumption-billing.test.ts
import { describe, expect, it } from 'vitest';
import {
	classifyFrozenMutationCapability,
	isAllowedFrozenMutation,
	shouldGuardMutationForConsumptionBilling
} from './consumption-billing';

describe('consumption billing route guard', () => {
	it('classifies AI endpoints ahead of broader workspace prefixes', () => {
		expect(classifyFrozenMutationCapability('/api/agent/stream')).toBe('ai_compute');
	});

	it('classifies workspace write endpoints', () => {
		expect(classifyFrozenMutationCapability('/api/tasks/update')).toBe('workspace_write');
		expect(classifyFrozenMutationCapability('/api/notes')).toBe('workspace_write');
	});

	it('classifies unknown mutation endpoints as other', () => {
		expect(classifyFrozenMutationCapability('/api/some-other/write')).toBe('other_mutation');
	});

	it('allows Stripe and billing mutations while frozen', () => {
		expect(isAllowedFrozenMutation('/api/stripe/checkout')).toBe(true);
		expect(isAllowedFrozenMutation('/api/billing/context')).toBe(true);
		expect(isAllowedFrozenMutation('/api/account/settings')).toBe(true);
	});

	it('guards mutating API requests but not reads or cron routes', () => {
		expect(shouldGuardMutationForConsumptionBilling('/api/onto/projects', 'POST')).toBe(true);
		expect(shouldGuardMutationForConsumptionBilling('/api/notes', 'POST')).toBe(true);
		expect(shouldGuardMutationForConsumptionBilling('/api/onto/projects', 'GET')).toBe(false);
		expect(shouldGuardMutationForConsumptionBilling('/api/cron/dunning', 'POST')).toBe(false);
	});

	it('does not guard non-workspace/non-ai mutation endpoints', () => {
		expect(shouldGuardMutationForConsumptionBilling('/api/account/password', 'PUT')).toBe(
			false
		);
		expect(shouldGuardMutationForConsumptionBilling('/api/feedback', 'POST')).toBe(false);
	});
});
