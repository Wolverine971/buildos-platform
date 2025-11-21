// apps/web/src/lib/services/ontology/migration/template-discovery-engine.ts
/**
 * Template Discovery Engine
 *
 * Unified service for intelligent template discovery across all entity types.
 * Mirrors list_onto_templates and suggest_template patterns from agentic chat.
 *
 * Key Features:
 * - Template search with filtering (scope, realm, search text)
 * - LLM-powered template scoring (0-1 scale)
 * - Template suggestion for new templates
 * - 70% match threshold alignment with agentic chat
 * - Caching for cost optimization
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database, Json } from '@buildos/shared-types';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import type {
	TemplateSearchOptions,
	TemplateSearchResult,
	TemplateSuggestionOptions,
	TemplateSuggestion,
	TemplateSuggestionResponse,
	TemplateScoreResponse,
	EnsureTemplateOptions,
	EnsureTemplateResult
} from './enhanced-migration.types';
import { TemplateCrudService } from '../template-crud.service';

type TemplateRow = Database['public']['Tables']['onto_templates']['Row'];

/**
 * Simple in-memory cache for template scores
 * Key format: `${templateTypeKey}:${narrativeHash}`
 */
class TemplateScoreCache {
	private cache: Map<string, { score: number; timestamp: number }> = new Map();
	private ttl: number = 1000 * 60 * 60; // 1 hour

	set(templateKey: string, narrative: string, score: number): void {
		const key = this.buildKey(templateKey, narrative);
		this.cache.set(key, { score, timestamp: Date.now() });
	}

	get(templateKey: string, narrative: string): number | null {
		const key = this.buildKey(templateKey, narrative);
		const entry = this.cache.get(key);

		if (!entry) return null;

		// Check if expired
		if (Date.now() - entry.timestamp > this.ttl) {
			this.cache.delete(key);
			return null;
		}

		return entry.score;
	}

	clear(): void {
		this.cache.clear();
	}

	private buildKey(templateKey: string, narrative: string): string {
		// Simple hash: use first 100 chars of narrative + template key
		const narrativeSnippet = narrative.substring(0, 100);
		return `${templateKey}:${this.simpleHash(narrativeSnippet)}`;
	}

	private simpleHash(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return Math.abs(hash).toString(36);
	}
}

export class TemplateDiscoveryEngine {
	private scoreCache: TemplateScoreCache;

	constructor(
		private readonly client: TypedSupabaseClient,
		private readonly llm: SmartLLMService
	) {
		this.scoreCache = new TemplateScoreCache();
	}

	/**
	 * List templates with intelligent search and scoring
	 * Mirrors list_onto_templates tool from agentic chat
	 */
	async listTemplates(options: TemplateSearchOptions): Promise<TemplateSearchResult[]> {
		// 1. Build query
		let query = this.client
			.from('onto_templates')
			.select('*')
			.eq('scope', options.scope)
			.eq('status', 'active');

		// Filter by realm if provided
		if (options.realm) {
			// Realm is typically in the type_key or metadata
			query = query.or(
				`type_key.ilike.%.${options.realm}.%,metadata->>realm.ilike.%${options.realm}%`
			);
		}

		// Search across name and type_key
		if (options.search) {
			query = query.or(
				`name.ilike.%${options.search}%,type_key.ilike.%${options.search}%,metadata->>description.ilike.%${options.search}%`
			);
		}

		// Limit results
		if (options.limit) {
			query = query.limit(options.limit);
		}

		const { data, error } = await query;
		if (error) {
			throw new Error(`[TemplateDiscoveryEngine] Failed to list templates: ${error.message}`);
		}

		// If no context provided, return without scoring
		if (!options.context && !options.search) {
			return (data ?? []).map((template) => ({
				template,
				score: 0.5 // Neutral score when no context
			}));
		}

		// 2. Score each template
		const context = options.context ?? options.search ?? '';
		const scored = await Promise.all(
			(data ?? []).map(async (template) => ({
				template,
				score: await this.scoreTemplate(template, context)
			}))
		);

		// 3. Sort by score (highest first)
		return scored.sort((a, b) => b.score - a.score);
	}

