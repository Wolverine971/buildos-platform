// apps/web/src/lib/services/ontology/template-resolver.service.test.ts
import { describe, it, expect, vi } from 'vitest';

type TemplateRow = {
	id: string;
	scope: string;
	type_key: string;
	name: string;
	status: string;
	parent_template_id: string | null;
	is_abstract: boolean;
	schema: {
		type: string;
		properties: Record<string, unknown>;
		required?: string[];
	};
	fsm: Record<string, unknown> | null;
	default_props: Record<string, unknown>;
	default_views: Array<Record<string, unknown>>;
	metadata: Record<string, unknown>;
	facet_defaults: Record<string, unknown> | null;
};

const BASE_TEMPLATES: TemplateRow[] = [
	{
		id: 'tpl-output-base',
		scope: 'output',
		type_key: 'output.base',
		name: 'Base Output',
		status: 'active',
		parent_template_id: null,
		is_abstract: true,
		schema: {
			type: 'object',
			properties: {
				name: { type: 'string' },
				description: { type: 'string' }
			},
			required: ['name']
		},
		fsm: {
			type_key: 'output.base',
			states: ['draft', 'review', 'approved', 'published'],
			transitions: []
		},
		default_props: {},
		default_views: [],
		metadata: {
			realm: 'output',
			description: 'Base template for outputs'
		},
		facet_defaults: {
			stage: 'planning'
		}
	},
	{
		id: 'tpl-output-document',
		scope: 'output',
		type_key: 'output.document',
		name: 'Text Document',
		status: 'active',
		parent_template_id: 'tpl-output-base',
		is_abstract: true,
		schema: {
			type: 'object',
			properties: {
				title: { type: 'string' },
				content: { type: 'string' },
				content_type: { type: 'string', enum: ['html', 'markdown'], default: 'html' },
				word_count: { type: 'number', default: 0 }
			},
			required: ['title']
		},
		fsm: {
			type_key: 'output.document',
			states: ['draft', 'review', 'approved', 'published'],
			transitions: []
		},
		default_props: {
			content_type: 'html',
			word_count: 0
		},
		default_views: [{ view: 'document' }],
		metadata: {
			primitive: 'TEXT_DOCUMENT',
			output_type: 'content',
			description: 'Base text document'
		},
		facet_defaults: {
			stage: 'planning'
		}
	},
	{
		id: 'tpl-output-article',
		scope: 'output',
		type_key: 'output.article',
		name: 'Article/Essay',
		status: 'active',
		parent_template_id: 'tpl-output-document',
		is_abstract: false,
		schema: {
			type: 'object',
			properties: {
				publication: { type: 'string' },
				target_word_count: { type: 'number', minimum: 100 },
				keywords: { type: 'array', items: { type: 'string' } },
				seo_title: { type: 'string' },
				meta_description: { type: 'string' }
			}
		},
		fsm: null, // inherit from output.document
		default_props: {
			target_word_count: 1000
		},
		default_views: [{ view: 'document' }],
		metadata: {
			primitive: 'TEXT_DOCUMENT',
			output_type: 'content',
			typical_use_by: ['writer', 'marketer', 'content-creator']
		},
		facet_defaults: {}
	},
	{
		id: 'tpl-output-blog-post',
		scope: 'output',
		type_key: 'output.blog_post',
		name: 'Blog Post',
		status: 'active',
		parent_template_id: 'tpl-output-document',
		is_abstract: false,
		schema: {
			type: 'object',
			properties: {
				blog_name: { type: 'string' },
				categories: { type: 'array', items: { type: 'string' } },
				tags: { type: 'array', items: { type: 'string' } },
				featured_image_url: { type: 'string' },
				excerpt: { type: 'string' }
			}
		},
		fsm: null,
		default_props: {
			categories: [],
			tags: []
		},
		default_views: [{ view: 'document' }],
		metadata: {
			primitive: 'TEXT_DOCUMENT',
			output_type: 'content'
		},
		facet_defaults: {}
	},
	{
		id: 'tpl-output-case-study',
		scope: 'output',
		type_key: 'output.case_study',
		name: 'Case Study',
		status: 'active',
		parent_template_id: 'tpl-output-document',
		is_abstract: false,
		schema: {
			type: 'object',
			properties: {
				client_name: { type: 'string' },
				challenge: { type: 'string' },
				solution: { type: 'string' },
				results: { type: 'array', items: { type: 'string' } }
			},
			required: ['client_name', 'challenge']
		},
		fsm: null,
		default_props: {
			results: []
		},
		default_views: [{ view: 'document' }],
		metadata: {
			primitive: 'TEXT_DOCUMENT',
			output_type: 'content'
		},
		facet_defaults: {}
	},
	{
		id: 'tpl-output-whitepaper',
		scope: 'output',
		type_key: 'output.whitepaper',
		name: 'Whitepaper',
		status: 'active',
		parent_template_id: 'tpl-output-document',
		is_abstract: false,
		schema: {
			type: 'object',
			properties: {
				target_audience: { type: 'string' },
				key_findings: { type: 'array', items: { type: 'string' } },
				data_sources: { type: 'array', items: { type: 'string' } },
				abstract: { type: 'string' },
				target_word_count: { type: 'number', minimum: 2000 }
			}
		},
		fsm: null,
		default_props: {
			key_findings: [],
			data_sources: [],
			target_word_count: 3000
		},
		default_views: [{ view: 'document' }],
		metadata: {
			primitive: 'TEXT_DOCUMENT',
			output_type: 'knowledge'
		},
		facet_defaults: {}
	},
	{
		id: 'tpl-output-newsletter',
		scope: 'output',
		type_key: 'output.newsletter',
		name: 'Newsletter',
		status: 'active',
		parent_template_id: 'tpl-output-document',
		is_abstract: false,
		schema: {
			type: 'object',
			properties: {
				edition_number: { type: 'number' },
				send_date: { type: 'string' },
				subject_line: { type: 'string' }
			}
		},
		fsm: {
			type_key: 'output.newsletter',
			states: ['draft', 'review', 'scheduled', 'sent'],
			transitions: []
		},
		default_props: {},
		default_views: [{ view: 'document' }],
		metadata: {
			primitive: 'TEXT_DOCUMENT',
			output_type: 'content'
		},
		facet_defaults: {}
	},
	{
		id: 'tpl-output-chapter',
		scope: 'output',
		type_key: 'output.chapter',
		name: 'Book Chapter',
		status: 'active',
		parent_template_id: 'tpl-output-document',
		is_abstract: false,
		schema: {
			type: 'object',
			properties: {
				chapter_number: { type: 'number' },
				target_words: { type: 'number' },
				pov_character: { type: 'string' }
			}
		},
		fsm: null,
		default_props: {},
		default_views: [{ view: 'document' }],
		metadata: {
			primitive: 'TEXT_DOCUMENT',
			output_type: 'content'
		},
		facet_defaults: {}
	}
];

