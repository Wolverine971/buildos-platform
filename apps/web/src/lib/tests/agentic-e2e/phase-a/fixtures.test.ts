// apps/web/src/lib/tests/agentic-e2e/phase-a/fixtures.test.ts
import { describe, expect, it } from 'vitest';

import { buildPhaseAProjectSpec, frozenPhaseACorpus, phaseAProjectSnapshot } from './fixtures';

describe('Phase A control fixtures', () => {
	it('loads the eight frozen scenarios', () => {
		expect(frozenPhaseACorpus.status).toBe('frozen');
		expect(frozenPhaseACorpus.scenarios).toHaveLength(8);
	});

	it('maps the shared snapshot into a production ProjectSpec without losing entities', () => {
		const spec = buildPhaseAProjectSpec('fixture-test');
		expect(spec.entities).toHaveLength(
			phaseAProjectSnapshot.tasks.length +
				phaseAProjectSnapshot.documents.length +
				phaseAProjectSnapshot.goals.length +
				phaseAProjectSnapshot.plans.length
		);
		expect(spec.relationships).toHaveLength(phaseAProjectSnapshot.edges.length);
		expect(spec.project.description).toContain(phaseAProjectSnapshot.project.next_step);
	});
});
