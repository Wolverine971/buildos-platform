// apps/web/src/lib/services/ontology/template-analyzer.service.ts

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { getCatalogCascade } from './template-catalog-meta.service';
import {
	TEMPLATE_BRAINDUMP_OUTPUT_CONTRACT,
	TEMPLATE_TAXONOMY_SUMMARY
} from '$lib/constants/template-braindump';
import type {
	TemplateAnalyzerResponse,
	TemplateAnalyzerSuggestion,
	CatalogCascade,
	TemplateBrainDumpPlan
} from '$lib/types/template-builder';

type AnalyzerLevel = 'realm' | 'domain' | 'deliverable';

interface AnalyzeOptions {
	scope: string;
	realm?: string | null;
	domain?: string | null;
	brainDump: string;
	userId: string;
	targetLevel?: AnalyzerLevel | null;
	rejectedSuggestions?: boolean;
	priorSuggestions?: string[];
}

type RawSuggestion = {
	domain: string;
	deliverable: string;
	variant?: string | null;
	confidence?: number;
	rationale?: string;
	match_level?: TemplateAnalyzerSuggestion['match_level'];
	preferred_parent_type_key?: string;
};

interface RawAnalyzerResponse {
	primary?: RawSuggestion | null;
	alternatives?: RawSuggestion[];
	new_template_options?: RawSuggestion[];
	structured_plan?: TemplateBrainDumpPlan | null;
}

export class TemplateAnalyzerService {
	constructor(
		private readonly supabase: TypedSupabaseClient,
		private readonly llm: SmartLLMService
	) {}

	async analyze({
		scope,
		realm,
		domain,
		brainDump,
		userId,
		targetLevel,
		rejectedSuggestions,
		priorSuggestions = []
	}: AnalyzeOptions): Promise<TemplateAnalyzerResponse> {
		const cascade = realm
			? await getCatalogCascade(this.supabase, scope, realm)
			: this.createEmptyCascade(scope);
		const llmResponse = await this.invokeLLM({
			scope,
			realm,
			domain,
			brainDump,
			userId,
			cascade,
			targetLevel,
			rejectedSuggestions,
			priorSuggestions
		});

		return this.postProcessResponse(llmResponse, cascade);
	}

