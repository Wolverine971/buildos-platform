// apps/worker/tests/changeSetCoverage.test.ts
//
// Phase 4 coverage guard (02 §7 "Coverage"): every write op the policy knows
// about must be either stage+commit supported by the worker (a non-calendar op
// with a gateway handler, present in AGENT_OP_WRITE_CATALOG) or explicitly
// excluded (calendar ops, deferred until the worker wires a CalendarPort).
// This fails loudly if a new write op is added without a worker handler or
// categorization, rather than silently proposing changes that can't be applied.
import { describe, expect, it } from 'vitest';
import { BUILDOS_AGENT_WRITE_OPS } from '@buildos/shared-types';
import { AGENT_OP_WRITE_CATALOG } from '@buildos/shared-agent-ops';

describe('Phase 4 — write-op stage/commit coverage', () => {
	it('every non-calendar write op is stage+commit supported (has a worker handler)', () => {
		const unsupported = BUILDOS_AGENT_WRITE_OPS.filter(
			(op) => !op.startsWith('cal.') && !AGENT_OP_WRITE_CATALOG.includes(op)
		);
		expect(unsupported).toEqual([]);
	});

	it('calendar write ops are explicitly excluded from the worker catalog (deferred to CalendarPort)', () => {
		const calIncluded = BUILDOS_AGENT_WRITE_OPS.filter(
			(op) => op.startsWith('cal.') && AGENT_OP_WRITE_CATALOG.includes(op)
		);
		expect(calIncluded).toEqual([]);
	});

	it('the worker write catalog contains only known policy write ops', () => {
		const known = new Set<string>(BUILDOS_AGENT_WRITE_OPS);
		const unknown = AGENT_OP_WRITE_CATALOG.filter((op) => !known.has(op));
		expect(unknown).toEqual([]);
	});

	it('the write catalog is non-empty (writes are actually wired)', () => {
		expect(AGENT_OP_WRITE_CATALOG.length).toBeGreaterThan(0);
	});
});
