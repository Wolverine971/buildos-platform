// apps/web/src/lib/services/ontology/template-validation.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TemplateData } from './template-validation.service';

// Mock data
const mockTemplates = [
	{
		id: 'tpl-1',
		type_key: 'task.base',
		name: 'Base Task',
		scope: 'task',
		status: 'active',
		parent_template_id: null
	},
	{
		id: 'tpl-2',
		type_key: 'task.quick',
		name: 'Quick Task',
		scope: 'task',
		status: 'active',
		parent_template_id: 'tpl-1'
	},
	{
		id: 'tpl-3',
		type_key: 'task.deep_work',
		name: 'Deep Work Task',
		scope: 'task',
		status: 'active',
		parent_template_id: 'tpl-1'
	}
];

const mockFacetValues = [
	{ facet_key: 'context', value: 'personal' },
	{ facet_key: 'context', value: 'client' },
	{ facet_key: 'context', value: 'commercial' },
	{ facet_key: 'scale', value: 'micro' },
	{ facet_key: 'scale', value: 'small' },
	{ facet_key: 'scale', value: 'medium' },
	{ facet_key: 'stage', value: 'planning' },
	{ facet_key: 'stage', value: 'execution' },
	{ facet_key: 'stage', value: 'review' }
];

const mockProjects: any[] = [];

// Mock Supabase client
function createMockClient() {
	let templates = [...mockTemplates];

	class QueryBuilder {
		private tableName: string;
		private filters: Array<{ field: string; value: unknown; op: string }> = [];
		private selectColumns: string = '*';
		private limitValue: number | null = null;
		private isSingle = false;

		constructor(table: string) {
			this.tableName = table;
		}

		select(columns: string = '*') {
			this.selectColumns = columns;
			// Make select() thenable so it can be awaited directly
			return this;
		}

		eq(field: string, value: unknown) {
			this.filters.push({ field, value, op: 'eq' });
			return this;
		}

		limit(count: number) {
			this.limitValue = count;
			return this;
		}

		single() {
			this.isSingle = true;
			return this.execute();
		}

		// Make the QueryBuilder thenable so it can be awaited
		then(resolve: any, reject?: any) {
			return this.execute().then(resolve, reject);
		}

		async execute() {
			let results: any[] = [];

			if (this.tableName === 'onto_templates') {
				results = [...templates];
			} else if (this.tableName === 'onto_facet_values') {
				results = [...mockFacetValues];
			} else if (this.tableName === 'onto_projects') {
				results = [...mockProjects];
			}

			// Apply filters
			for (const filter of this.filters) {
				results = results.filter((row) => {
					if (filter.op === 'eq') {
						return row[filter.field] === filter.value;
					}
					return true;
				});
			}

			// Apply limit
			if (this.limitValue !== null) {
				results = results.slice(0, this.limitValue);
			}

			// Return single or array
			if (this.isSingle) {
				if (results.length === 0) {
					return {
						data: null,
						error: { code: 'PGRST116', message: 'No rows returned' }
					};
				}
				return { data: results[0], error: null };
			}

			return { data: results, error: null };
		}
	}

	return {
		from(table: string) {
			return new QueryBuilder(table);
		},
		// For mocking inserts/updates in CRUD tests
		__setTemplates(newTemplates: any[]) {
			templates = newTemplates;
		}
	};
}

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: () => createMockClient()
}));

import { TemplateValidationService } from './template-validation.service';

