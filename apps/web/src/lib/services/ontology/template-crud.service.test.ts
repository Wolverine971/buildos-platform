// apps/web/src/lib/services/ontology/template-crud.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CreateTemplateInput, UpdateTemplateInput } from './template-crud.service';

// Mock templates database
let mockTemplates: any[] = [];
let mockProjects: any[] = [];
let mockFacetValues: any[] = [
	{ facet_key: 'context', value: 'personal' },
	{ facet_key: 'context', value: 'client' },
	{ facet_key: 'scale', value: 'small' },
	{ facet_key: 'scale', value: 'medium' },
	{ facet_key: 'stage', value: 'planning' },
	{ facet_key: 'stage', value: 'execution' }
];

// Mock Supabase client with full CRUD support
function createMockClient() {
	class QueryBuilder {
		private tableName: string;
		private filters: Array<{ field: string; value: unknown; op: string }> = [];
		private selectColumns: string = '*';
		private limitValue: number | null = null;
		private isSingle = false;
		private insertData: any = null;
		private updateData: any = null;
		private isDelete = false;

		constructor(table: string) {
			this.tableName = table;
		}

		select(columns: string = '*') {
			this.selectColumns = columns;
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

		insert(data: any) {
			this.insertData = data;
			return this;
		}

		update(data: any) {
			this.updateData = data;
			return this;
		}

		delete() {
			this.isDelete = true;
			return this;
		}

		async execute() {
			// Handle INSERT
			if (this.insertData) {
				const newRecord = {
					id: `tpl-${Date.now()}`,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					...this.insertData
				};

				if (this.tableName === 'onto_templates') {
					mockTemplates.push(newRecord);
					return { data: newRecord, error: null };
				}
			}

			// Handle UPDATE
			if (this.updateData) {
				let results: any[] = [];

				if (this.tableName === 'onto_templates') {
					results = [...mockTemplates];
				}

				// Apply filters
				for (const filter of this.filters) {
					results = results.filter((row) => row[filter.field] === filter.value);
				}

				if (results.length > 0) {
					const updated = { ...results[0], ...this.updateData };
					const index = mockTemplates.findIndex((t) => t.id === updated.id);
					mockTemplates[index] = updated;
					return { data: updated, error: null };
				}

				return { data: null, error: { message: 'Not found' } };
			}

			// Handle DELETE
			if (this.isDelete) {
				if (this.tableName === 'onto_templates') {
					// Apply filters
					let toDelete: any[] = [...mockTemplates];
					for (const filter of this.filters) {
						toDelete = toDelete.filter((row) => row[filter.field] === filter.value);
					}

					if (toDelete.length > 0) {
						mockTemplates = mockTemplates.filter((t) => !toDelete.find((d) => d.id === t.id));
						return { data: null, error: null };
					}
				}
				return { data: null, error: { message: 'Not found' } };
			}

			// Handle SELECT
			let results: any[] = [];

			if (this.tableName === 'onto_templates') {
				results = [...mockTemplates];
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
		}
	};
}

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: () => createMockClient()
}));

import { TemplateCrudService } from './template-crud.service';