function deepClone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function createMockClient() {
	const data = deepClone(BASE_TEMPLATES);

	class QueryBuilder {
		private filters: Array<{ field: string; value: unknown }> = [];
		private selectColumns: string | null = null;
		private orderField: string | null = null;
		private orderAscending = true;

		constructor(private readonly rows: TemplateRow[]) {}

		select(columns: string) {
			this.selectColumns = columns;
			return this;
		}

		eq(field: string, value: unknown) {
			this.filters.push({ field, value });
			return this;
		}

		order(field: string, options?: { ascending?: boolean }) {
			this.orderField = field;
			this.orderAscending = options?.ascending !== false;
			return this.executeResponse();
		}

		async maybeSingle() {
			const results = this.execute();
			return { data: results[0] ?? null, error: null };
		}

		private async executeResponse() {
			return { data: this.execute(), error: null };
		}

		private execute() {
			let results = [...this.rows];

			for (const filter of this.filters) {
				results = results.filter(
					(row) => row[filter.field as keyof TemplateRow] === filter.value
				);
			}

			if (this.orderField) {
				const field = this.orderField;
				const factor = this.orderAscending ? 1 : -1;
				results.sort((a, b) => {
					const av = a[field as keyof TemplateRow];
					const bv = b[field as keyof TemplateRow];

					if (av === bv) return 0;
					return av > bv ? factor : -factor;
				});
			}

			if (this.selectColumns && this.selectColumns !== '*') {
				const columns = this.selectColumns
					.split(',')
					.map((column) => column.trim())
					.filter(Boolean);

				results = results.map((row) => {
					const projected: Record<string, unknown> = {};
					for (const column of columns) {
						projected[column] = row[column as keyof TemplateRow];
					}
					return projected as TemplateRow;
				});
			}

			return results;
		}
	}

	return {
		from(table: string) {
			if (table !== 'onto_templates') {
				throw new Error(`Unsupported table "${table}"`);
			}

			return new QueryBuilder(data);
		}
	};
}

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: () => createMockClient()
}));

import {
	resolveTemplate,
	getTextDocumentTemplates,
	validateTemplateForInstantiation
} from './template-resolver.service';

