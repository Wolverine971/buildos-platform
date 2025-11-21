// apps/web/src/lib/services/ontology/template-props-merger.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import {
	resolveAndMergeTemplateProps,
	deepMergeProps,
	extractFacetsFromProps,
	batchResolveAndMergeProps
} from './template-props-merger.service';

// Mock the template resolver
vi.mock('./template-resolver.service', () => ({
	resolveTemplateWithClient: vi.fn()
}));

import { resolveTemplateWithClient } from './template-resolver.service';

// Mock Supabase client
const mockSupabase = {} as TypedSupabaseClient;

describe('Template Props Merger Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('resolveAndMergeTemplateProps', () => {
		it('should return provided props when no type_key is given', async () => {
			const providedProps = { title: 'Test', status: 'active' };

			const result = await resolveAndMergeTemplateProps(
				mockSupabase,
				null,
				'task',
				providedProps
			);

			expect(result.mergedProps).toEqual(providedProps);
			expect(result.templateId).toBeUndefined();
			expect(result.templateDefaults).toEqual({});
		});

		it('should merge template defaults with provided props', async () => {
			const templateDefaults = {
				status: 'pending',
				priority: 'medium',
				tags: []
			};

			const providedProps = {
				title: 'Test Task',
				status: 'active', // Should override template default
				description: 'New field'
			};

			vi.mocked(resolveTemplateWithClient).mockResolvedValue({
				id: 'template-123',
				type_key: 'task.feature',
				scope: 'task',
				name: 'Feature Task',
				default_props: templateDefaults,
				schema: {},
				fsm_spec: {},
				metadata: {},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			} as any);

			const result = await resolveAndMergeTemplateProps(
				mockSupabase,
				'task.feature',
				'task',
				providedProps
			);

			expect(result.mergedProps).toEqual({
				status: 'active', // Provided prop overrides default
				priority: 'medium', // From template defaults
				tags: [], // From template defaults
				title: 'Test Task', // From provided props
				description: 'New field' // From provided props
			});
			expect(result.templateId).toBe('template-123');
			expect(result.templateDefaults).toEqual(templateDefaults);
		});

		it('should handle nested object merging correctly', async () => {
			const templateDefaults = {
				settings: {
					theme: 'light',
					notifications: true,
					privacy: 'public'
				},
				metadata: {
					version: '1.0'
				}
			};

			const providedProps = {
				settings: {
					theme: 'dark', // Override
					language: 'en' // New field
					// notifications not provided, should keep default
				},
				metadata: {
					version: '2.0',
					author: 'user'
				}
			};

			vi.mocked(resolveTemplateWithClient).mockResolvedValue({
				id: 'template-456',
				default_props: templateDefaults
			} as any);

			const result = await resolveAndMergeTemplateProps(
				mockSupabase,
				'doc.settings',
				'document',
				providedProps
			);

			expect(result.mergedProps).toEqual({
				settings: {
					theme: 'dark', // Overridden
					notifications: true, // Kept from default
					privacy: 'public', // Kept from default
					language: 'en' // Added from provided
				},
				metadata: {
					version: '2.0', // Overridden
					author: 'user' // Added
				}
			});
		});

		it('should handle template not found when skipIfNoTemplate is true', async () => {
			vi.mocked(resolveTemplateWithClient).mockRejectedValue(new Error('Template not found'));

			const providedProps = { title: 'Test' };

			const result = await resolveAndMergeTemplateProps(
				mockSupabase,
				'non.existent',
				'task',
				providedProps,
				true // skipIfNoTemplate
			);

			expect(result.mergedProps).toEqual(providedProps);
			expect(result.templateId).toBeUndefined();
			expect(result.templateDefaults).toEqual({});
		});

		it('should throw error when template not found and skipIfNoTemplate is false', async () => {
			vi.mocked(resolveTemplateWithClient).mockRejectedValue(
				new Error('Template not found: task.missing')
			);

			await expect(
				resolveAndMergeTemplateProps(
					mockSupabase,
					'task.missing',
					'task',
					{},
					false // skipIfNoTemplate
				)
			).rejects.toThrow('Template not found: task.missing');
		});

		it('should handle empty template default_props', async () => {
			vi.mocked(resolveTemplateWithClient).mockResolvedValue({
				id: 'template-789',
				default_props: null // or undefined
			} as any);

			const providedProps = { title: 'Test' };

			const result = await resolveAndMergeTemplateProps(
				mockSupabase,
				'task.simple',
				'task',
				providedProps
			);

			expect(result.mergedProps).toEqual(providedProps);
			expect(result.templateDefaults).toEqual({});
		});
	});

	describe('deepMergeProps', () => {
		it('should merge multiple objects deeply', () => {
			const obj1 = { a: 1, b: { c: 2, d: 3 } };
			const obj2 = { b: { d: 4, e: 5 }, f: 6 };
			const obj3 = { b: { e: 7 }, g: 8 };

			const result = deepMergeProps(obj1, obj2, obj3);

			expect(result).toEqual({
				a: 1,
				b: {
					c: 2,
					d: 4, // From obj2
					e: 7 // From obj3
				},
				f: 6,
				g: 8
			});
		});

		it('should handle arrays by replacing them', () => {
			const obj1 = { items: [1, 2, 3], tags: ['a', 'b'] };
			const obj2 = { items: [4, 5], tags: ['c'] };

			const result = deepMergeProps(obj1, obj2);

			expect(result).toEqual({
				items: [4, 5], // Replaced, not merged
				tags: ['c'] // Replaced, not merged
			});
		});

		it('should handle null and undefined values', () => {
			const obj1 = { a: 1, b: null, c: 'test' };
			const obj2 = { b: 2, c: undefined, d: null };

			const result = deepMergeProps(obj1, obj2);

			expect(result).toEqual({
				a: 1,
				b: 2, // null replaced with value
				c: undefined, // Explicitly set to undefined
				d: null
			});
		});

		it('should handle Date objects and other non-plain objects', () => {
			const date1 = new Date('2024-01-01');
			const date2 = new Date('2024-02-01');

			const obj1 = { created: date1, meta: { version: 1 } };
			const obj2 = { created: date2, meta: { build: 100 } };

			const result = deepMergeProps(obj1, obj2);

			expect(result.created).toBe(date2); // Date replaced, not merged
			expect(result.meta).toEqual({ version: 1, build: 100 }); // Plain object merged
		});

		it('should handle empty objects', () => {
			const result = deepMergeProps({}, { a: 1 }, {}, { b: 2 });

			expect(result).toEqual({ a: 1, b: 2 });
		});

		it('should skip non-object sources', () => {
			const result = deepMergeProps(
				{ a: 1 },
				null as any,
				undefined as any,
				{ b: 2 },
				'string' as any,
				123 as any
			);

			expect(result).toEqual({ a: 1, b: 2 });
		});
	});

	describe('extractFacetsFromProps', () => {
		it('should extract facets from props', () => {
			const props = {
				title: 'Test',
				facets: {
					priority: 'high',
					category: 'feature'
				},
				description: 'Test description'
			};

			const result = extractFacetsFromProps(props);

			expect(result.facets).toEqual({
				priority: 'high',
				category: 'feature'
			});
			expect(result.propsWithoutFacets).toEqual({
				title: 'Test',
				description: 'Test description'
			});
		});

		it('should handle props without facets', () => {
			const props = {
				title: 'Test',
				description: 'Test description'
			};

			const result = extractFacetsFromProps(props);

			expect(result.facets).toBeUndefined();
			expect(result.propsWithoutFacets).toEqual(props);
		});

		it('should handle invalid facets (array instead of object)', () => {
			const props = {
				title: 'Test',
				facets: ['not', 'an', 'object'] as any
			};

			const result = extractFacetsFromProps(props);

			expect(result.facets).toBeUndefined();
			expect(result.propsWithoutFacets).toEqual({
				title: 'Test'
				// facets should be removed since it's invalid
			});
		});

		it('should handle null/undefined facets', () => {
			const props = {
				title: 'Test',
				facets: null as any
			};

			const result = extractFacetsFromProps(props);

			expect(result.facets).toBeUndefined();
			expect(result.propsWithoutFacets).toEqual({
				title: 'Test'
				// facets should be removed since it's null
			});
		});
	});

	describe('batchResolveAndMergeProps', () => {
		it('should process multiple entities in batch', async () => {
			const entities = [
				{ id: '1', type_key: 'task.feature', props: { title: 'Task 1' } },
				{ id: '2', type_key: 'task.bug', props: { title: 'Task 2', priority: 'high' } },
				{ id: '3', props: { title: 'Task 3' } } // No type_key
			];

			vi.mocked(resolveTemplateWithClient)
				.mockResolvedValueOnce({
					id: 'template-1',
					default_props: { status: 'pending', priority: 'medium' }
				} as any)
				.mockResolvedValueOnce({
					id: 'template-2',
					default_props: { status: 'open', severity: 'normal' }
				} as any);

			const results = await batchResolveAndMergeProps(mockSupabase, entities, 'task');

			expect(results).toHaveLength(3);

			// First entity
			expect(results[0]).toMatchObject({
				id: '1',
				type_key: 'task.feature',
				mergedProps: {
					title: 'Task 1',
					status: 'pending',
					priority: 'medium'
				}
			});

			// Second entity
			expect(results[1]).toMatchObject({
				id: '2',
				type_key: 'task.bug',
				mergedProps: {
					title: 'Task 2',
					priority: 'high', // Overridden
					status: 'open',
					severity: 'normal'
				}
			});

			// Third entity (no type_key)
			expect(results[2]).toMatchObject({
				id: '3',
				mergedProps: {
					title: 'Task 3'
				}
			});
		});

		it('should handle errors with skipIfNoTemplate option', async () => {
			const entities = [{ id: '1', type_key: 'task.missing', props: { title: 'Task 1' } }];

			vi.mocked(resolveTemplateWithClient).mockRejectedValue(new Error('Template not found'));

			const results = await batchResolveAndMergeProps(
				mockSupabase,
				entities,
				'task',
				true // skipIfNoTemplate
			);

			expect(results).toHaveLength(1);
			expect(results[0].mergedProps).toEqual({ title: 'Task 1' });
		});

		it('should handle empty entity array', async () => {
			const results = await batchResolveAndMergeProps(mockSupabase, [], 'task');

			expect(results).toEqual([]);
			expect(resolveTemplateWithClient).not.toHaveBeenCalled();
		});

		it('should preserve all original entity properties', async () => {
			const entities = [
				{
					id: '1',
					type_key: 'task.feature',
					props: { title: 'Task 1' },
					custom_field: 'custom_value',
					metadata: { source: 'test' }
				}
			];

			vi.mocked(resolveTemplateWithClient).mockResolvedValue({
				id: 'template-1',
				default_props: { status: 'pending' }
			} as any);

			const results = await batchResolveAndMergeProps(mockSupabase, entities, 'task');

			expect(results[0]).toMatchObject({
				id: '1',
				type_key: 'task.feature',
				custom_field: 'custom_value',
				metadata: { source: 'test' },
				mergedProps: {
					title: 'Task 1',
					status: 'pending'
				}
			});
		});
	});
});
