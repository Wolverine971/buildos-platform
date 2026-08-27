// packages/shared-types/src/project-graph-context.types.test.ts
import { describe, expect, it } from 'vitest';
import type { Json } from './database.types';
import { parseProjectGraphContext } from './project-graph-context.types';

const validContext: Json = {
	project: {
		id: 'project-1',
		name: 'Project',
		description: null,
		type_key: 'project',
		state_key: 'active',
		facet_context: null,
		facet_scale: null,
		facet_stage: null,
		start_at: null,
		end_at: null,
		next_step_short: null,
		next_step_long: null,
		created_at: '2026-08-26T00:00:00.000Z',
		updated_at: '2026-08-26T00:00:00.000Z'
	},
	tasks: [],
	goals: [],
	plans: [],
	milestones: [],
	risks: [],
	documents: [],
	requirements: [],
	signals: [],
	insights: [],
	edges: []
};

describe('project graph context RPC decoder', () => {
	it('accepts the SQL projection and preserves its typed project identity', () => {
		const context = parseProjectGraphContext(validContext);
		expect(context.project.id).toBe('project-1');
		expect(context.tasks).toEqual([]);
	});

	it('surfaces projection drift instead of silently replacing malformed arrays', () => {
		const malformed: Json = { ...validContext, tasks: null };
		expect(() => parseProjectGraphContext(malformed)).toThrow('tasks must be a JSON array');
	});
});