	private async invokeLLM({
		scope,
		realm,
		domain,
		brainDump,
		userId,
		cascade,
		targetLevel,
		rejectedSuggestions,
		priorSuggestions
	}: {
		scope: string;
		realm?: string | null;
		domain?: string | null;
		brainDump: string;
		userId: string;
		cascade: CatalogCascade;
		targetLevel?: AnalyzerLevel | null;
		rejectedSuggestions?: boolean;
		priorSuggestions: string[];
	}): Promise<RawAnalyzerResponse> {
		const catalogSummary = cascade.templates.map((template) => ({
			type_key: template.type_key,
			domain: template.domain,
			deliverable: template.deliverable,
			variant: template.variant ?? null,
			status: template.status,
			is_abstract: template.is_abstract,
			description: template.summary ?? '',
			facets: template.facet_defaults ?? {}
		}));

		const priorSummary =
			priorSuggestions.length > 0
				? `Previously rejected type_keys: ${priorSuggestions.join(', ')}.`
				: 'No prior rejections.';

		const realmLabel = realm && realm.length > 0 ? realm : '<<new_realm>>';
		const targetIntent = this.describeTargetIntent(targetLevel, realmLabel, domain);
		const taxonomyPrimer = TEMPLATE_TAXONOMY_SUMMARY;
		const structuredPlanContract = TEMPLATE_BRAINDUMP_OUTPUT_CONTRACT;

		const systemPrompt = `
You are the Ontology Template Analyzer for BuildOS. Your job is to classify a user's template idea into our existing catalog when possible, or suggest a well-structured new type_key that follows the format {domain}.{deliverable}[.{variant}].

${taxonomyPrimer}

Additional Rules:
- Domains represent the actor (writer, coach, founder, designer, etc.) and must be lowercase snake_case.
- Deliverables describe the work product (book, onboarding_plan, marketing_campaign, etc.) and must be lowercase snake_case.
- Variant is optional and further specializes the deliverable (fiction, executive, mobile, etc.).
- Prefer reusing existing templates within the provided scope (${scope}) and realm (${realmLabel}). Only propose net-new domains/deliverables/variants if no close match exists.
- When matching, try this order: variant match → deliverable match → domain match → new.
- Facets (context / scale / stage) describe how this instance shows up; never rename the entity via facets.
- Provide rationale referencing the user's brain dump and the catalog snapshot.
- Confidence must be 0.0 to 1.0.
- match_level must be one of: "variant", "deliverable", "domain", "new".
- preferred_parent_type_key can reference an existing template that should be inherited from.
- Always return a structured_plan object that follows the contract below, even when you reuse an existing template.
- If the user is forcing a project-derived entity to have an independent type key, capture the justification in type_key_override_reason.
${targetIntent}

${structuredPlanContract}
`;

		const userPrompt = `
Scope: ${scope}
Realm: ${realmLabel}
Domain focus: ${domain ?? 'unspecified'}
${priorSummary}

User Brain Dump:
"""
${brainDump.trim()}
"""

Existing Templates (JSON):
${JSON.stringify(catalogSummary, null, 2)}

Return JSON with the shape:
{
  "structured_plan": StructuredPlan,
  "primary": TemplateSuggestion | null,
  "alternatives": TemplateSuggestion[],
  "new_template_options": TemplateSuggestion[]
}

StructuredPlan follows the contract above and must capture metadata, facet_defaults, FSM, schema, and open_questions.

TemplateSuggestion fields:
- domain (required, lowercase snake_case)
- deliverable (required, lowercase snake_case)
- variant (optional, lowercase snake_case)
- confidence (0-1)
- rationale (why this match)
- match_level ("variant" | "deliverable" | "domain" | "new")
- preferred_parent_type_key (optional existing type_key to inherit from)
`;

		const llmResult = await this.llm.getJSONResponse<RawAnalyzerResponse>({
			systemPrompt,
			userPrompt,
			userId,
			profile: 'balanced',
			temperature: rejectedSuggestions ? 0.4 : 0.2,
			validation: {
				retryOnParseError: true,
				validateSchema: false,
				maxRetries: 2
			},
			requirements: {
				maxLatency: 15000
			},
			operationType: 'template_analyzer',
			projectId: undefined,
			brainDumpId: undefined
		});

		return llmResult ?? { primary: null, alternatives: [], new_template_options: [] };
	}

	private postProcessResponse(
		raw: RawAnalyzerResponse,
		cascade: CatalogCascade
	): TemplateAnalyzerResponse {
		const normalize = (suggestion: RawSuggestion | null | undefined) => {
			if (!suggestion) return null;
			const domain = this.normalizeSlug(suggestion.domain);
			const deliverable = this.normalizeSlug(suggestion.deliverable);
			const variant = this.normalizeSlug(suggestion.variant);

			if (!domain || !deliverable) {
				return null;
			}

			const typeKey = [domain, deliverable, variant].filter(Boolean).join('.');
			const match = this.findMatchingTemplate(cascade, domain, deliverable, variant);

			const match_level =
				suggestion.match_level ??
				(match.variantMatch
					? 'variant'
					: match.deliverableMatch
						? 'deliverable'
						: match.domainExists
							? 'domain'
							: 'new');

			const parent_template_id =
				match.variantMatch?.id ?? match.deliverableMatch?.id ?? undefined;
			const parent_type_key =
				match.variantMatch?.type_key ??
				match.deliverableMatch?.type_key ??
				suggestion.preferred_parent_type_key;

			const cleanConfidence = this.clampConfidence(suggestion.confidence);

			const normalized: TemplateAnalyzerSuggestion = {
				type_key: typeKey,
				domain,
				deliverable,
				variant: variant || undefined,
				confidence: cleanConfidence,
				rationale: suggestion.rationale?.trim() || 'LLM rationale unavailable',
				match_level,
				parent_template_id,
				parent_type_key,
				is_new_domain: !match.domainExists,
				is_new_deliverable: !match.deliverableExists,
				is_new_variant: variant ? !match.variantExists : false
			};

			return normalized;
		};

		const primary = normalize(raw.primary);
		const alternatives = (raw.alternatives ?? []).map(normalize).filter(Boolean) as
			| TemplateAnalyzerSuggestion[]
			| [];
		const newOptions = (raw.new_template_options ?? []).map(normalize).filter(Boolean) as
			| TemplateAnalyzerSuggestion[]
			| [];
		const structuredPlan = this.normalizeStructuredPlan(raw.structured_plan, cascade);

		return {
			scope: cascade.scope,
			realm: cascade.realm,
			primary: primary ?? null,
			alternatives,
			new_template_options: newOptions,
			structured_plan: structuredPlan
		};
	}

