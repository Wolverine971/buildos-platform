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
				type_key: 'writer.book',
				props: {
					facets: {
						context: 'commercial'
					}
				}
			}
		});

		expect(valid).toBe(true);
		expect(errors).toHaveLength(0);
	});

	it('collects errors for invalid spec', () => {
		const { valid, errors } = validateProjectSpec({
			project: {
				name: '',
				type_key: 'INVALID_KEY'
			}
		});

		expect(valid).toBe(false);
		expect(errors.length).toBeGreaterThan(0);
	});
});
