// apps/web/src/lib/services/ontology/plan-generation.service.ts
import { SmartLLMService } from '$lib/services/smart-llm-service';

const MAX_CONTEXT_CHARS = 8000;
const MAX_PHASES_FOR_PROMPT = 30;
const DEFAULT_PLAN_TYPE_KEY = 'plan.project_phase';

export interface LegacyPhaseSummary {
	id: string;
	name: string;
	description: string | null;
	order: number;
	start_date: string;
	end_date: string;
	task_count: number;
	scheduling_method: string | null;
}

export interface ProjectNarrativeBundle {
	projectId: string;
	projectName: string;
	projectStatus: string;
	contextMarkdown: string | null;
	coreValues: Record<string, string | null>;
}

export interface GeneratedPlanSpec {
	legacy_phase_id: string | null;
	name: string;
	summary?: string;
	type_key?: string;
	state_key?: string;
	start_date?: string | null;
	end_date?: string | null;
	order?: number | null;
	confidence?: number;
}

interface PlanSynthesisResponse {
	plans: GeneratedPlanSpec[];
	reasoning?: string;
	confidence?: number;
}

export interface PlanGenerationPreview {
	plans: GeneratedPlanSpec[];
	reasoning?: string;
	confidence?: number;
	prompt: string;
	contextPreview: string | null;
	phasesPreview: LegacyPhaseSummary[];
}

export class PlanGenerationService {
	constructor(private readonly llm: SmartLLMService) {}

	async generatePlans(
		project: ProjectNarrativeBundle,
		phases: LegacyPhaseSummary[],
		userId: string
	): Promise<PlanGenerationPreview> {
		const trimmedContext = this.trimMarkdown(project.contextMarkdown ?? '');
		const limitedPhases = phases.slice(0, MAX_PHASES_FOR_PROMPT);
		const omittedPhases = Math.max(0, phases.length - limitedPhases.length);

		const systemPrompt = `You are an ontology migration expert tasked with transforming legacy project phases into structured ontology plans.
- Always return valid JSON matching the requested schema.
- Prefer concise summaries, max 3 sentences per plan.
- Default type_key to "${DEFAULT_PLAN_TYPE_KEY}" when unsure.
- Use ISO8601 dates (YYYY-MM-DD) or null when unavailable.
- If a generated plan maps directly to a legacy phase, include its legacy_phase_id.
- If combining or splitting phases, set legacy_phase_id to null and explain in the summary.
- Preserve chronological ordering and highlight critical dependencies in the summary when needed.
- Confidence values should be between 0 and 1.`;

		const userPrompt = this.buildUserPrompt(
			project,
			limitedPhases,
			trimmedContext,
			omittedPhases
		);

		const response = await this.llm.getJSONResponse<PlanSynthesisResponse>({
			systemPrompt,
			userPrompt,
			userId,
			profile: 'balanced',
			operationType: 'ontology_migration.plan_synthesis',
			requirements: {
				maxLatency: 20,
				minAccuracy: 0.7
			},
			temperature: 0.2,
			validation: {
				retryOnParseError: true,
				maxRetries: 2
			}
		});

		return {
			plans: (response?.plans ?? []).map((plan) => ({
				legacy_phase_id: plan.legacy_phase_id ?? null,
				name: plan.name,
				summary: plan.summary,
				type_key: plan.type_key ?? DEFAULT_PLAN_TYPE_KEY,
				state_key: plan.state_key ?? undefined,
				start_date: plan.start_date ?? null,
				end_date: plan.end_date ?? null,
				order: plan.order ?? null,
				confidence: plan.confidence
			})),
			reasoning: response?.reasoning,
			confidence: response?.confidence,
			prompt: userPrompt,
			contextPreview: trimmedContext || null,
			phasesPreview: limitedPhases
		};
	}

	private buildUserPrompt(
		project: ProjectNarrativeBundle,
		phases: LegacyPhaseSummary[],
		context: string,
		omittedCount: number
	): string {
		const coreValueMarkdown = this.formatCoreValues(project.coreValues);
		const contextSection = context
			? `### Legacy Context Markdown\n${context}`
			: '### Legacy Context Markdown\n_No context document was provided._';

		const phaseJson = JSON.stringify(
			phases.map((phase) => ({
				id: phase.id,
				name: phase.name,
				description: phase.description,
				start_date: phase.start_date,
				end_date: phase.end_date,
				order: phase.order,
				task_count: phase.task_count,
				scheduling_method: phase.scheduling_method
			})),
			null,
			2
		);

		const omittedNote = omittedCount
			? `Only the first ${phases.length} of ${phases.length + omittedCount} phases are shown due to context limits. When summarizing, mention that additional unspecified phases exist.`
			: 'All legacy phases are provided.';

		return `## Project Overview
- ID: ${project.projectId}
- Name: ${project.projectName}
- Status: ${project.projectStatus}
${coreValueMarkdown}

${contextSection}

### Legacy Phases (verbatim)
${phaseJson}

${omittedNote}

### Output Requirements
Return JSON: {"plans": Array<Plan>, "reasoning": string?, "confidence": number?}
Each Plan requires: legacy_phase_id|null, name, summary (<=3 sentences), type_key, state_key (planning|execution|complete|draft), start_date|null, end_date|null, order|null, confidence (0-1).
Ensure plans collectively cover the project's execution narrative using the provided context.`;
	}

	private trimMarkdown(markdown: string): string {
		if (!markdown) return '';
		if (markdown.length <= MAX_CONTEXT_CHARS) return markdown;
		return markdown.slice(0, MAX_CONTEXT_CHARS) + '\n\n...\n(Truncated for model input)';
	}

	private formatCoreValues(coreValues: Record<string, string | null>): string {
		const entries = Object.entries(coreValues ?? {}).filter(([, value]) => value?.trim());
		if (!entries.length) {
			return '### Core Values\n_Not provided._';
		}

		return (
			'### Core Values (Markdown)' +
			entries
				.map(
					([key, value]) =>
						`- **${this.toTitleCase(key.replace('core_', '').replace(/_/g, ' '))}**: ${value}`
				)
				.join('\n')
		);
	}

	private toTitleCase(input: string): string {
		return input
			.split(' ')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}
}