	/**
	 * Score template match (0-1 scale)
	 * Uses LLM with caching for cost optimization
	 */
	async scoreTemplate(template: TemplateRow, narrative: string): Promise<number> {
		// Check cache first
		const cached = this.scoreCache.get(template.type_key, narrative);
		if (cached !== null) {
			return cached;
		}

		// Extract template metadata
		const templateMeta = template.metadata as any;
		const description = templateMeta?.description ?? templateMeta?.summary ?? 'N/A';
		const realm = templateMeta?.realm ?? 'unknown';

		// Get property names from schema
		const properties = template.schema
			? Object.keys((template.schema as any).properties ?? {})
			: [];

		const prompt = `Score how well this template matches the narrative (0-100):

Template: ${template.name} (${template.type_key})
Realm: ${realm}
Description: ${description}
Properties: ${properties.length > 0 ? properties.join(', ') : 'none defined'}

Narrative:
${narrative}

Scoring criteria:
- Domain alignment (40%) - Does the template's realm/domain match the narrative's domain?
- Workflow compatibility (30%) - Would this template's workflow fit the described work?
- Feature coverage (20%) - Do the template properties cover the mentioned requirements?
- Customization potential (10%) - Can the template be adapted if needed?

Return JSON: { "score": 0-100, "rationale": "brief explanation" }`;

		try {
			const response = await this.llm.getJSONResponse<TemplateScoreResponse>({
				systemPrompt: 'You score template match quality objectively and consistently.',
				userPrompt: prompt,
				userId: 'system', // Migration system user
				profile: 'fast', // Use fast model for cost optimization
				temperature: 0.1, // Low temperature for consistent scoring
				validation: {
					retryOnParseError: true,
					maxRetries: 1
				},
				operationType: 'ontology_migration.template_scoring'
			});

			const score = (response?.score ?? 0) / 100; // Convert to 0-1

			// Cache the score
			this.scoreCache.set(template.type_key, narrative, score);

			return score;
		} catch (error) {
			console.error('[TemplateDiscoveryEngine] Template scoring failed:', error);
			return 0.3; // Default low score on error
		}
	}

	/**
	 * Suggest new template
	 * Mirrors suggest_template tool from agentic chat
	 */
	async suggestTemplate(options: TemplateSuggestionOptions): Promise<TemplateSuggestion> {
		const prompt = this.buildSuggestionPrompt(options);

		const response = await this.llm.getJSONResponse<TemplateSuggestionResponse>({
			systemPrompt: `You suggest new ontology templates when existing ones don't match well.

Follow the pattern: [scope].[domain].[specialization]
- scope: ${options.scope}
- domain: broad category (e.g., "software", "event", "research")
- specialization: specific variant (e.g., "mobile_mvp", "wedding", "experimental")

Include complete property schema with types and descriptions.
Suggest workflow states that match the typical lifecycle.
Explain why a new template is needed.`,
			userPrompt: prompt,
			userId: options.userId,
			profile: 'balanced', // Use balanced model for suggestion quality
			temperature: 0.3, // Some creativity but still focused
			validation: {
				retryOnParseError: true,
				maxRetries: 2
			},
			operationType: 'ontology_migration.template_suggestion'
		});

		if (!response) {
			throw new Error(
				'[TemplateDiscoveryEngine] Template suggestion returned empty response'
			);
		}

		return this.normalizeSuggestion(response);
	}

	/**
	 * Ensure template exists (reuse or create)
	 * Aligned with ensureTemplate from project-template-inference.service
	 */
	async ensureTemplate(options: EnsureTemplateOptions): Promise<EnsureTemplateResult> {
		// Check if template already exists
		const existing = await this.fetchTemplateByTypeKey(options.typeKey);
		if (existing) {
			return {
				template: existing,
				created: false
			};
		}

		// If creation not allowed, return suggestion only
		if (!options.allowCreate || !options.suggestion) {
			return {
				template: null,
				created: false,
				suggestion: options.suggestion
			};
		}

		// Create the template
		const created = await this.createTemplateFromSuggestion(options.suggestion, options.userId);

		return {
			template: created,
			created: true,
			suggestion: options.suggestion
		};
	}

	/**
	 * Clear the score cache
	 * Useful for testing or when template catalog changes
	 */
	clearCache(): void {
		this.scoreCache.clear();
	}

	// ============================================
	// PRIVATE HELPER METHODS
	// ============================================

	private buildSuggestionPrompt(options: TemplateSuggestionOptions): string {
		const existingTemplatesText =
			options.existingTemplates.length > 0
				? options.existingTemplates
						.slice(0, 10) // Show top 10
						.map(
							(t) =>
								`- ${t.template.type_key}: ${t.template.name} (score: ${Math.round(t.score * 100)}%)`
						)
						.join('\n')
				: '- None found or none match well';

		return `Suggest a new ${options.scope} template for this narrative.

Existing templates (none match >70%):
${existingTemplatesText}

Narrative:
${options.narrative}

Create a specialized template that captures the unique aspects of this ${options.scope}.

Return JSON with:
- type_key: ${options.scope}.[domain].[specialization] (e.g., ${options.scope}.event.wedding)
- name: Human-readable name
- description: What it's for and when to use it
- parent_type_key: Optional parent template to inherit from
- match_score: 0-100 (estimated score for this narrative)
- rationale: Why a new template is needed instead of existing ones
- properties: Object where each key is a property name with:
  {
    type: "string|number|boolean|array|object",
    description: "what this property represents",
    required: boolean,
    default: optional default value,
    example: optional example value
  }
- workflow_states: Array of states with key, label, description
- benefits: Array of strings explaining benefits of this template
- example_props: Example property values extracted from the narrative

Focus on properties that are specific to this type of ${options.scope}.
Include facets (context, scale, stage) as standard properties.`;
	}

