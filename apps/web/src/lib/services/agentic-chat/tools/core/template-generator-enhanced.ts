// apps/web/src/lib/services/agentic-chat/tools/core/template-generator-enhanced.ts
/**
 * Enhanced Template Generator for Agentic Chat
 *
 * Intelligent template creation with:
 * - Smart schema detection
 * - Template inheritance
 * - Scope-aware FSM patterns
 * - LLM with full context
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { SmartLLMService } from '$lib/services/smart-llm-service';

// Base fields that exist in database tables (not in template schema)
const BASE_TABLE_FIELDS: Record<string, string[]> = {
	project: [
		'id',
		'name',
		'description',
		'type_key',
		'state_key',
		'created_at',
		'updated_at',
		'created_by'
	],
	task: [
		'id',
		'project_id',
		'plan_id',
		'title',
		'state_key',
		'priority',
		'due_at',
		'created_at',
		'updated_at',
		'created_by'
	],
	document: [
		'id',
		'project_id',
		'title',
		'type_key',
		'state_key',
		'body_markdown',
		'created_at',
		'updated_at',
		'created_by'
	],
	output: [
		'id',
		'project_id',
		'name',
		'type_key',
		'state_key',
		'created_at',
		'updated_at',
		'created_by'
	],
	plan: [
		'id',
		'project_id',
		'name',
		'type_key',
		'state_key',
		'created_at',
		'updated_at',
		'created_by'
	],
	goal: ['id', 'project_id', 'name', 'type_key', 'created_at', 'updated_at', 'created_by'],
	requirement: ['id', 'project_id', 'text', 'type_key', 'created_at', 'updated_at', 'created_by']
};

// Valid realms for type_key structure
const VALID_REALMS = [
	'basic', // Generic templates
	'creative', // Creative work (writing, art, design)
	'engineering', // Software, technical work
	'business', // Business operations, strategy
	'research', // Academic, scientific research
	'personal', // Personal projects, life management
	'education', // Learning, teaching
	'health' // Health, wellness, fitness
];

// Scope-specific FSM patterns
const SCOPE_FSM_PATTERNS: Record<string, any> = {
	task: {
		states: ['todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled'],
		transitions: [
			{ from: 'todo', to: 'in_progress', event: 'start', guards: [], actions: [] },
			{ from: 'in_progress', to: 'blocked', event: 'block', guards: [], actions: [] },
			{ from: 'blocked', to: 'in_progress', event: 'unblock', guards: [], actions: [] },
			{ from: 'in_progress', to: 'review', event: 'submit', guards: [], actions: [] },
			{ from: 'review', to: 'done', event: 'approve', guards: [], actions: [] },
			{ from: 'review', to: 'in_progress', event: 'reject', guards: [], actions: [] },
			{
				from: ['todo', 'in_progress', 'blocked', 'review'],
				to: 'cancelled',
				event: 'cancel',
				guards: [],
				actions: []
			}
		]
	},
	document: {
		states: ['draft', 'review', 'published', 'archived'],
		transitions: [
			{ from: 'draft', to: 'review', event: 'submit_review', guards: [], actions: [] },
			{ from: 'review', to: 'published', event: 'publish', guards: [], actions: [] },
			{ from: 'review', to: 'draft', event: 'request_changes', guards: [], actions: [] },
			{ from: 'published', to: 'archived', event: 'archive', guards: [], actions: [] },
			{ from: 'archived', to: 'published', event: 'restore', guards: [], actions: [] }
		]
	},
	output: {
		states: ['draft', 'active', 'delivered', 'accepted'],
		transitions: [
			{ from: 'draft', to: 'active', event: 'activate', guards: [], actions: [] },
			{ from: 'active', to: 'delivered', event: 'deliver', guards: [], actions: [] },
			{ from: 'delivered', to: 'accepted', event: 'accept', guards: [], actions: [] },
			{ from: 'delivered', to: 'active', event: 'revise', guards: [], actions: [] }
		]
	},
	plan: {
		states: ['draft', 'active', 'completed', 'cancelled'],
		transitions: [
			{ from: 'draft', to: 'active', event: 'activate', guards: [], actions: [] },
			{ from: 'active', to: 'completed', event: 'complete', guards: [], actions: [] },
			{ from: ['draft', 'active'], to: 'cancelled', event: 'cancel', guards: [], actions: [] }
		]
	},
	project: {
		states: ['planning', 'active', 'paused', 'completed', 'archived'],
		transitions: [
			{ from: 'planning', to: 'active', event: 'start', guards: [], actions: [] },
			{ from: 'active', to: 'paused', event: 'pause', guards: [], actions: [] },
			{ from: 'paused', to: 'active', event: 'resume', guards: [], actions: [] },
			{ from: 'active', to: 'completed', event: 'complete', guards: [], actions: [] },
			{ from: 'completed', to: 'archived', event: 'archive', guards: [], actions: [] }
		]
	},
	goal: {
		states: ['proposed', 'accepted', 'in_progress', 'achieved', 'abandoned'],
		transitions: [
			{ from: 'proposed', to: 'accepted', event: 'accept', guards: [], actions: [] },
			{ from: 'accepted', to: 'in_progress', event: 'start', guards: [], actions: [] },
			{ from: 'in_progress', to: 'achieved', event: 'achieve', guards: [], actions: [] },
			{
				from: ['proposed', 'accepted', 'in_progress'],
				to: 'abandoned',
				event: 'abandon',
				guards: [],
				actions: []
			}
		]
	},
	requirement: {
		states: ['draft', 'approved', 'implemented', 'verified'],
		transitions: [
			{ from: 'draft', to: 'approved', event: 'approve', guards: [], actions: [] },
			{ from: 'approved', to: 'implemented', event: 'implement', guards: [], actions: [] },
			{ from: 'implemented', to: 'verified', event: 'verify', guards: [], actions: [] }
		]
	}
};

export class EnhancedTemplateGenerator {
	private templateCache = new Map<string, { template: any; timestamp: number }>();
	private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

	constructor(
		private adminSupabase: TypedSupabaseClient,
		private llmService?: SmartLLMService,
		private userId?: string,
		private sessionId?: string
	) {}

	/**
	 * Main entry point - ensures template exists or creates it
	 */
	async ensureTemplate(params: {
		scope: 'project' | 'plan' | 'task' | 'output' | 'document' | 'goal' | 'requirement';
		typeKey?: string;
		props?: Record<string, unknown>;
		nameHint?: string;
		metadata?: Record<string, unknown>;
	}): Promise<string | undefined> {
		const typeKey = params.typeKey?.trim();
		if (!typeKey) return undefined;

		// Check cache first
		const cached = await this.getCachedTemplate(typeKey, params.scope);
		if (cached) return typeKey;

		// Check database
		const existing = await this.checkExistingTemplate(typeKey, params.scope);
		if (existing) return typeKey;

		// Check for scope conflicts
		const conflicting = await this.checkScopeConflict(typeKey);
		if (conflicting) {
			console.warn(
				`[TemplateGenerator] Template exists in ${conflicting.scope} scope, skipping creation`
			);
			return typeKey;
		}

		// Generate and create template
		const template = await this.generateTemplate({
			...params,
			typeKey: typeKey! // We already checked it's not undefined above
		});
		const created = await this.createTemplate(template);

		if (!created) {
			throw new Error(`Failed to create template: ${typeKey}`);
		}

		return typeKey;
	}

	/**
	 * Generate a complete template with LLM or fallback
	 */
	private async generateTemplate(params: {
		scope: string;
		typeKey: string;
		props?: Record<string, unknown>;
		nameHint?: string;
		metadata?: Record<string, unknown>;
	}): Promise<any> {
		// Try LLM generation first
		const llmTemplate = await this.generateViaLLM(params);
		if (llmTemplate) {
			return this.mergeWithDefaults(llmTemplate, params);
		}

		// Fallback to deterministic generation
		return this.generateDeterministic(params);
	}

	/**
	 * Generate template using LLM with full context
	 */
	private async generateViaLLM(params: {
		scope: string;
		typeKey: string;
		props?: Record<string, unknown>;
	}): Promise<any | null> {
		if (!this.llmService) return null;

		try {
			// Get context for generation
			const parentTemplate = await this.findBestParentTemplate(params.scope, params.typeKey);
			const similarTemplates = await this.getSimilarTemplates(params.scope, params.typeKey);
			const baseFields = BASE_TABLE_FIELDS[params.scope] || [];

			const systemPrompt = this.buildSystemPrompt();
			const userPrompt = this.buildUserPrompt({
				...params,
				parentTemplate,
				similarTemplates,
				baseFields
			});

			const result = await this.llmService.getJSONResponse<{
				name: string;
				parent_template_id?: string;
				schema: {
					type: 'object';
					properties: Record<string, any>;
					required: string[];
				};
				fsm?: any;
				default_props?: Record<string, unknown>;
				facet_defaults?: Record<string, unknown>;
				metadata?: Record<string, unknown>;
			}>({
				systemPrompt,
				userPrompt,
				userId: this.userId,
				profile: 'balanced',
				temperature: 0.3,
				operationType: 'template_generation'
			});

			return result;
		} catch (error) {
			console.warn('[TemplateGenerator] LLM generation failed:', error);
			return null;
		}
	}

	/**
	 * Build system prompt for LLM
	 */
	private buildSystemPrompt(): string {
		return `You are the BuildOS Template Designer. Your role is to create intelligent, inheritance-aware templates for the ontology system.

Key Principles:
1. Templates use inheritance - extend parent templates when possible
2. Don't duplicate fields that exist in parent templates
3. Only include fields specific to this template's purpose
4. Use semantic field names that are self-documenting
5. Follow type_key naming: {realm}.{deliverable}[.{variant}]
6. Create focused, minimal schemas - less is more

Schema Design Rules:
- Use appropriate JSON Schema types and formats
- Add constraints (min/max, patterns) where helpful
- Only mark truly required fields as required
- Use descriptions for complex fields
- Prefer composition over deep nesting

Return JSON only, no explanations or markdown.`;
	}

	/**
	 * Build user prompt with full context
	 */
	private buildUserPrompt(params: {
		scope: string;
		typeKey: string;
		props?: Record<string, unknown>;
		parentTemplate: any;
		similarTemplates: any[];
		baseFields: string[];
	}): string {
		const parts = [
			`Create a template for scope "${params.scope}" with type_key "${params.typeKey}"`,
			'',
			'Sample data that will use this template:',
			'```json',
			JSON.stringify(params.props || {}, null, 2),
			'```',
			''
		];

		if (params.baseFields.length > 0) {
			parts.push(
				'Base table fields (DO NOT include in schema, they exist in database):',
				params.baseFields.join(', '),
				''
			);
		}

		if (params.parentTemplate) {
			parts.push(
				'Suggested parent template to extend:',
				`- ${params.parentTemplate.type_key}: ${params.parentTemplate.name}`,
				'Parent schema properties:',
				JSON.stringify(Object.keys(params.parentTemplate.schema?.properties || {})),
				'Your template should EXTEND this parent by setting parent_template_id',
				''
			);
		}

		if (params.similarTemplates.length > 0) {
			parts.push(
				'Similar templates in this scope (for reference):',
				...params.similarTemplates
					.slice(0, 3)
					.map(
						(t) =>
							`- ${t.type_key}: has fields ${Object.keys(t.properties).join(', ') || 'none'}`
					),
				''
			);
		}

		parts.push(
			'Requirements:',
			`1. Set parent_template_id to "${params.parentTemplate?.id}" if extending`,
			'2. Only include NEW fields not in parent',
			'3. Infer appropriate types from the sample data',
			'4. Add helpful constraints and formats',
			'5. Use the provided FSM pattern for this scope',
			'',
			'Return JSON with: name, parent_template_id (if extending), schema, fsm, default_props, facet_defaults'
		);

		return parts.join('\n');
	}

	/**
	 * Deterministic template generation (fallback)
	 */
	private generateDeterministic(params: {
		scope: string;
		typeKey: string;
		props?: Record<string, unknown>;
		nameHint?: string;
		metadata?: Record<string, unknown>;
	}): any {
		const parentId = this.findBestParentTemplateSync(params.scope, params.typeKey);

		return {
			type_key: params.typeKey,
			name: params.nameHint || this.generateName(params.typeKey),
			scope: params.scope,
			status: 'active',
			parent_template_id: parentId,
			is_abstract: false,
			fsm: this.generateFSM(params.scope, params.typeKey),
			schema: this.generateSchema(params.scope, params.props),
			metadata: {
				source: 'auto_generated',
				generator: 'deterministic',
				session_id: this.sessionId,
				created_at: new Date().toISOString(),
				...params.metadata
			},
			default_props: this.filterDefaultProps(params.scope, params.props),
			facet_defaults: this.extractFacets(params.props),
			created_by: this.userId
		};
	}

	/**
	 * Generate intelligent schema from props
	 */
	private generateSchema(scope: string, props?: Record<string, unknown>): any {
		const properties: Record<string, any> = {};
		const required: string[] = [];
		const baseFields = BASE_TABLE_FIELDS[scope] || [];

		if (!props || Object.keys(props).length === 0) {
			// Minimal default schema
			return {
				type: 'object',
				properties: {},
				required: []
			};
		}

		for (const [key, value] of Object.entries(props)) {
			// Skip base table fields
			if (baseFields.includes(key)) continue;

			// Skip facets (handled separately)
			if (key === 'facets') continue;

			const fieldSchema = this.inferFieldSchema(key, value);
			if (fieldSchema) {
				properties[key] = fieldSchema;

				// Only mark as required if it seems essential
				if (this.isLikelyRequired(key, value)) {
					required.push(key);
				}
			}
		}

		return {
			type: 'object',
			properties,
			required: Array.from(new Set(required))
		};
	}

	/**
	 * Infer schema for a single field
	 */
	private inferFieldSchema(key: string, value: unknown): any {
		// Date/time fields
		if (key.match(/(_at|_date|due|deadline|start|end|created|updated|scheduled)$/i)) {
			return {
				type: 'string',
				format: 'date-time',
				description: this.generateDescription(key)
			};
		}

		// Email fields
		if (key.match(/(email|mail|contact)$/i)) {
			return {
				type: 'string',
				format: 'email',
				description: this.generateDescription(key)
			};
		}

		// URL fields
		if (key.match(/(url|link|website|site|href)$/i)) {
			return {
				type: 'string',
				format: 'uri',
				description: this.generateDescription(key)
			};
		}

		// Priority/count fields
		if (key.match(/(priority|count|quantity|amount|size|length|score|rating)$/i)) {
			return {
				type: 'integer',
				minimum: 0,
				description: this.generateDescription(key)
			};
		}

		// Status/state enums
		if (key.match(/(status|state|type|kind|category|role)$/i) && typeof value === 'string') {
			return {
				type: 'string',
				description: this.generateDescription(key)
				// Could add enum if we detect patterns
			};
		}

		// Arrays
		if (Array.isArray(value)) {
			const itemType =
				value.length > 0
					? this.inferFieldSchema(`${key}_item`, value[0])
					: { type: 'string' };
			return {
				type: 'array',
				items: itemType,
				description: this.generateDescription(key)
			};
		}

		// Objects
		if (typeof value === 'object' && value !== null) {
			const nestedProps: Record<string, any> = {};
			for (const [nestedKey, nestedValue] of Object.entries(value)) {
				nestedProps[nestedKey] = this.inferFieldSchema(nestedKey, nestedValue);
			}
			return {
				type: 'object',
				properties: nestedProps,
				description: this.generateDescription(key)
			};
		}

		// Basic types
		const valueType = typeof value;
		if (valueType === 'string') {
			const schema: any = { type: 'string', description: this.generateDescription(key) };

			// Add constraints for text fields
			if (key.match(/(description|body|content|text|notes)$/i)) {
				schema.maxLength = 10000;
			} else if (key.match(/(name|title|label)$/i)) {
				schema.maxLength = 200;
			}

			return schema;
		}

		if (valueType === 'number') {
			return { type: 'number', description: this.generateDescription(key) };
		}

		if (valueType === 'boolean') {
			return { type: 'boolean', description: this.generateDescription(key) };
		}

		// Default
		return { type: 'string', description: this.generateDescription(key) };
	}

	/**
	 * Generate FSM based on scope
	 */
	private generateFSM(scope: string, typeKey: string): any {
		// Use scope-specific pattern
		const pattern = SCOPE_FSM_PATTERNS[scope];
		if (pattern) {
			return {
				type_key: typeKey,
				...pattern
			};
		}

		// Default FSM
		return {
			type_key: typeKey,
			states: ['draft', 'active', 'complete'],
			transitions: [
				{ from: 'draft', to: 'active', event: 'activate', guards: [], actions: [] },
				{ from: 'active', to: 'complete', event: 'complete', guards: [], actions: [] }
			]
		};
	}

	/**
	 * Helper methods
	 */
	private async getCachedTemplate(typeKey: string, scope: string): Promise<any | null> {
		const cacheKey = `${scope}:${typeKey}`;
		const cached = this.templateCache.get(cacheKey);

		if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
			return cached.template;
		}

		return null;
	}

	private async checkExistingTemplate(typeKey: string, scope: string): Promise<boolean> {
		const { data } = await this.adminSupabase
			.from('onto_templates')
			.select('id')
			.eq('type_key', typeKey)
			.eq('scope', scope)
			.maybeSingle();

		if (data) {
			// Cache it
			this.templateCache.set(`${scope}:${typeKey}`, {
				template: data,
				timestamp: Date.now()
			});
		}

		return !!data;
	}

	private async checkScopeConflict(typeKey: string): Promise<{ scope: string } | null> {
		const { data } = await this.adminSupabase
			.from('onto_templates')
			.select('scope')
			.eq('type_key', typeKey)
			.maybeSingle();

		return data as { scope: string } | null;
	}

	private async findBestParentTemplate(scope: string, typeKey: string): Promise<any | null> {
		const parts = typeKey.split('.');

		// Try progressively broader parent keys
		for (let i = parts.length - 1; i > 0; i--) {
			const parentKey = parts.slice(0, i).join('.');
			const { data } = await this.adminSupabase
				.from('onto_templates')
				.select('*')
				.eq('type_key', parentKey)
				.eq('scope', scope)
				.maybeSingle();

			if (data) return data;
		}

		// Try base template
		const { data: base } = await this.adminSupabase
			.from('onto_templates')
			.select('*')
			.eq('type_key', `${scope}.basic`)
			.eq('scope', scope)
			.maybeSingle();

		return base;
	}

	private findBestParentTemplateSync(scope: string, typeKey: string): string | null {
		// This would need to be async in production
		// For now, return null (no parent)
		return null;
	}

	private async getSimilarTemplates(scope: string, typeKey: string): Promise<any[]> {
		const parts = typeKey.split('.');
		const realm = parts[0];

		const { data } = await this.adminSupabase
			.from('onto_templates')
			.select('type_key, name, schema')
			.eq('scope', scope)
			.ilike('type_key', `${realm}%`)
			.neq('type_key', typeKey)
			.limit(5);

		return (data || []).map((t) => ({
			type_key: t.type_key,
			name: t.name,
			properties: (t.schema as any)?.properties || {}
		}));
	}

	private async createTemplate(template: any): Promise<boolean> {
		const { error } = await this.adminSupabase.from('onto_templates').insert(template);

		if (error) {
			console.error('[TemplateGenerator] Failed to create template:', error);
			return false;
		}

		return true;
	}

	private mergeWithDefaults(llmTemplate: any, params: any): any {
		return {
			type_key: params.typeKey,
			name: llmTemplate.name || this.generateName(params.typeKey),
			scope: params.scope,
			status: 'active',
			parent_template_id: llmTemplate.parent_template_id || null,
			is_abstract: false,
			fsm: llmTemplate.fsm || this.generateFSM(params.scope, params.typeKey),
			schema: llmTemplate.schema || this.generateSchema(params.scope, params.props),
			metadata: {
				source: 'auto_generated',
				generator: 'llm',
				session_id: this.sessionId,
				created_at: new Date().toISOString(),
				...params.metadata,
				...llmTemplate.metadata
			},
			default_props:
				llmTemplate.default_props || this.filterDefaultProps(params.scope, params.props),
			facet_defaults: llmTemplate.facet_defaults || this.extractFacets(params.props),
			created_by: this.userId
		};
	}

	private generateName(typeKey: string): string {
		const parts = typeKey.split('.');
		const last = parts[parts.length - 1] || typeKey;

		return last
			.split(/[_-]/g)
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	private generateDescription(fieldName: string): string {
		return fieldName
			.replace(/_/g, ' ')
			.replace(/([A-Z])/g, ' $1')
			.trim()
			.replace(/^./, (s) => s.toUpperCase());
	}

	private isLikelyRequired(key: string, value: unknown): boolean {
		// Never require optional-sounding fields
		if (key.match(/(optional|extra|additional|custom|meta|misc)/i)) return false;

		// Require essential fields
		if (key.match(/(^name$|^title$|^type|^kind$|^category$)/i)) return true;

		// Don't require nullable values
		if (value === null || value === undefined) return false;

		// Don't require empty values
		if (value === '' || (Array.isArray(value) && value.length === 0)) return false;

		return false;
	}

	private filterDefaultProps(
		scope: string,
		props?: Record<string, unknown>
	): Record<string, unknown> {
		if (!props) return {};

		const baseFields = BASE_TABLE_FIELDS[scope] || [];
		const filtered: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(props)) {
			if (!baseFields.includes(key) && key !== 'facets') {
				filtered[key] = value;
			}
		}

		return filtered;
	}

	private extractFacets(props?: Record<string, unknown>): Record<string, unknown> {
		if (!props?.facets || typeof props.facets !== 'object') return {};

		const facets = props.facets as Record<string, unknown>;
		const extracted: Record<string, unknown> = {};

		if (facets.context) extracted.context = facets.context;
		if (facets.scale) extracted.scale = facets.scale;
		if (facets.stage) extracted.stage = facets.stage;

		return extracted;
	}
}
