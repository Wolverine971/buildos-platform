// apps/web/src/lib/tests/agentic-e2e/open-brief/fixtures.test.ts
import { describe, expect, it } from 'vitest';

import {
	buildOpenBriefProjectSpec,
	buildProjectBetaNoDirectionSnapshot,
	openBriefProjectAlpha,
	openBriefProjectBeta,
	resolveOpenBriefSnapshot
} from './fixtures';

describe('open-brief control fixtures', () => {
	it('loads both frozen snapshots and maps their different plan shapes into project specs', () => {
		const alpha = buildOpenBriefProjectSpec(openBriefProjectAlpha, 'alpha');
		const beta = buildOpenBriefProjectSpec(openBriefProjectBeta, 'beta');
		expect(alpha.entities.filter((entity) => entity.kind === 'task')).toHaveLength(11);
		expect(beta.entities.filter((entity) => entity.kind === 'task')).toHaveLength(11);
		expect(
			beta.entities.find(
				(entity) => entity.kind === 'plan' && entity.name === '30-Day User Launch Campaign'
			)
		).toMatchObject({ kind: 'plan', state_key: 'draft' });
	});

	it('removes every standing direction surface from the blocked-control variant', () => {
		const stripped = buildProjectBetaNoDirectionSnapshot();
		expect(stripped.documents).toEqual([]);
		expect(stripped.goals).toEqual([]);
		expect(stripped.plans).toEqual([]);
		expect(stripped.edges).toEqual([]);
		expect(stripped.project).not.toHaveProperty('non_goals');
		expect(stripped.project).not.toHaveProperty('now');
		expect(JSON.stringify(stripped)).not.toContain('Marketing Strategy');
		expect(JSON.stringify(stripped)).not.toContain('authors and video creators');
	});

	it('refuses an unregistered post-hoc snapshot id', () => {
		expect(() => resolveOpenBriefSnapshot('project-gamma')).toThrow(
			'Unknown open-brief snapshot'
		);
	});
});