	private findMatchingTemplate(
		cascade: CatalogCascade,
		domain: string,
		deliverable: string,
		variant?: string | null
	) {
		const exactKey = [domain, deliverable, variant].filter(Boolean).join('.');
		const deliverableKey = `${domain}.${deliverable}`;
		const domainExists = cascade.domains.some((d) => d.slug === domain);
		const deliverableExists = cascade.deliverables.some(
			(d) => d.slug === deliverable && d.domains.includes(domain)
		);
		const variantExists = variant
			? cascade.variants.some((v) => v.slug === variant && v.parent === deliverableKey)
			: false;

		const variantMatch = cascade.templates.find((t) => t.type_key === exactKey);
		const deliverableMatch = cascade.templates.find(
			(t) => t.domain === domain && t.deliverable === deliverable && !t.variant
		);

		return {
			domainExists,
			deliverableExists,
			variantExists,
			variantMatch,
			deliverableMatch
		};
	}

	private normalizeSlug(value?: string | null): string | null {
		if (!value) return null;
		return value
			.toLowerCase()
			.replace(/[^a-z0-9\s._-]/g, '')
			.trim()
			.replace(/\s+/g, '_')
			.replace(/__+/g, '_')
			.replace(/\.+/g, '.')
			.replace(/^_+|_+$/g, '');
	}

	private clampConfidence(value?: number): number {
		if (typeof value !== 'number' || Number.isNaN(value)) {
			return 0.6;
		}
		return Math.min(1, Math.max(0, value));
	}

	private normalizeStructuredPlan(
		plan: TemplateBrainDumpPlan | null | undefined,
		cascade: CatalogCascade
	): TemplateBrainDumpPlan | null {
		if (!plan || !plan.type_key) {
			return null;
		}

		const normalizedTypeKey = this.normalizeTypeKey(plan.type_key);
		if (!normalizedTypeKey) {
			return null;
		}

		const normalizedScope = plan.scope || cascade.scope;
		const normalizedRealm = plan.realm ?? cascade.realm;
		const normalizedCategory =
			plan.entity_category ??
			(this.isAutonomousScope(normalizedScope) ? 'autonomous' : 'project_derived');

		const metadata = this.cleanMetadata(plan.metadata);
		const facetDefaults = this.cleanFacetDefaults(plan.facet_defaults);
		const fsm = this.cleanFsm(plan.fsm);
		const schema = this.cleanSchema(plan.schema);
		const openQuestions = plan.open_questions
			?.map((question) => (typeof question === 'string' ? question.trim() : ''))
			.filter((question) => question.length > 0);

		return {
			scope: normalizedScope,
			entity_category: normalizedCategory,
			realm: normalizedRealm,
			type_key: normalizedTypeKey,
			type_key_rationale: plan.type_key_rationale ?? '',
			type_key_override_reason: plan.type_key_override_reason ?? null,
			metadata,
			facet_defaults: facetDefaults,
			fsm,
			schema,
			open_questions: openQuestions && openQuestions.length ? openQuestions : null
		};
	}

	private normalizeTypeKey(value?: string | null): string | null {
		if (!value) return null;
		const parts = value
			.split('.')
			.map((part) => this.normalizeSlug(part))
			.filter((part): part is string => Boolean(part));
		if (parts.length < 2) {
			return null;
		}
		return parts.join('.');
	}

	private isAutonomousScope(scope: string): boolean {
		const autonomous = new Set(['project', 'plan', 'output', 'document', 'goal', 'task']);
		return autonomous.has(scope);
	}

	private cleanMetadata(
		metadata?: TemplateBrainDumpPlan['metadata'] | null
	): TemplateBrainDumpPlan['metadata'] | null {
		if (!metadata) return null;
		const keywords = Array.isArray(metadata.keywords)
			? metadata.keywords
					.map((kw) => (typeof kw === 'string' ? kw.trim() : ''))
					.filter((kw) => kw.length > 0)
			: undefined;
		const useCases = Array.isArray(metadata.exemplar_use_cases)
			? metadata.exemplar_use_cases
					.map((item) => (typeof item === 'string' ? item.trim() : ''))
					.filter((item) => item.length > 0)
			: undefined;
		return {
			...metadata,
			keywords,
			exemplar_use_cases: useCases
		};
	}