describe('TemplateCrudService', () => {
	let mockClient: any;

	beforeEach(() => {
		// Reset mock data before each test
		mockTemplates = [
			{
				id: 'tpl-1',
				type_key: 'task.base',
				name: 'Base Task',
				scope: 'task',
				status: 'active',
				parent_template_id: null,
				is_abstract: true,
				fsm: {
					states: [{ name: 'draft', initial: true }, { name: 'active' }],
					transitions: []
				},
				schema: {
					type: 'object',
					properties: { title: { type: 'string' } },
					required: ['title']
				},
				metadata: {},
				default_props: {},
				default_views: {},
				facet_defaults: {},
				created_by: 'user-1',
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			},
			{
				id: 'tpl-2',
				type_key: 'task.quick',
				name: 'Quick Task',
				scope: 'task',
				status: 'active',
				parent_template_id: 'tpl-1',
				is_abstract: false,
				fsm: null,
				schema: {
					type: 'object',
					properties: {}
				},
				metadata: {},
				default_props: {},
				default_views: {},
				facet_defaults: {},
				created_by: 'user-1',
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			}
		];
		mockProjects = [];
		mockClient = createMockClient();
	});

	describe('createTemplate', () => {
		it('creates a new template with valid data', async () => {
			const input: CreateTemplateInput = {
				type_key: 'task.new_type',
				name: 'New Task Type',
				scope: 'task',
				status: 'draft',
				created_by: 'user-1'
			};

			const result = await TemplateCrudService.createTemplate(mockClient, input);

			expect(result.success).toBe(true);
			expect(result.data).toBeDefined();
			expect(result.data.type_key).toBe('task.new_type');
			expect(result.data.name).toBe('New Task Type');
			expect(result.data.id).toBeDefined();
		});

		it('applies default values when optional fields are missing', async () => {
			const input: CreateTemplateInput = {
				type_key: 'task.minimal',
				name: 'Minimal Template',
				scope: 'task',
				status: 'draft',
				created_by: 'user-1'
			};

			const result = await TemplateCrudService.createTemplate(mockClient, input);

			expect(result.success).toBe(true);
			expect(result.data.fsm).toBeDefined(); // Default FSM applied
			expect(result.data.schema).toBeDefined(); // Default schema applied
			expect(result.data.is_abstract).toBe(false); // Default false
		});

		it('fails validation when required fields are missing', async () => {
			const input: CreateTemplateInput = {
				type_key: '',
				name: '',
				scope: 'task',
				status: 'draft',
				created_by: 'user-1'
			};

			const result = await TemplateCrudService.createTemplate(mockClient, input);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Validation failed');
			expect(result.validationErrors).toBeDefined();
			expect(result.validationErrors!.length).toBeGreaterThan(0);
		});

		it('fails when type_key already exists', async () => {
			const input: CreateTemplateInput = {
				type_key: 'task.base', // Already exists
				name: 'Duplicate',
				scope: 'task',
				status: 'draft',
				created_by: 'user-1'
			};

			const result = await TemplateCrudService.createTemplate(mockClient, input);

			expect(result.success).toBe(false);
			expect(result.validationErrors).toContainEqual(
				expect.objectContaining({
					code: 'DUPLICATE_TYPE_KEY'
				})
			);
		});

		it('creates template with custom FSM and schema', async () => {
			const input: CreateTemplateInput = {
				type_key: 'task.custom',
				name: 'Custom Template',
				scope: 'task',
				status: 'draft',
				created_by: 'user-1',
				fsm: {
					states: [
						{ name: 'draft', initial: true },
						{ name: 'in_progress' },
						{ name: 'done', final: true }
					],
					transitions: [{ from: 'draft', to: 'in_progress', event: 'start' }]
				},
				schema: {
					type: 'object',
					properties: {
						title: { type: 'string' },
						priority: { type: 'number', minimum: 1, maximum: 5 }
					},
					required: ['title']
				}
			};

			const result = await TemplateCrudService.createTemplate(mockClient, input);

			expect(result.success).toBe(true);
			expect(result.data.fsm.states).toHaveLength(3);
			expect(result.data.schema.properties.priority).toBeDefined();
		});
	});

	describe('updateTemplate', () => {
		it('updates template fields', async () => {
			const input: UpdateTemplateInput = {
				id: 'tpl-2',
				name: 'Updated Quick Task',
				status: 'deprecated'
			};

			const result = await TemplateCrudService.updateTemplate(mockClient, input);

			expect(result.success).toBe(true);
			expect(result.data.name).toBe('Updated Quick Task');
			expect(result.data.status).toBe('deprecated');
		});

		it('fails when template does not exist', async () => {
			const input: UpdateTemplateInput = {
				id: 'non-existent',
				name: 'Updated'
			};

			const result = await TemplateCrudService.updateTemplate(mockClient, input);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Template not found');
		});

		it('validates merged data before updating', async () => {
			const input: UpdateTemplateInput = {
				id: 'tpl-2',
				scope: 'invalid_scope' // Invalid
			};

			const result = await TemplateCrudService.updateTemplate(mockClient, input);

			expect(result.success).toBe(false);
			expect(result.validationErrors).toBeDefined();
			expect(result.validationErrors).toContainEqual(
				expect.objectContaining({
					field: 'scope',
					code: 'INVALID_VALUE'
				})
			);
		});

		it('allows updating type_key of existing template', async () => {
			const input: UpdateTemplateInput = {
				id: 'tpl-2',
				type_key: 'task.quick_updated'
			};

			const result = await TemplateCrudService.updateTemplate(mockClient, input);

			expect(result.success).toBe(true);
			expect(result.data.type_key).toBe('task.quick_updated');
		});

		it('only updates provided fields', async () => {
			const originalName = mockTemplates[1].name;

			const input: UpdateTemplateInput = {
				id: 'tpl-2',
				status: 'deprecated'
			};

			const result = await TemplateCrudService.updateTemplate(mockClient, input);

			expect(result.success).toBe(true);
			expect(result.data.status).toBe('deprecated');
			expect(result.data.name).toBe(originalName); // Unchanged
		});
	});

	describe('cloneTemplate', () => {
		it('clones a template with new type_key and name', async () => {
			const result = await TemplateCrudService.cloneTemplate(
				mockClient,
				'tpl-2',
				'task.cloned',
				'Cloned Quick Task',
				'user-2'
			);

			expect(result.success).toBe(true);
			expect(result.data.type_key).toBe('task.cloned');
			expect(result.data.name).toBe('Cloned Quick Task');
			expect(result.data.status).toBe('draft'); // Clones start as draft
			expect(result.data.scope).toBe('task'); // Copied from source
			expect(result.data.created_by).toBe('user-2');
		});

		it('includes clone metadata', async () => {
			const result = await TemplateCrudService.cloneTemplate(
				mockClient,
				'tpl-2',
				'task.cloned',
				'Cloned',
				'user-2'
			);

			expect(result.success).toBe(true);
			expect(result.data.metadata.cloned_from).toBe('tpl-2');
			expect(result.data.metadata.cloned_at).toBeDefined();
		});

		it('fails when source template does not exist', async () => {
			const result = await TemplateCrudService.cloneTemplate(
				mockClient,
				'non-existent',
				'task.clone',
				'Clone',
				'user-1'
			);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Source template not found');
		});

		it('preserves FSM and schema from source', async () => {
			const result = await TemplateCrudService.cloneTemplate(
				mockClient,
				'tpl-1', // Has FSM and schema
				'task.cloned_base',
				'Cloned Base',
				'user-1'
			);

			expect(result.success).toBe(true);
			expect(result.data.fsm).toBeDefined();
			expect(result.data.fsm.states).toHaveLength(2);
			expect(result.data.schema.properties.title).toBeDefined();
		});
	});

	describe('promoteTemplate', () => {
		it('promotes draft template to active', async () => {
			// Create a draft template first
			const createResult = await TemplateCrudService.createTemplate(mockClient, {
				type_key: 'task.promote_test',
				name: 'Promote Test',
				scope: 'task',
				status: 'draft',
				created_by: 'user-1'
			});

			const templateId = createResult.data.id;

			const result = await TemplateCrudService.promoteTemplate(mockClient, templateId);

			expect(result.success).toBe(true);
			expect(result.data.status).toBe('active');
		});

		it('fails when template is already active', async () => {
			const result = await TemplateCrudService.promoteTemplate(mockClient, 'tpl-1');

			expect(result.success).toBe(false);
			expect(result.error).toBe('Template is already active');
		});

		it('fails when template does not exist', async () => {
			const result = await TemplateCrudService.promoteTemplate(mockClient, 'non-existent');

			expect(result.success).toBe(false);
			expect(result.error).toBe('Template not found');
		});

		it('validates template before promoting', async () => {
			// Create invalid template (will have validation errors)
			mockTemplates.push({
				id: 'tpl-invalid',
				type_key: 'task.invalid',
				name: '', // Invalid - empty name
				scope: 'task',
				status: 'draft',
				parent_template_id: null,
				is_abstract: false,
				fsm: { states: [] }, // Invalid - no states
				schema: { type: 'object' },
				metadata: {},
				default_props: {},
				default_views: {},
				facet_defaults: {},
				created_by: 'user-1'
			});

			const result = await TemplateCrudService.promoteTemplate(mockClient, 'tpl-invalid');

			expect(result.success).toBe(false);
			expect(result.error).toContain('validation errors');
			expect(result.validationErrors).toBeDefined();
		});
	});

	describe('deprecateTemplate', () => {
		it('deprecates active template', async () => {
			const result = await TemplateCrudService.deprecateTemplate(mockClient, 'tpl-1');

			expect(result.success).toBe(true);
			expect(result.data.status).toBe('deprecated');
		});

		it('fails when template does not exist', async () => {
			const result = await TemplateCrudService.deprecateTemplate(mockClient, 'non-existent');

			// Will fail at the "not found" check
			expect(result.success).toBe(false);
		});

		it('fails when template has children', async () => {
			// tpl-1 has tpl-2 as a child
			const result = await TemplateCrudService.deprecateTemplate(mockClient, 'tpl-1');

			expect(result.success).toBe(false);
			expect(result.validationErrors).toContainEqual(
				expect.objectContaining({
					code: 'HAS_CHILDREN'
				})
			);
		});
	});

	describe('deleteTemplate', () => {
		it('deletes template when not in use', async () => {
			const result = await TemplateCrudService.deleteTemplate(mockClient, 'tpl-2');

			expect(result.success).toBe(true);
			expect(mockTemplates.find((t) => t.id === 'tpl-2')).toBeUndefined();
		});

		it('fails when template has children', async () => {
			const result = await TemplateCrudService.deleteTemplate(mockClient, 'tpl-1');

			expect(result.success).toBe(false);
			expect(result.validationErrors).toContainEqual(
				expect.objectContaining({
					code: 'HAS_CHILDREN'
				})
			);
		});

		it('fails when template does not exist', async () => {
			const result = await TemplateCrudService.deleteTemplate(mockClient, 'non-existent');

			expect(result.success).toBe(false);
		});
	});

	describe('Default Values', () => {
		it('generates valid default FSM', async () => {
			const input: CreateTemplateInput = {
				type_key: 'task.default_fsm_test',
				name: 'Default FSM Test',
				scope: 'task',
				status: 'draft',
				created_by: 'user-1'
				// No FSM provided - should use default
			};

			const result = await TemplateCrudService.createTemplate(mockClient, input);

			expect(result.success).toBe(true);
			expect(result.data.fsm).toBeDefined();
			expect(result.data.fsm.states).toContainEqual(
				expect.objectContaining({
					name: 'draft',
					initial: true
				})
			);
			expect(result.data.fsm.transitions).toBeDefined();
		});

		it('generates valid default schema', async () => {
			const input: CreateTemplateInput = {
				type_key: 'task.default_schema_test',
				name: 'Default Schema Test',
				scope: 'task',
				status: 'draft',
				created_by: 'user-1'
				// No schema provided - should use default
			};

			const result = await TemplateCrudService.createTemplate(mockClient, input);

			expect(result.success).toBe(true);
			expect(result.data.schema).toBeDefined();
			expect(result.data.schema.type).toBe('object');
			expect(result.data.schema.properties).toBeDefined();
		});
	});

	describe('Error Handling', () => {
		it('handles database errors gracefully', async () => {
			// Create a mock client that throws errors
			const errorClient = {
				from: () => ({
					insert: () => ({
						select: () => ({
							single: async () => ({ data: null, error: { message: 'Database error' } })
						})
					})
				})
			};

			const input: CreateTemplateInput = {
				type_key: 'task.error_test',
				name: 'Error Test',
				scope: 'task',
				status: 'draft',
				created_by: 'user-1'
			};

			const result = await TemplateCrudService.createTemplate(errorClient as any, input);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Failed to create template');
		});
	});
});