	private normalizeSuggestion(response: TemplateSuggestionResponse): TemplateSuggestion {
		return {
			typeKey: response.type_key,
			name: response.name,
			description: response.description,
			parentTypeKey: response.parent_type_key ?? null,
			matchScore: response.match_score ?? 0,
			rationale: response.rationale ?? 'No rationale provided',
			properties: response.properties ?? {},
			workflowStates: response.workflow_states ?? [],
			benefits: response.benefits ?? [],
			exampleProps: response.example_props ?? {}
		};
	}

	private async fetchTemplateByTypeKey(typeKey: string): Promise<TemplateRow | null> {
		const { data, error } = await this.client
			.from('onto_templates')
			.select('*')
			.eq('type_key', typeKey)
			.maybeSingle();

		if (error && error.code !== 'PGRST116') {
			throw new Error(
				`[TemplateDiscoveryEngine] Failed to fetch template ${typeKey}: ${error.message}`
			);
		}

		return (data as TemplateRow) ?? null;
	}

	private async createTemplateFromSuggestion(
		suggestion: TemplateSuggestion,
		userId: string
	): Promise<TemplateRow> {
		// Parse type_key to extract scope
		const parts = suggestion.typeKey.split('.');
		const scope = parts[0] as any; // project, task, plan, etc.

		// Build JSON schema from properties
		const schema = this.buildSchemaFromProperties(suggestion.properties);

		// Build FSM from workflow states
		const fsm = this.buildFSMFromStates(suggestion.workflowStates);

		// Fetch parent template if specified
		let parentTemplateId: string | null = null;
		if (suggestion.parentTypeKey) {
			const parent = await this.fetchTemplateByTypeKey(suggestion.parentTypeKey);
			parentTemplateId = parent?.id ?? null;
		}

		// Create template
		const result = await TemplateCrudService.createTemplate(this.client, {
			scope,
			type_key: suggestion.typeKey,
			name: suggestion.name,
			status: 'active',
			parent_template_id: parentTemplateId,
			is_abstract: false,
			schema,
			fsm,
			default_props: {},
			default_views: [],
			facet_defaults: {},
			metadata: {
				description: suggestion.description,
				rationale: suggestion.rationale,
				match_score: suggestion.matchScore,
				benefits: suggestion.benefits,
				created_by_migration: true,
				created_at: new Date().toISOString()
			} as Json,
			created_by: userId
		});

		if (!result.success || !result.data) {
			throw new Error(`[TemplateDiscoveryEngine] Failed to create template: ${result.error}`);
		}

		return result.data as TemplateRow;
	}

	private buildSchemaFromProperties(properties: Record<string, any>): Json {
		if (!properties || Object.keys(properties).length === 0) {
			return {
				type: 'object',
				properties: {},
				required: []
			};
		}

		const schemaProperties: Record<string, any> = {};
		const required: string[] = [];

		for (const [key, def] of Object.entries(properties)) {
			schemaProperties[key] = {
				type: def.type ?? 'string',
				description: def.description ?? undefined,
				default: def.default ?? undefined
			};

			if (def.required) {
				required.push(key);
			}
		}

		return {
			type: 'object',
			properties: schemaProperties,
			required
		};
	}

	private buildFSMFromStates(states: Array<any> | undefined): Json | null {
		if (!states || states.length === 0) {
			return null;
		}

		const fsmStates = states.map((state) => ({
			key: state.key,
			label: state.label ?? state.key,
			description: state.description ?? null,
			initial: state.initial ?? false,
			final: state.final ?? false
		}));

		// Build basic transitions (sequential flow)
		const transitions = [];
		for (let i = 0; i < fsmStates.length - 1; i++) {
			const from = fsmStates[i];
			const to = fsmStates[i + 1];

			transitions.push({
				id: `${from.key}_to_${to.key}`,
				from: from.key,
				to: to.key,
				on: 'advance',
				label: `${from.label} → ${to.label}`,
				actions: []
			});
		}

		return {
			states: fsmStates,
			transitions
		};
	}
}
