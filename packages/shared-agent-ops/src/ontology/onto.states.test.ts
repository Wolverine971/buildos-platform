// packages/shared-agent-ops/src/ontology/onto.states.test.ts
import { describe, expect, it } from 'vitest';
import { isProjectOperationalState, PROJECT_OPERATIONAL_STATES } from './onto';

describe('project operational state policy', () => {
	it('keeps planning and active projects eligible for live maintenance', () => {
		expect(PROJECT_OPERATIONAL_STATES).toEqual(['planning', 'active']);
		expect(isProjectOperationalState('planning')).toBe(true);
		expect(isProjectOperationalState('active')).toBe(true);
	});

	it.each(['paused', 'completed', 'cancelled', 'archived', null, undefined])(
		'rejects non-operational state %s',
		(state) => {
			expect(isProjectOperationalState(state)).toBe(false);
		}
	);
});
