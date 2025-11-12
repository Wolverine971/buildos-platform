// apps/web/src/lib/services/agentic-chat/template-creation/template-creation-service.ts
/**
 * Template Creation Service
 *
 * Handles the fallback workflow for dynamically creating ontology project templates
 * whenever the agent cannot find a suitable template in the catalog.
 */

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import {
	TemplateCrudService,
	type CreateTemplateInput
} from '$lib/services/ontology/template-crud.service';
import type { TemplateData } from '$lib/services/ontology/template-validation.service';
import type {
	TemplateSchemaSummary,
	TemplateRecommendationSet,
	TemplateCreationStatus
} from '@buildos/shared-types';

interface TemplateCreationRequestParams {
	userId: string;
	sessionId?: string;
	braindump: string;
	realm: string;
	templateHints?: string[];
	deliverables?: string[];
	templateSuggestions?: string[];
	missingInformation?: string[];
	facets?: {
		context?: string;
		scale?: string;
		stage?: string;
	};
}

export interface TemplateCreationWorkflowResult {
	requestId: string;
	status: TemplateCreationStatus;
	templateResponse?: {
		id: string;
		type_key: string;
		name: string;
		realm: string;
		schema_summary: TemplateSchemaSummary;
		recommended_entities?: TemplateRecommendationSet;
	};
	error?: string;
	actionable?: boolean;
	templateHints?: string[];
}

interface TemplateSummaryRecord {
	schema_summary: TemplateSchemaSummary;
	recommended_entities?: TemplateRecommendationSet;
}

export class TemplateCreationService {
	private typedSupabase: TypedSupabaseClient;

	constructor(private supabase: SupabaseClient<Database>) {
		this.typedSupabase = supabase as unknown as TypedSupabaseClient;
	}

	async requestTemplateCreation(
		params: TemplateCreationRequestParams
	): Promise<TemplateCreationWorkflowResult> {
		const requestId = randomUUID();
		const now = new Date().toISOString();

		const { error: insertError } = await this.supabase
			.from('agent_template_creation_requests')
			.insert({
				request_id: requestId,
				session_id: params.sessionId ?? null,
				user_id: params.userId,
				realm: params.realm,
				status: 'queued',
				braindump: params.braindump,
				template_hints: params.templateHints ?? [],
				deliverables: params.deliverables ?? [],
				facets: params.facets ?? {},
				missing_information: params.missingInformation ?? [],
				created_at: now
			});

		if (insertError) {
			throw new Error(`Failed to log template creation request: ${insertError.message}`);
		}

		const blueprint = new TemplateBlueprintFactory(params, requestId);
		const templateInput: CreateTemplateInput = {
			...blueprint.buildTemplateData(),
			created_by: params.userId
		};

		const creation = await TemplateCrudService.createTemplate(
			this.typedSupabase,
			templateInput
		);

		if (!creation.success || !creation.data) {
			const errorMessage = creation.error || 'Failed to create template';
			await this.supabase
				.from('agent_template_creation_requests')
				.update({
					status: 'failed',
					error: errorMessage,
					updated_at: new Date().toISOString()
				})
				.eq('request_id', requestId);

			return {
				requestId,
				status: 'failed',
				error: errorMessage,
				actionable: true,
				templateHints: params.templateHints
			};
		}

		const templateRow = creation.data;
		const recommendations = blueprint.getRecommendations();
		const schemaSummary = blueprint.getSchemaSummary();

		const summaryRecord: TemplateSummaryRecord = {
			schema_summary: schemaSummary,
			recommended_entities: recommendations
		};

		await this.supabase
			.from('agent_template_creation_requests')
			.update({
				status: 'completed',
				result_template_id: templateRow.id,
				template_summary: summaryRecord,
				updated_at: new Date().toISOString()
			})
			.eq('request_id', requestId);

		return {
			requestId,
			status: 'completed',
			templateResponse: {
				id: templateRow.id,
				type_key: templateRow.type_key,
				name: templateRow.name,
				realm: blueprint.getRealmSegment(),
				schema_summary: schemaSummary,
				recommended_entities: recommendations
			},
			templateHints: params.templateHints
		};
	}
}

class TemplateBlueprintFactory {
	private readonly timestamp = new Date().toISOString();
	private schema!: TemplateData['schema'];

	constructor(
		private readonly params: TemplateCreationRequestParams,
		private readonly requestId: string
	) {}

