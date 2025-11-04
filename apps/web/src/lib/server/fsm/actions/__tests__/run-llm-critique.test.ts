// apps/web/src/lib/server/fsm/actions/__tests__/run-llm-critique.test.ts
import { describe, it, expect } from 'vitest';
import {
	buildCritiquePayload,
	type CritiqueChecklistItem
} from '$lib/server/fsm/actions/run-llm-critique';

const makeOutput = (overrides: Partial<any> = {}) => ({
	id: 'output-1',
	name: 'Sample Output',
	state_key: 'draft',
	type_key: 'output.article',
	project_id: 'project-1',
	props: {
		content: '<p>TODO: add content</p>',
		word_count: 0
	},
	...overrides
});

describe('run_llm_critique helpers', () => {
	it('builds critique with checklist items', () => {
		const payload = buildCritiquePayload(makeOutput(), {
			rubricKey: 'research-quality',
			actorId: 'actor-1',
			userId: 'user-1'
		});

		expect(payload.rubric_key).toBe('research-quality');
		expect(payload.summary).toContain('Sample Output');
		expect(payload.actor_id).toBe('actor-1');
		expect(payload.user_id).toBe('user-1');

		const states = payload.checklist.map((item: CritiqueChecklistItem) => item.label);
		expect(states).toContain('State Review');
		expect(states).toContain('Content Quality');
	});

	it('flags outputs missing content', () => {
		const payload = buildCritiquePayload(
			makeOutput({
				state_key: 'approved',
				props: {}
			})
		);

		const contentItem = payload.checklist.find((item) => item.label === 'Content Quality');
		expect(contentItem?.status).toBe('warn');
		expect(payload.summary).toContain('default');
	});
});
