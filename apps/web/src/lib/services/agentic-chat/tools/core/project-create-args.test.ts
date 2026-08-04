// apps/web/src/lib/services/agentic-chat/tools/core/project-create-args.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeProjectCreateArgs, validateProjectCreateArgs } from './project-create-args';

describe('project create argument normalization', () => {
	it('hoists nested entities and relationships without mutating the model payload', () => {
		const args = {
			project: {
				name: 'Christian School Launch',
				type_key: 'project.nonprofit.school_launch',
				entities: [
					{ temp_id: 'goal-1', kind: 'goal', name: 'Validate demand' },
					{ temp_id: 'task-1', kind: 'task', title: 'Interview parents' }
				],
				relationships: [
					{
						from: { temp_id: 'goal-1', kind: 'goal' },
						to: { temp_id: 'task-1', kind: 'task' },
						rel: 'contains'
					}
				]
			}
		};

		const normalized = normalizeProjectCreateArgs(args);

		expect(normalized).not.toBe(args);
		expect(normalized.project).not.toHaveProperty('entities');
		expect(normalized.project).not.toHaveProperty('relationships');
		expect(normalized.entities).toEqual(args.project.entities);
		expect(normalized.relationships).toEqual(args.project.relationships);
		expect(args.project).toHaveProperty('entities');
		expect(args.project).toHaveProperty('relationships');
		expect(validateProjectCreateArgs(normalized)).toEqual([]);
	});

	it('prefers a populated nested collection over an empty top-level default', () => {
		const normalized = normalizeProjectCreateArgs({
			project: {
				name: 'Launch',
				type_key: 'project.business.launch',
				entities: [{ temp_id: 'goal-1', kind: 'goal', name: 'Launch well' }],
				relationships: []
			},
			entities: [],
			relationships: []
		});

		expect(normalized.entities).toEqual([
			{ temp_id: 'goal-1', kind: 'goal', name: 'Launch well' }
		]);
		expect(normalized.project).not.toHaveProperty('entities');
		expect(normalized.project).not.toHaveProperty('relationships');
	});

	it('rejects conflicting non-empty top-level and nested collections', () => {
		const args = {
			project: {
				name: 'Launch',
				type_key: 'project.business.launch',
				entities: [{ temp_id: 'nested-goal', kind: 'goal', name: 'Nested goal' }]
			},
			entities: [{ temp_id: 'top-goal', kind: 'goal', name: 'Top-level goal' }],
			relationships: []
		};

		const normalized = normalizeProjectCreateArgs(args);
		const errors = validateProjectCreateArgs(normalized);

		expect(normalized.project).toHaveProperty('entities');
		expect(errors).toContain(
			'Conflicting parameters: entities and project.entities contain different non-empty arrays. Keep the intended value only at top-level entities.'
		);
	});

	it('rejects conflicting non-empty top-level and nested relationships', () => {
		const entities = [
			{ temp_id: 'goal-1', kind: 'goal', name: 'Launch well' },
			{ temp_id: 'task-1', kind: 'task', title: 'Prepare launch' }
		];
		const errors = validateProjectCreateArgs({
			project: {
				name: 'Launch',
				type_key: 'project.business.launch',
				relationships: [{ from: 'goal-1', to: 'task-1', rel: 'contains' }]
			},
			entities,
			relationships: [{ from: 'task-1', to: 'goal-1', rel: 'supports' }]
		});

		expect(errors).toContain(
			'Conflicting parameters: relationships and project.relationships contain different non-empty arrays. Keep the intended value only at top-level relationships.'
		);
	});

	it('rejects genuinely missing graph collections instead of inventing empty arrays', () => {
		const errors = validateProjectCreateArgs({
			project: {
				name: 'Launch',
				type_key: 'project.business.launch'
			}
		});

		expect(errors).toContain('Missing required parameter: entities');
		expect(errors).toContain('Missing required parameter: relationships');
	});
});