	buildTemplateData(): TemplateData {
		const typeKey = this.buildTypeKey();
		const schema = this.buildSchema();
		this.schema = schema;

		const metadata = {
			realm: this.getRealmSegment(),
			source: 'agentic_template_creation',
			request_id: this.requestId,
			template_hints: this.params.templateHints ?? [],
			deliverables: this.params.deliverables ?? []
		};

		return {
			type_key: typeKey,
			name: this.buildTemplateName(),
			scope: 'project',
			status: 'draft',
			is_abstract: false,
			parent_template_id: null,
			fsm: this.buildFSM(typeKey),
			schema,
			metadata,
			default_props: {},
			default_views: [],
			facet_defaults: this.buildFacetDefaults()
		};
	}

	getSchemaSummary(): TemplateSchemaSummary {
		return {
			required_properties: Array.isArray(this.schema?.required)
				? [...this.schema.required]
				: [],
			fsm_states: ['draft', 'active', 'complete'],
			facet_defaults: this.buildFacetDefaults(),
			custom_fields: Object.keys(this.schema?.properties ?? {})
		};
	}

	getRecommendations(): TemplateRecommendationSet {
		const goals = this.params.deliverables?.slice(0, 3).map((deliverable) => ({
			name: `Deliver ${deliverable}`,
			description: `Complete the deliverable "${deliverable}"`
		})) ?? [
			{
				name: `Complete ${this.buildTemplateName()}`,
				description: 'Finish the primary deliverable described in the braindump'
			}
		];

		const tasks = this.deriveKeyPhrases()
			.slice(0, 4)
			.map((phrase) => ({
				title: phrase,
				description: `Plan work for "${phrase}"`
			}));

		const outputs =
			this.params.deliverables?.slice(0, 2).map((deliverable) => ({
				name: deliverable,
				description: `Track the deliverable "${deliverable}" as an output`
			})) ?? [];

		return {
			goals,
			tasks,
			outputs
		};
	}

	getRealmSegment(): string {
		return this.normalizeSegment(this.params.realm || 'custom');
	}

	private buildTemplateName(): string {
		if (this.params.templateSuggestions?.length) {
			return this.toTitleCase(this.params.templateSuggestions[0]);
		}

		const firstSentence = this.params.braindump.split(/[.!?]/)[0] || 'Custom Project';
		return this.toTitleCase(firstSentence).slice(0, 80);
	}

	private buildTypeKey(): string {
		const baseSegment = this.normalizeSegment(this.buildTemplateName());
		const realmSegment = this.getRealmSegment();
		const suffix = this.requestId
			.replace(/[^a-z0-9]/gi, '')
			.slice(0, 6)
			.toLowerCase();
		return `project.${realmSegment}.${baseSegment}${suffix ? `_${suffix}` : ''}`;
	}

	private buildFacetDefaults() {
		return {
			context: this.params.facets?.context ?? 'personal',
			scale: this.params.facets?.scale ?? 'medium',
			stage: this.params.facets?.stage ?? 'discovery'
		};
	}

	private buildSchema(): TemplateData['schema'] {
		const properties: Record<string, any> = {
			narrative_overview: {
				type: 'string',
				description: 'High-level summary of the project vision'
			},
			key_milestones: {
				type: 'array',
				items: { type: 'string' },
				description: 'List of major checkpoints or events'
			},
			success_metrics: {
				type: 'array',
				items: { type: 'string' },
				description: 'How success will be measured for this project'
			},
			resources_needed: {
				type: 'array',
				items: { type: 'string' },
				description: 'People, tools, or assets required'
			}
		};

		if (this.params.deliverables?.length) {
			properties.deliverables = {
				type: 'array',
				items: { type: 'string' },
				description: 'Explicit deliverables captured during template creation'
			};
		}

		return {
			type: 'object',
			properties,
			required: ['narrative_overview', 'key_milestones']
		};
	}

	private buildFSM(typeKey: string) {
		return {
			type_key: typeKey,
			states: ['draft', 'active', 'complete'],
			transitions: [
				{ from: 'draft', to: 'active', event: 'start', guards: [], actions: [] },
				{ from: 'active', to: 'complete', event: 'finish', guards: [], actions: [] }
			]
		};
	}

	private normalizeSegment(value: string): string {
		return (
			value
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '_')
				.replace(/^_+|_+$/g, '')
				.replace(/_{2,}/g, '_') || 'custom'
		);
	}

	private toTitleCase(value: string): string {
		return value
			.trim()
			.split(/\s+/)
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
			.join(' ');
	}

	private deriveKeyPhrases(): string[] {
		const cleaned = this.params.braindump.replace(/\r/g, '');
		const lines = cleaned.split(/\n+/).map((line) => line.trim());
		const phrases = lines
			.filter((line) => line.length > 0)
			.map((line) => line.replace(/[-*•]/g, '').trim());

		if (phrases.length > 0) {
			return phrases;
		}

		return cleaned
			.split(/[.!?]/)
			.map((sentence) => sentence.trim())
			.filter(Boolean);
	}
}