	private cleanFacetDefaults(
		facets?: TemplateBrainDumpPlan['facet_defaults']
	): TemplateBrainDumpPlan['facet_defaults'] | undefined {
		if (!facets) return undefined;
		const normalizedEntries = Object.entries(facets).reduce(
			(acc, [key, values]) => {
				const normalizedValues = Array.isArray(values)
					? values
					: typeof values === 'string'
						? [values]
						: [];
				const trimmed = normalizedValues
					.map((value) => (typeof value === 'string' ? value.trim() : ''))
					.filter((value) => value.length > 0);
				if (trimmed.length) {
					acc[key] = trimmed;
				}
				return acc;
			},
			{} as Record<string, string[]>
		);

		return Object.keys(normalizedEntries).length ? normalizedEntries : undefined;
	}

	private cleanFsm(
		fsm?: TemplateBrainDumpPlan['fsm'] | null
	): TemplateBrainDumpPlan['fsm'] | null {
		if (!fsm) return null;
		const states = (fsm.states ?? [])
			.map((state, index) => {
				const label = state.label?.trim() || state.key || `State ${index + 1}`;
				const key = state.key || this.normalizeSlug(label) || `state_${index + 1}`;
				return {
					key,
					label,
					initial: Boolean(state.initial),
					final: Boolean(state.final),
					description: state.description ?? undefined
				};
			})
			.filter((state) => Boolean(state.key && state.label));

		const transitions = (fsm.transitions ?? [])
			.map((transition, index) => {
				const from = this.normalizeSlug(transition.from) || transition.from;
				const to = this.normalizeSlug(transition.to) || transition.to;
				if (!from || !to) return null;
				return {
					id: transition.id ?? `transition_${index + 1}`,
					from,
					to,
					on: transition.on ?? transition.label ?? 'progress',
					label: transition.label ?? transition.on ?? 'progress',
					description: transition.description ?? undefined,
					guard: transition.guard,
					actions: transition.actions
				};
			})
			.filter((transition): transition is NonNullable<typeof transition> =>
				Boolean(transition)
			);

		if (!states.length && !transitions.length) {
			return null;
		}

		return {
			states,
			transitions,
			metadata: fsm.metadata
		};
	}

	private cleanSchema(
		schema?: TemplateBrainDumpPlan['schema'] | null
	): TemplateBrainDumpPlan['schema'] | null {
		if (!schema) return null;
		const normalized = schema
			.map((field, index) => {
				const fieldName = field.field?.trim();
				if (!fieldName) return null;
				return {
					field: this.normalizeSlug(fieldName) ?? `field_${index + 1}`,
					type: field.type?.toLowerCase() ?? 'string',
					required: Boolean(field.required),
					description: field.description ?? undefined,
					enum: Array.isArray(field.enum)
						? field.enum
								.map((value) => (typeof value === 'string' ? value.trim() : ''))
								.filter((value) => value.length > 0)
						: undefined,
					example: field.example
				};
			})
			.filter((field): field is NonNullable<typeof field> => Boolean(field));

		return normalized.length ? normalized : null;
	}

	private describeTargetIntent(
		level: AnalyzerLevel | null | undefined,
		realm: string,
		domain?: string | null
	): string {
		const realmName = realm === '<<new_realm>>' ? 'a new realm' : `"${realm}"`;
		switch (level) {
			case 'realm':
				return '\nCreation Focus: User wants to define a BRAND NEW REALM/sector for this scope.';
			case 'domain':
				return `\nCreation Focus: User wants to create a NEW DOMAIN within realm ${realmName}.`;
			case 'deliverable':
				return `\nCreation Focus: User wants a NEW DELIVERABLE for domain "${domain ?? 'unspecified'}" within realm ${realmName}.`;
			default:
				return '';
		}
	}

	private createEmptyCascade(scope: string): CatalogCascade {
		return {
			scope,
			realm: '<<new_realm>>',
			domains: [],
			deliverables: [],
			variants: [],
			templates: []
		};
	}
}
