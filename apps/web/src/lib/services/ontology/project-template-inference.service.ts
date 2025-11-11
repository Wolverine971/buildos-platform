// apps/web/src/lib/services/ontology/project-template-inference.service.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database, Json } from '@buildos/shared-types';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { TemplateAnalyzerService } from './template-analyzer.service';
import { getScopeCatalogMeta, getCatalogCascade } from './template-catalog-meta.service';
import type {
	CatalogCascade,
	TemplateAnalyzerSuggestion,
	TemplateBrainDumpPlan
} from '$lib/types/template-builder';
import { TemplateCrudService, type CreateTemplateInput } from './template-crud.service';
import { resolveTemplateWithClient } from './template-resolver.service';
import type { ResolvedTemplate } from './template-resolver.service';
import type { TemplateCreationPlan } from './migration.types';

type LegacyProjectRow = Database['public']['Tables']['projects']['Row'];
type TemplateRow = Database['public']['Tables']['onto_templates']['Row'];

interface RealmOption {
	realm: string;
	template_count: number;
	exemplar_names: string[];
}

interface RealmClassificationResult {
	realm: string | null;
	reason: string;
	createNew: boolean;
	proposedRealm?: string | null;
}

interface RealmClassifierResponse {
	realm: string;
	reason: string;
	create_new: boolean;
	relabel?: string | null;
}

export interface TemplateInferenceOptions {
	project: LegacyProjectRow;
	userId: string;
	dryRun?: boolean;
}

export interface TemplateInferenceResult {
	typeKey: string;
	templateId: string | null;
	realm: string | null;
	domain: string | null;
	deliverable: string | null;
	variant: string | null;
	confidence?: number | null;
	rationale?: string | null;
	matchLevel?: TemplateAnalyzerSuggestion['match_level'];
	created: boolean;
	creationPlanned?: TemplateCreationPlan | null;
	structuredPlan?: TemplateBrainDumpPlan | null;
	resolvedTemplate: ResolvedTemplate | null;
}

const DEFAULT_PARENT_TEMPLATE_KEY = 'project.migration.generic';
const REALM_OVERVIEW_LIMIT = 12;

export class ProjectTemplateInferenceService {
	private readonly analyzer: TemplateAnalyzerService;

	constructor(
		private readonly client: TypedSupabaseClient,
		private readonly llm: SmartLLMService
	) {
		this.analyzer = new TemplateAnalyzerService(client, llm);
	}

	async inferTemplate(
		options: TemplateInferenceOptions
	): Promise<TemplateInferenceResult | null> {
		const narrative = this.buildProjectNarrative(options.project);

		let realmDecision: RealmClassificationResult | null = null;
		try {
			realmDecision = await this.classifyRealm(narrative, options.userId);
		} catch (error) {
			console.error('[ProjectTemplateInference] Realm classification failed', error);
		}

		const realm = realmDecision?.realm ?? realmDecision?.proposedRealm ?? null;

		const cascade =
			realm && realm !== '<<new_realm>>'
				? await getCatalogCascade(this.client, 'project', realm)
				: this.createEmptyCascade();

		let analyzerSuggestion: TemplateAnalyzerSuggestion | null = null;
		let structuredPlan: TemplateBrainDumpPlan | null | undefined;

		try {
			const analyzerResult = await this.analyzer.analyze({
				scope: 'project',
				realm: realm ?? null,
				brainDump: narrative,
				userId: options.userId,
				targetLevel: realmDecision?.createNew ? 'realm' : undefined,
				rejectedSuggestions: false,
				priorSuggestions: []
			});

			analyzerSuggestion =
				analyzerResult.primary ??
				analyzerResult.new_template_options?.[0] ??
				analyzerResult.alternatives?.[0] ??
				null;
			structuredPlan = analyzerResult.structured_plan;
		} catch (error) {
			console.error('[ProjectTemplateInference] Template analyzer failed', error);
		}

		if (!analyzerSuggestion) {
			return null;
		}

		const normalizedSuggestion = this.normalizeSuggestion(analyzerSuggestion);
		const typeKey = this.buildTypeKey(normalizedSuggestion);

		const ensureResult = await this.ensureTemplate({
			typeKey,
			suggestion: normalizedSuggestion,
			structuredPlan: structuredPlan ?? null,
			realm: realm ?? null,
			cascade,
			userId: options.userId,
			allowCreate: !options.dryRun
		});

		const resolvedTemplate = ensureResult.template
			? await this.resolveTemplateSafe(typeKey)
			: null;

		return {
			typeKey,
			templateId: ensureResult.template?.id ?? null,
			realm: realm ?? null,
			domain: normalizedSuggestion.domain ?? null,
			deliverable: normalizedSuggestion.deliverable ?? null,
			variant: normalizedSuggestion.variant ?? null,
			confidence: normalizedSuggestion.confidence ?? null,
			rationale: normalizedSuggestion.rationale ?? null,
			matchLevel: normalizedSuggestion.match_level,
			created: ensureResult.created,
			creationPlanned: ensureResult.plan ?? null,
			structuredPlan: structuredPlan ?? null,
			resolvedTemplate
		};
	}

