// apps/web/src/lib/services/ontology/project-props-generation.service.ts
import type { Json } from '@buildos/shared-types';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import type { ResolvedTemplate } from './template-resolver.service';
import type { TemplateBrainDumpPlan } from '$lib/types/template-builder';
import type { Facets } from '$lib/types/onto';
import type { Database } from '@buildos/shared-types';

type LegacyProjectRow = Database['public']['Tables']['projects']['Row'];

interface TemplateFieldDescriptor {
	key: string;
	type: string;
	required: boolean;
	description?: string;
}

interface LLMPropsResponse {
	props: Record<string, unknown>;
	facets?: Facets | null;
	confidence?: number;
	notes?: string | null;
}

export interface ProjectPropsGenerationResult {
	props: Record<string, unknown> | null;
	facets?: Facets | null;
	confidence?: number | null;
	notes?: string | null;
	raw?: Json | null;
}

export class ProjectPropsGenerationService {
	constructor(private readonly llm: SmartLLMService) {}

	async generate(options: {
		project: LegacyProjectRow;
		template: ResolvedTemplate;
		structuredPlan?: TemplateBrainDumpPlan | null;
		coreValues: Record<string, string | null>;
		userId: string;
		dryRun?: boolean;
	}): Promise<ProjectPropsGenerationResult | null> {
		const fields = this.extractFields(options.template);
		if (!fields.length) {
			return null;
		}

		const prompt = this.buildPrompt({
			project: options.project,
			template: options.template,
			structuredPlan: options.structuredPlan,
			coreValues: options.coreValues,
			fields
		});

		try {
			const response = await this.llm.getJSONResponse<LLMPropsResponse>({
				systemPrompt:
					'You fill ontology template fields using provided schema and project narrative. Return JSON with props, facets, confidence, and notes.',
				userPrompt: prompt,
				userId: options.userId,
				profile: 'balanced',
				temperature: 0.2,
				validation: {
					retryOnParseError: true,
					maxRetries: 2
				},
				operationType: 'ontology_migration.project_props'
			});

			if (!response?.props) {
				return null;
			}

			return {
				props: response.props,
				facets: response.facets ?? null,
				confidence: typeof response.confidence === 'number' ? response.confidence : null,
				notes: response.notes ?? null,
				raw: response as Json
			};
		} catch (error) {
			console.error('[ProjectPropsGeneration] LLM mapping failed', error);
			return null;
		}
	}

	private extractFields(template: ResolvedTemplate): TemplateFieldDescriptor[] {
		const properties = template.schema?.properties ?? {};
		const requiredSet = new Set(template.schema?.required ?? []);

		return Object.entries(properties).map(([key, definition]) => ({
			key,
			type:
				typeof (definition as any).type === 'string'
					? ((definition as any).type as string)
					: 'string',
			required: requiredSet.has(key),
			description:
				(typeof (definition as any).description === 'string'
					? ((definition as any).description as string)
					: undefined) ?? undefined
		}));
	}

	private buildPrompt(params: {
		project: LegacyProjectRow;
		template: ResolvedTemplate;
		structuredPlan?: TemplateBrainDumpPlan | null;
		coreValues: Record<string, string | null>;
		fields: TemplateFieldDescriptor[];
	}): string {
		const fieldText = params.fields
			.map(
				(field) =>
					`- ${field.key}: type=${field.type}${field.required ? ' (required)' : ''}${
						field.description ? ` — ${field.description}` : ''
					}`
			)
			.join('\n');

		const coreValueLines = Object.entries(params.coreValues)
			.filter(([, value]) => value)
			.map(([key, value]) => `- ${key}: ${value}`)
			.join('\n');

		const summarySegments = [
			`Template Type Key: ${params.template.type_key}`,
			params.template.metadata?.realm ? `Realm: ${params.template.metadata.realm}` : '',
			params.template.metadata?.summary
				? `Template Summary: ${params.template.metadata.summary}`
				: '',
			params.structuredPlan?.metadata?.summary
				? `Structured Plan Summary: ${params.structuredPlan.metadata.summary}`
				: ''
		]
			.filter(Boolean)
			.join('\n');

		const projectSegments = [
			`Project Name: ${params.project.name}`,
			`Status: ${params.project.status}`,
			params.project.description ? `Description:\n${params.project.description}` : '',
			params.project.context ? `Context Markdown:\n${params.project.context}` : '',
			params.project.executive_summary
				? `Executive Summary:\n${params.project.executive_summary}`
				: '',
			params.project.tags?.length ? `Tags: ${params.project.tags.join(', ')}` : ''
		]
			.filter(Boolean)
			.join('\n\n');

		return `Fill the template fields below using the legacy project narrative. All values must be JSON-compatible.

Template Overview:
${summarySegments}

Field Schema:
${fieldText}

Project Narrative:
${projectSegments}

Core Values:
${coreValueLines || 'None provided'}

Return JSON:
{
  "props": {
    "<fieldKey>": <value>
  },
  "facets": {
    "context": "optional",
    "scale": "optional",
    "stage": "optional"
  },
  "confidence": 0.0-1.0,
  "notes": "string"
}

Only include keys specified in the schema. If data is unavailable, set value to null but keep the key for required fields.`;
	}
}
