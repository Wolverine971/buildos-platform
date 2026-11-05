// apps/web/src/lib/server/consumption-billing.test.ts
import { describe, expect, it } from 'vitest';
import {
	classifyFrozenMutationCapability,
	shouldGuardMutationForConsumptionBilling
} from './consumption-billing';

const RUN = '0b6f2f1e-1c1d-4f7a-9a51-2f7c3a1d9e10';

describe('frozen-account spend gate', () => {
	it.each([
		'/api/agent-runs',
		`/api/agent-runs/${RUN}/answer`,
		`/api/agent-runs/${RUN}/resume`,
		`/api/agent-runs/${RUN}/steer`,
		`/api/agent-operatives/${RUN}/run`,
		`/api/cycles/${RUN}/run`
	])('treats %s as AI spend', (path) => {
		expect(classifyFrozenMutationCapability(path)).toBe('ai_compute');
		expect(shouldGuardMutationForConsumptionBilling(path, 'POST')).toBe(true);
	});

	it.each([
		`/api/agent-runs/${RUN}/cancel`,
		`/api/agent-runs/${RUN}/pause`,
		`/api/agent-runs/${RUN}/commit`,
		`/api/agent-operatives/${RUN}`,
		`/api/cycles/${RUN}`
	])('lets a frozen account still stop or edit things: %s', (path) => {
		expect(classifyFrozenMutationCapability(path)).toBe('other_mutation');
	});

	it('ignores reads', () => {
		expect(shouldGuardMutationForConsumptionBilling('/api/agent-runs', 'GET')).toBe(false);
	});
});