	private async classifyRealm(
		narrative: string,
		userId: string
	): Promise<RealmClassificationResult> {
		const meta = await getScopeCatalogMeta(this.client, 'project');
		const realms = meta.realms.slice(0, REALM_OVERVIEW_LIMIT);

		const summary = realms
			.map(
				(realm) =>
					`- ${realm.realm} (${realm.template_count} templates) e.g. ${realm.exemplar_names.join(', ')}`
			)
			.join('\n');

		const systemPrompt = `You classify BuildOS project ideas into realms (high-level industries or sectors).
Choose an existing realm when it fits. Suggest a new realm only when nothing is close.
Respond with JSON: {"realm": "<slug-or-new>", "reason": "<why>", "create_new": boolean, "relabel": "optional new realm name"}.
Realm slugs are lowercase snake_case.`;

		const userPrompt = `Existing project realms:
${summary.length ? summary : '- None recorded'}

Project narrative:
"""
${narrative}
"""

Return the best matching realm slug. If none fits, set "create_new": true and provide "relabel" with a proposed realm name.`;

		const response = await this.llm.getJSONResponse<RealmClassifierResponse>({
			systemPrompt,
			userPrompt,
			userId,
			profile: 'balanced',
			temperature: 0.1,
			validation: {
				retryOnParseError: true,
				maxRetries: 2
			},
			operationType: 'ontology_migration.realm_classifier'
		});

		if (!response) {
			throw new Error('Realm classifier returned empty response');
		}

		const normalizedRealm = response.realm?.trim().toLowerCase() ?? '';
		const realmExists = realms.some((entry) => entry.realm === normalizedRealm);

		return {
			realm: realmExists ? normalizedRealm : null,
			reason: response.reason ?? '',
			createNew: response.create_new || !realmExists,
			proposedRealm: response.create_new ? (response.relabel ?? normalizedRealm) : null
		};
	}

	private buildProjectNarrative(project: LegacyProjectRow): string {
		const coreDimensionEntries = [
			['Goals Momentum', project.core_goals_momentum],
			['Harmony Integration', project.core_harmony_integration],
			['Integrity Ideals', project.core_integrity_ideals],
			['Meaning Identity', project.core_meaning_identity],
			['Opportunity Freedom', project.core_opportunity_freedom],
			['People Bonds', project.core_people_bonds],
			['Power Resources', project.core_power_resources],
			['Reality Understanding', project.core_reality_understanding],
			['Trust Safeguards', project.core_trust_safeguards]
		]
			.filter(([, value]) => typeof value === 'string' && value.length > 0)
			.map(([label, value]) => `- ${label}: ${value}`)
			.join('\n');

		const segments: string[] = [
			`Project Name: ${project.name}`,
			`Status: ${project.status}`,
			project.description ? `Description:\n${project.description}` : '',
			project.context ? `Context Markdown:\n${project.context}` : '',
			project.tags?.length ? `Tags: ${project.tags.join(', ')}` : '',
			project.executive_summary ? `Executive Summary:\n${project.executive_summary}` : '',
			coreDimensionEntries ? `Core Values:\n${coreDimensionEntries}` : '',
			project.source ? `Source: ${project.source}` : '',
			project.source_metadata
				? `Source Metadata: ${JSON.stringify(project.source_metadata)}`
				: ''
		];

		return segments.filter(Boolean).join('\n\n');
	}

	private normalizeSuggestion(
		suggestion: TemplateAnalyzerSuggestion
	): TemplateAnalyzerSuggestion {
		return {
			...suggestion,
			domain: suggestion.domain ? this.toSlug(suggestion.domain) : suggestion.domain,
			deliverable: suggestion.deliverable
				? this.toSlug(suggestion.deliverable)
				: suggestion.deliverable,
			variant: suggestion.variant ? this.toSlug(suggestion.variant) : suggestion.variant
		};
	}

