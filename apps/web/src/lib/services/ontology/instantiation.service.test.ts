// apps/web/src/lib/services/ontology/instantiation.service.test.ts
import { describe, expect, it } from 'vitest';
import { resolveFacets, validateProjectSpec } from './instantiation.service';

describe('resolveFacets', () => {
	it('applies template defaults when spec facets are missing', () => {
		const result = resolveFacets(
			{
				context: 'commercial',
				scale: 'medium',
				stage: 'planning'
			},
			undefined
		);

		expect(result).toEqual({
			context: 'commercial',
			scale: 'medium',
			stage: 'planning'
		});
	});

	it('lets spec facets override template defaults', () => {
		const result = resolveFacets(
			{
				context: 'commercial',
				scale: 'small',
				stage: 'planning'
			},
			{
				context: 'startup',
				scale: 'large'
			}
		);

		expect(result).toEqual({
			context: 'startup',
			scale: 'large',
			stage: 'planning'
		});
	});

	it('only returns defined keys', () => {
		const result = resolveFacets(undefined, { scale: 'micro' });
		expect(result).toEqual({ scale: 'micro' });
	});
});

describe('validateProjectSpec', () => {
	it('returns valid when spec matches schema', () => {
		const { valid, errors } = validateProjectSpec({
			project: {
				name: 'Test Project',
				type_key: 'project.creative.book',
				props: {
					facets: {
						context: 'commercial'
					}
				}
			},
			entities: [],
			relationships: []
		});

		expect(valid).toBe(true);
		expect(errors).toHaveLength(0);
	});

	it('collects errors for invalid spec', () => {
		const { valid, errors } = validateProjectSpec({
			project: {
				name: '',
				type_key: 'INVALID_KEY'
			},
			entities: [],
			relationships: []
		});

		expect(valid).toBe(false);
		expect(errors.length).toBeGreaterThan(0);
	});

	it('rejects legacy arrays', () => {
		const { valid, errors } = validateProjectSpec({
			project: {
				name: 'Legacy Test',
				type_key: 'project.creative.book'
			},
			entities: [],
			relationships: [],
			goals: [{ name: 'Legacy goal' }]
		});

		expect(valid).toBe(false);
		expect(errors.some((error) => error.includes('Legacy ProjectSpec field "goals"'))).toBe(
			true
		);
	});

	it('requires relationships when multiple entities exist', () => {
		const { valid, errors } = validateProjectSpec({
			project: {
				name: 'Relationship Test',
				type_key: 'project.creative.book'
			},
			entities: [
				{ temp_id: 'goal-1', kind: 'goal', name: 'Goal 1' },
				{ temp_id: 'task-1', kind: 'task', title: 'Task 1' }
			],
			relationships: []
		});

		expect(valid).toBe(false);
		expect(
			errors.some((error) => error.includes('relationships must include at least one pair'))
		).toBe(true);
	});
});