describe('TemplateValidationService', () => {
	let mockClient: any;

	beforeEach(() => {
		mockClient = createMockClient();
		mockProjects.length = 0;
	});

	describe('validateBasicFields', () => {
		it.skip('passes validation for valid template data', async () => {
			const data: TemplateData = {
				type_key: 'task.new_type',
				name: 'New Task Type',
				scope: 'task',
				status: 'draft'
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);

			// If this fails, the error will show what validation errors exist
			expect(result.errors).toHaveLength(0);
			expect(result.valid).toBe(true);
		});

		it('fails when name is missing', async () => {
			const data: TemplateData = {
				type_key: 'task.test',
				name: '',
				scope: 'task',
				status: 'draft'
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'name',
					code: 'REQUIRED_FIELD'
				})
			);
		});

		it('fails when name exceeds 200 characters', async () => {
			const data: TemplateData = {
				type_key: 'task.test',
				name: 'a'.repeat(201),
				scope: 'task',
				status: 'draft'
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'name',
					code: 'MAX_LENGTH'
				})
			);
		});

		it('fails when type_key is missing', async () => {
			const data: TemplateData = {
				type_key: '',
				name: 'Test Template',
				scope: 'task',
				status: 'draft'
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'type_key',
					code: 'REQUIRED_FIELD'
				})
			);
		});

		it('fails when type_key has invalid format', async () => {
			const invalidKeys = ['Task.Base', 'task_base', 'task..base', 'task.123', '1task.base'];

			for (const typeKey of invalidKeys) {
				const data: TemplateData = {
					type_key: typeKey,
					name: 'Test Template',
					scope: 'task',
					status: 'draft'
				};

				const result = await TemplateValidationService.validateTemplate(mockClient, data);
				expect(result.valid).toBe(false);
				expect(result.errors).toContainEqual(
					expect.objectContaining({
						field: 'type_key',
						code: 'INVALID_FORMAT'
					})
				);
			}
		});

		it('passes when type_key has valid format', async () => {
			const validKeys = [
				'task.base',
				'creative.writing.novel',
				'coach.client',
				'developer.app'
			];

			for (const typeKey of validKeys) {
				const data: TemplateData = {
					type_key: typeKey,
					name: 'Test Template',
					scope: 'task',
					status: 'draft'
				};

				const result = await TemplateValidationService.validateTemplate(mockClient, data);
				// Should not have format errors
				expect(result.errors.some((e) => e.code === 'INVALID_FORMAT')).toBe(false);
			}
		});

		it('fails when scope is invalid', async () => {
			const data: TemplateData = {
				type_key: 'test.template',
				name: 'Test',
				scope: 'invalid_scope',
				status: 'draft'
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'scope',
					code: 'INVALID_VALUE'
				})
			);
		});

		it('fails when status is invalid', async () => {
			const data: TemplateData = {
				type_key: 'test.template',
				name: 'Test',
				scope: 'task',
				status: 'invalid_status'
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'status',
					code: 'INVALID_VALUE'
				})
			);
		});
	});

	describe('validateTypeKeyUnique', () => {
		it('fails when type_key already exists (creating new)', async () => {
			const data: TemplateData = {
				type_key: 'task.base', // Already exists in mock data
				name: 'Duplicate Template',
				scope: 'task',
				status: 'draft'
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'type_key',
					code: 'DUPLICATE_TYPE_KEY'
				})
			);
		});

		it('passes when type_key is unique', async () => {
			const data: TemplateData = {
				type_key: 'task.brand_new',
				name: 'Brand New Template',
				scope: 'task',
				status: 'draft'
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			// Should not have duplicate errors
			expect(result.errors.some((e) => e.code === 'DUPLICATE_TYPE_KEY')).toBe(false);
		});

		it('passes when updating existing template with same type_key', async () => {
			const data: TemplateData = {
				type_key: 'task.base',
				name: 'Updated Base Task',
				scope: 'task',
				status: 'active'
			};

			const result = await TemplateValidationService.validateTemplate(
				mockClient,
				data,
				'tpl-1' // Existing template ID
			);

			// Should not have duplicate errors when updating same template
			expect(result.errors.some((e) => e.code === 'DUPLICATE_TYPE_KEY')).toBe(false);
		});
	});

	describe('validateParentTemplate', () => {
		it('fails when parent template does not exist', async () => {
			const data: TemplateData = {
				type_key: 'task.orphan',
				name: 'Orphan Task',
				scope: 'task',
				status: 'draft',
				parent_template_id: 'non-existent-id'
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'parent_template_id',
					code: 'INVALID_PARENT'
				})
			);
		});

		it('passes when parent template exists', async () => {
			const data: TemplateData = {
				type_key: 'task.child',
				name: 'Child Task',
				scope: 'task',
				status: 'draft',
				parent_template_id: 'tpl-1' // Valid parent
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			// Should not have parent errors
			expect(result.errors.some((e) => e.field === 'parent_template_id')).toBe(false);
		});

		it('detects circular parent relationships', async () => {
			// Try to make tpl-1 a child of tpl-2 (which is already a child of tpl-1)
			const data: TemplateData = {
				type_key: 'task.base',
				name: 'Base Task',
				scope: 'task',
				status: 'active',
				parent_template_id: 'tpl-2' // Circular: tpl-1 -> tpl-2 -> tpl-1
			};

			const result = await TemplateValidationService.validateTemplate(
				mockClient,
				data,
				'tpl-1' // Updating tpl-1
			);

			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'parent_template_id',
					code: 'CIRCULAR_PARENT'
				})
			);
		});
	});

	describe('validateFSM', () => {
		it('passes with valid FSM structure', async () => {
			const data: TemplateData = {
				type_key: 'task.fsm_test',
				name: 'FSM Test',
				scope: 'task',
				status: 'draft',
				fsm: {
					states: ['draft', 'active', 'complete'],
					transitions: [
						{ from: 'draft', to: 'active', event: 'start' },
						{ from: 'active', to: 'complete', event: 'finish' }
					]
				}
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			// Should not have FSM errors
			expect(result.errors.some((e) => e.field.startsWith('fsm'))).toBe(false);
		});

		it('fails when FSM is not an object', async () => {
			const data: TemplateData = {
				type_key: 'task.test',
				name: 'Test',
				scope: 'task',
				status: 'draft',
				fsm: 'invalid' as any
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'fsm',
					code: 'INVALID_TYPE'
				})
			);
		});

		it('fails when FSM has no states', async () => {
			const data: TemplateData = {
				type_key: 'task.test',
				name: 'Test',
				scope: 'task',
				status: 'draft',
				fsm: {
					states: [],
					transitions: []
				}
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'fsm.states',
					code: 'MIN_LENGTH'
				})
			);
		});

		it('fails when FSM contains empty state names', async () => {
			const data: TemplateData = {
				type_key: 'task.test',
				name: 'Test',
				scope: 'task',
				status: 'draft',
				fsm: {
					states: ['draft', ''],
					transitions: []
				}
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'fsm.states',
					code: 'INVALID_STATE_NAME'
				})
			);
		});

		it('fails when FSM has duplicate state names', async () => {
			const data: TemplateData = {
				type_key: 'task.test',
				name: 'Test',
				scope: 'task',
				status: 'draft',
				fsm: {
					states: ['draft', 'draft'],
					transitions: []
				}
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'fsm.states',
					code: 'DUPLICATE_STATE_NAME'
				})
			);
		});

		it('fails when transition references non-existent state', async () => {
			const data: TemplateData = {
				type_key: 'task.test',
				name: 'Test',
				scope: 'task',
				status: 'draft',
				fsm: {
					states: ['draft', 'active'],
					transitions: [{ from: 'draft', to: 'nonexistent', event: 'go' }]
				}
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'fsm.transitions',
					code: 'INVALID_STATE_REFERENCE'
				})
			);
		});

		it('fails when transition is missing required fields', async () => {
			const data: TemplateData = {
				type_key: 'task.test',
				name: 'Test',
				scope: 'task',
				status: 'draft',
				fsm: {
					states: ['draft'],
					transitions: [{ from: 'draft' } as any] // Missing to and event
				}
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'fsm.transitions',
					code: 'INVALID_TRANSITION'
				})
			);
		});
	});

	describe('validateJsonSchema', () => {
		it('passes with valid JSON Schema', async () => {
			const data: TemplateData = {
				type_key: 'task.test',
				name: 'Test',
				scope: 'task',
				status: 'draft',
				schema: {
					type: 'object',
					properties: {
						title: { type: 'string' },
						priority: { type: 'number' }
					},
					required: ['title']
				}
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			// Should not have schema errors
			expect(result.errors.some((e) => e.field.startsWith('schema'))).toBe(false);
		});

		it('fails when schema is not an object', async () => {
			const data: TemplateData = {
				type_key: 'task.test',
				name: 'Test',
				scope: 'task',
				status: 'draft',
				schema: 'invalid' as any
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'schema',
					code: 'INVALID_TYPE'
				})
			);
		});

		it('fails when schema type is not "object"', async () => {
			const data: TemplateData = {
				type_key: 'task.test',
				name: 'Test',
				scope: 'task',
				status: 'draft',
				schema: {
					type: 'string',
					properties: {}
				}
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'schema.type',
					code: 'INVALID_SCHEMA_TYPE'
				})
			);
		});

		it('fails when property is missing type', async () => {
			const data: TemplateData = {
				type_key: 'task.test',
				name: 'Test',
				scope: 'task',
				status: 'draft',
				schema: {
					type: 'object',
					properties: {
						title: {} // Missing type
					}
				}
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'schema.properties.title',
					code: 'MISSING_PROPERTY_TYPE'
				})
			);
		});

		it('fails when required is not an array', async () => {
			const data: TemplateData = {
				type_key: 'task.test',
				name: 'Test',
				scope: 'task',
				status: 'draft',
				schema: {
					type: 'object',
					properties: {
						title: { type: 'string' }
					},
					required: 'title' as any
				}
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'schema.required',
					code: 'INVALID_TYPE'
				})
			);
		});
	});

	describe('validateFacetDefaults', () => {
		it('passes with valid facet defaults', async () => {
			const data: TemplateData = {
				type_key: 'task.test',
				name: 'Test',
				scope: 'task',
				status: 'draft',
				facet_defaults: {
					context: 'personal',
					scale: 'small',
					stage: 'planning'
				}
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			// Should not have facet errors
			expect(result.errors.some((e) => e.field.startsWith('facet_defaults'))).toBe(false);
		});

		it('fails with invalid facet key', async () => {
			const data: TemplateData = {
				type_key: 'task.test',
				name: 'Test',
				scope: 'task',
				status: 'draft',
				facet_defaults: {
					invalid_facet: 'value'
				}
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'facet_defaults.invalid_facet',
					code: 'INVALID_FACET_KEY'
				})
			);
		});

		it('fails with invalid facet value', async () => {
			const data: TemplateData = {
				type_key: 'task.test',
				name: 'Test',
				scope: 'task',
				status: 'draft',
				facet_defaults: {
					context: 'invalid_value'
				}
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'facet_defaults.context',
					code: 'INVALID_FACET_VALUE'
				})
			);
		});
	});

	describe('canDelete', () => {
		it('passes when template has no children and is not in use', async () => {
			const result = await TemplateValidationService.canDelete(mockClient, 'tpl-3');
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('fails when template has children', async () => {
			const result = await TemplateValidationService.canDelete(mockClient, 'tpl-1');
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'template',
					code: 'HAS_CHILDREN'
				})
			);
		});

		it('fails when template type is used by projects', async () => {
			mockProjects.push({
				id: 'proj-1',
				type_key: 'task.base'
			});

			const result = await TemplateValidationService.canDelete(mockClient, 'tpl-1');

			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					field: 'template',
					code: 'IN_USE_BY_PROJECTS'
				})
			);
		});
	});

	describe('Integration: Multiple Validation Errors', () => {
		it('collects multiple errors in one validation', async () => {
			const data: TemplateData = {
				type_key: '', // Missing
				name: '', // Missing
				scope: 'invalid', // Invalid
				status: 'invalid', // Invalid
				fsm: {
					states: [] // Empty
				},
				schema: {
					type: 'array' // Wrong type
				}
			};

			const result = await TemplateValidationService.validateTemplate(mockClient, data);
			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(4);

			// Check we have errors from different validators
			const errorFields = result.errors.map((e) => e.field);
			expect(errorFields).toContain('type_key');
			expect(errorFields).toContain('name');
			expect(errorFields).toContain('scope');
			expect(errorFields).toContain('status');
		});
	});
});