	private toSlug(value?: string | null): string | null {
		if (!value) return null;
		return value
			.trim()
			.toLowerCase()
			.replace(/[^\w\s]/g, ' ')
			.trim()
			.replace(/\s+/g, '_');
	}

	private buildTypeKey(suggestion: TemplateAnalyzerSuggestion): string {
		const parts = [suggestion.domain, suggestion.deliverable, suggestion.variant]
			.filter((part): part is string => !!part && part.length > 0)
			.map((part) => part.trim());

		if (parts.length < 2) {
			throw new Error('Template suggestions must include at least domain and deliverable');
		}

		return parts.join('.');
	}

	private createEmptyCascade(): CatalogCascade {
		return {
			scope: 'project',
			realm: '<<new_realm>>',
			domains: [],
			deliverables: [],
			variants: [],
			templates: []
		};
	}

	private async ensureTemplate(params: {
		typeKey: string;
		suggestion: TemplateAnalyzerSuggestion;
		structuredPlan: TemplateBrainDumpPlan | null;
		realm: string | null;
		cascade: CatalogCascade;
		userId: string;
		allowCreate: boolean;
	}): Promise<{
		template: TemplateRow | null;
		created: boolean;
		plan?: TemplateCreationPlan;
	}> {
		const existing = await this.fetchTemplateByTypeKey(params.typeKey);
		if (existing) {
			return { template: existing, created: false };
		}

		const parentTemplate = await this.resolveParentTemplate(params);
		const templatePayload = this.buildTemplatePayload({
			typeKey: params.typeKey,
			suggestion: params.suggestion,
			structuredPlan: params.structuredPlan,
			realm: params.realm,
			parentTemplateId: parentTemplate?.id ?? null,
			parentTemplateKey: parentTemplate?.type_key ?? null
		});

		if (!params.allowCreate) {
			return {
				template: null,
				created: false,
				plan: {
					typeKey: templatePayload.type_key,
					name: templatePayload.name,
					realm: params.realm,
					domain: params.suggestion.domain ?? '',
					deliverable: params.suggestion.deliverable ?? '',
					variant: params.suggestion.variant ?? null,
					parentTypeKey: parentTemplate?.type_key ?? null,
					metadata: templatePayload.metadata ?? null,
					schema: templatePayload.schema ?? null,
					facetDefaults: templatePayload.facet_defaults ?? null,
					rationale: params.suggestion.rationale ?? null
				}
			};
		}

		const createInput: CreateTemplateInput = {
			...templatePayload,
			scope: 'project',
			status: 'active',
			parent_template_id: templatePayload.parent_template_id,
			is_abstract: false,
			created_by: params.userId
		};

		const result = await TemplateCrudService.createTemplate(this.client, createInput);
		if (!result.success || !result.data) {
			throw new Error(result.error || 'Failed to create template');
		}

		return {
			template: result.data as TemplateRow,
			created: true
		};
	}

	private buildTemplatePayload(params: {
		typeKey: string;
		suggestion: TemplateAnalyzerSuggestion;
		structuredPlan: TemplateBrainDumpPlan | null;
		realm: string | null;
		parentTemplateId: string | null;
		parentTemplateKey: string | null;
	}): Omit<CreateTemplateInput, 'scope' | 'status' | 'created_by'> {
		const humanName =
			params.structuredPlan?.metadata?.name ??
			this.toTitleCase(params.typeKey.replace(/\./g, ' '));

		const schema = this.buildJsonSchema(params.structuredPlan?.schema);
		const metadata = {
			...(params.structuredPlan?.metadata ?? {}),
			realm: params.realm,
			analyzer: {
				rationale: params.suggestion.rationale,
				confidence: params.suggestion.confidence,
				match_level: params.suggestion.match_level,
				parent_suggestion: params.parentTemplateKey ?? null
			},
			open_questions: params.structuredPlan?.open_questions ?? []
		};

		return {
			type_key: params.typeKey,
			name: humanName,
			default_props: {},
			default_views: [],
			facet_defaults: params.structuredPlan?.facet_defaults ?? {},
			fsm: this.normalizeFSM(params.structuredPlan?.fsm),
			is_abstract: false,
			parent_template_id: params.parentTemplateId,
			schema,
			metadata
		};
	}