describe('Template Resolver Service', () => {
	describe('resolveTemplate', () => {
		it('resolves output.article with inheritance from output.document and output.base', async () => {
			const resolved = await resolveTemplate('output.article', 'output');

			expect(resolved.type_key).toBe('output.article');
			expect(resolved.scope).toBe('output');
			expect(resolved.is_abstract).toBe(false);

			expect(resolved.schema.properties.name).toBeDefined();
			expect(resolved.schema.properties.title).toBeDefined();
			expect(resolved.schema.properties.content).toBeDefined();
			expect(resolved.schema.properties.word_count).toBeDefined();

			expect(resolved.schema.properties.publication).toBeDefined();
			expect(resolved.schema.properties.keywords).toBeDefined();

			expect(resolved.schema.required).toContain('name');
			expect(resolved.schema.required).toContain('title');

			expect(resolved.inheritance_chain).toEqual([
				'output.base',
				'output.document',
				'output.article'
			]);
		});

		it('resolves output.chapter correctly', async () => {
			const resolved = await resolveTemplate('output.chapter', 'output');

			expect(resolved.schema.properties.chapter_number).toBeDefined();
			expect(resolved.schema.properties.target_words).toBeDefined();
			expect(resolved.schema.properties.pov_character).toBeDefined();
		});

		it('resolves output.blog_post with all inherited fields', async () => {
			const resolved = await resolveTemplate('output.blog_post', 'output');

			expect(resolved.schema.properties.blog_name).toBeDefined();
			expect(resolved.schema.properties.categories).toBeDefined();
			expect(resolved.schema.properties.tags).toBeDefined();
			expect(resolved.schema.properties.featured_image_url).toBeDefined();

			expect(resolved.schema.properties.title).toBeDefined();
			expect(resolved.schema.properties.content).toBeDefined();
		});

		it('resolves output.case_study with required fields', async () => {
			const resolved = await resolveTemplate('output.case_study', 'output');

			expect(resolved.schema.required).toContain('client_name');
			expect(resolved.schema.required).toContain('challenge');
		});

		it('throws error for non-existent template', async () => {
			await expect(resolveTemplate('output.nonexistent', 'output')).rejects.toThrow(
				'Template not found'
			);
		});

		it('resolves abstract template when requested', async () => {
			const resolved = await resolveTemplate('output.document', 'output');

			expect(resolved.is_abstract).toBe(true);
			expect(resolved.schema.properties.title).toBeDefined();
			expect(resolved.schema.properties.content).toBeDefined();
		});

		it('merges FSM correctly (child overrides parent)', async () => {
			const resolved = await resolveTemplate('output.newsletter', 'output');

			expect(resolved.fsm?.states).toContain('scheduled');
			expect(resolved.fsm?.states).toContain('sent');
			expect(resolved.fsm?.states).not.toContain('published');
		});

		it('merges metadata correctly', async () => {
			const resolved = await resolveTemplate('output.article', 'output');

			expect(resolved.metadata.primitive).toBe('TEXT_DOCUMENT');
			expect(resolved.metadata.typical_use_by).toContain('writer');
		});

		it('merges default_props correctly', async () => {
			const resolved = await resolveTemplate('output.article', 'output');

			expect(resolved.default_props.content_type).toBe('html');
			expect(resolved.default_props.target_word_count).toBe(1000);
		});
	});

	describe('getTextDocumentTemplates', () => {
		it('returns all concrete text document templates', async () => {
			const templates = await getTextDocumentTemplates();

			const typeKeys = templates.map((t) => t.type_key);
			expect(typeKeys).toContain('output.article');
			expect(typeKeys).toContain('output.blog_post');
			expect(typeKeys).toContain('output.case_study');
			expect(typeKeys).toContain('output.chapter');
			expect(typeKeys).toContain('output.newsletter');

			for (const template of templates) {
				expect(template.schema.properties.title).toBeDefined();
				expect(template.schema.properties.name).toBeDefined();
			}
		});

		it('only returns non-abstract templates', async () => {
			const templates = await getTextDocumentTemplates();
			expect(templates.every((template) => !template.is_abstract)).toBe(true);
		});
	});

	describe('validateTemplateForInstantiation', () => {
		it('validates concrete template as instantiable', async () => {
			const result = await validateTemplateForInstantiation('output.article', 'output');

			expect(result.valid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('rejects abstract template for instantiation', async () => {
			const result = await validateTemplateForInstantiation('output.document', 'output');

			expect(result.valid).toBe(false);
			expect(result.error).toContain('abstract');
		});

		it('rejects non-existent template', async () => {
			const result = await validateTemplateForInstantiation('output.none', 'output');

			expect(result.valid).toBe(false);
			expect(result.error).toContain('Template not found');
		});
	});

	describe('Inheritance Chain', () => {
		it('builds correct inheritance chain for three-level hierarchy', async () => {
			const resolved = await resolveTemplate('output.whitepaper', 'output');

			expect(resolved.inheritance_chain).toEqual([
				'output.base',
				'output.document',
				'output.whitepaper'
			]);
		});

		it('handles single-level template (no parent)', async () => {
			const resolved = await resolveTemplate('output.base', 'output');

			expect(resolved.inheritance_chain).toEqual(['output.base']);
		});
	});

	describe('Edge Cases', () => {
		it('handles template with null FSM (inherits from parent)', async () => {
			const resolved = await resolveTemplate('output.article', 'output');

			expect(resolved.fsm?.states).toContain('draft');
			expect(resolved.fsm?.states).toContain('review');
			expect(resolved.fsm?.states).toContain('approved');
			expect(resolved.fsm?.states).toContain('published');
		});

		it('does not duplicate required fields', async () => {
			const resolved = await resolveTemplate('output.case_study', 'output');

			const counts = resolved.schema.required.reduce<Record<string, number>>((acc, field) => {
				acc[field] = (acc[field] || 0) + 1;
				return acc;
			}, {});

			for (const count of Object.values(counts)) {
				expect(count).toBe(1);
			}
		});
	});
});