	private buildJsonSchema(schemaSpec?: TemplateBrainDumpPlan['schema'] | null): Json {
		if (!schemaSpec || schemaSpec.length === 0) {
			return this.defaultSchema();
		}

		const properties: Record<string, Json> = {};
		const required: string[] = [];

		for (const field of schemaSpec) {
			if (!field.field) continue;
			const key = this.toSlug(field.field)?.replace(/\./g, '_') ?? field.field;
			if (!key) continue;

			const type = this.mapFieldType(field.type);
			properties[key] = {
				type,
				description: field.description ?? undefined,
				enum: field.enum?.length ? field.enum : undefined,
				example: field.example ?? undefined
			};

			if (field.required) {
				required.push(key);
			}
		}

		return {
			type: 'object',
			properties,
			required
		};
	}

	private mapFieldType(input?: string | null): string {
		switch ((input ?? '').toLowerCase()) {
			case 'number':
			case 'integer':
				return 'number';
			case 'boolean':
				return 'boolean';
			case 'array':
				return 'array';
			case 'object':
				return 'object';
			default:
				return 'string';
		}
	}

	private normalizeFSM(planFSM?: TemplateBrainDumpPlan['fsm'] | null): Json | null {
		if (!planFSM) return null;
		const states = planFSM.states?.map((state) => ({
			key: state.key ?? this.toSlug(state.label ?? state.key ?? ''),
			label: state.label ?? this.toTitleCase(state.key ?? ''),
			initial: Boolean(state.initial),
			final: Boolean(state.final),
			description: state.description ?? null
		}));

		const transitions = planFSM.transitions?.map((transition) => ({
			id: transition.id ?? `${transition.from}_${transition.to}`,
			from: transition.from,
			to: transition.to,
			on: transition.on ?? transition.label ?? 'advance',
			label: transition.label ?? `${transition.from} → ${transition.to}`,
			description: transition.description ?? null,
			guard: transition.guard ?? null,
			actions: transition.actions ?? []
		}));

		if ((!states || states.length === 0) && (!transitions || transitions.length === 0)) {
			return null;
		}

		return {
			states,
			transitions
		};
	}

	private defaultSchema(): Json {
		return {
			type: 'object',
			properties: {
				title: {
					type: 'string',
					description: 'Title or name'
				},
				description: {
					type: 'string',
					description: 'Detailed description'
				}
			},
			required: ['title']
		};
	}

	private toTitleCase(value: string): string {
		return value
			.split(/[._\s]/g)
			.filter(Boolean)
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	private async fetchTemplateByTypeKey(typeKey: string): Promise<TemplateRow | null> {
		const { data, error } = await this.client
			.from('onto_templates')
			.select('*')
			.eq('type_key', typeKey)
			.maybeSingle();

		if (error && error.code !== 'PGRST116') {
			throw new Error(
				`[ProjectTemplateInference] Failed to fetch template ${typeKey}: ${error.message}`
			);
		}

		return (data as TemplateRow) ?? null;
	}

	private async resolveParentTemplate(params: {
		suggestion: TemplateAnalyzerSuggestion;
		cascade: CatalogCascade;
		realm: string | null;
	}): Promise<TemplateRow | null> {
		const orderedCandidates: string[] = [];
		if (params.suggestion.preferred_parent_type_key) {
			orderedCandidates.push(params.suggestion.preferred_parent_type_key);
		}

		if (params.suggestion.domain && params.suggestion.deliverable) {
			const baseKey = [params.suggestion.domain, params.suggestion.deliverable]
				.filter(Boolean)
				.join('.');
			orderedCandidates.push(baseKey);
		}

		if (!orderedCandidates.includes(DEFAULT_PARENT_TEMPLATE_KEY)) {
			orderedCandidates.push(DEFAULT_PARENT_TEMPLATE_KEY);
		}

		for (const candidate of orderedCandidates) {
			if (!candidate) continue;
			const template = await this.fetchTemplateByTypeKey(candidate);
			if (template) {
				return template;
			}
		}

		// As a final fallback, try any template within the same realm/deliverable
		const cascadeMatch = params.cascade.templates.find(
			(template) =>
				template.domain === params.suggestion.domain &&
				template.deliverable === params.suggestion.deliverable
		);

		if (cascadeMatch) {
			const template = await this.fetchTemplateByTypeKey(cascadeMatch.type_key);
			if (template) {
				return template;
			}
		}

		return null;
	}

	private async resolveTemplateSafe(typeKey: string): Promise<ResolvedTemplate | null> {
		try {
			return await resolveTemplateWithClient(this.client, typeKey, 'project');
		} catch (error) {
			console.error('[ProjectTemplateInference] Failed to resolve template', error);
			return null;
		}
	}
}
