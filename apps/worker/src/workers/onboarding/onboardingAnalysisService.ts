// apps/worker/src/workers/onboarding/onboardingAnalysisService.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database } from '@buildos/shared-types';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import { OnboardingAnalysisPrompt } from './prompts';

interface OnboardingAnalysisLLMResponse {
	questions: Array<{
		question: string;
		category: string;
		priority: string;
		context: string;
		expected_outcome: string;
		source_field: string;
		triggers?: string[];
	}>;
	analysis?: unknown;
	insights?: unknown;
}

type OnboardingUserContext = Partial<
	Pick<
		Database['public']['Tables']['user_context']['Row'],
		'input_challenges' | 'input_help_focus' | 'input_projects' | 'input_work_style'
	>
>;

type UserContextUpdate = Database['public']['Tables']['user_context']['Update'];

export type OnboardingQuestionPriority = 'high' | 'medium' | 'low';

/**
 * Keep model output inside project_questions_priority_check. Older prompts
 * advertised "highest", which is not a database value and caused the entire
 * onboarding insert to fail when the model followed that instruction.
 */
export function normalizeOnboardingQuestionPriority(value: unknown): OnboardingQuestionPriority {
	if (typeof value !== 'string') return 'medium';

	switch (value.trim().toLowerCase()) {
		case 'highest':
		case 'high':
			return 'high';
		case 'low':
			return 'low';
		case 'medium':
		default:
			return 'medium';
	}
}

export class OnboardingAnalysisService {
	private supabase: TypedSupabaseClient;
	private llmService: SmartLLMService;

	constructor(supabase: TypedSupabaseClient) {
		this.supabase = supabase;
		this.llmService = new SmartLLMService({
			supabase,
			httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
			appName: 'BuildOS Onboarding Analyst'
		});
	}

	async generateOnboardingQuestions(
		userId: string,
		userContext: OnboardingUserContext,
		options?: { forceRegenerate?: boolean; maxQuestions?: number }
	) {
		// Check for existing active questions if not forcing regeneration
		if (!options?.forceRegenerate) {
			const { data: existingQuestions } = await this.supabase
				.from('project_questions')
				.select('*')
				.eq('user_id', userId)
				.eq('status', 'active')
				.is('project_id', null); // Onboarding questions have no project
			console.log(existingQuestions?.length);

			if (existingQuestions && existingQuestions.length > 0) {
				console.log(
					`User ${userId} already has ${existingQuestions.length} active onboarding questions`
				);
				return { questions: existingQuestions, analysis: { existing: true } };
			}
		}

		// Extract relevant fields
		const onboardingData = {
			input_projects: userContext.input_projects ?? undefined,
			input_work_style: userContext.input_work_style ?? undefined,
			input_challenges: userContext.input_challenges ?? undefined,
			input_help_focus: userContext.input_help_focus ?? undefined
		};

		// Generate questions using LLM
		const result = await this.llmService.getJSONResponse<OnboardingAnalysisLLMResponse>({
			systemPrompt: OnboardingAnalysisPrompt.getSystemPrompt(),
			userPrompt: OnboardingAnalysisPrompt.getUserPrompt(onboardingData),
			userId,
			profile: 'balanced',
			temperature: 0.6,
			validation: {
				retryOnParseError: true,
				maxRetries: 2
			}
		});

		// Validate response structure
		if (!result.questions || !Array.isArray(result.questions)) {
			throw new Error('Invalid response format from LLM');
		}

		// Limit questions if specified
		const questionsToStore = options?.maxQuestions
			? result.questions.slice(0, options.maxQuestions)
			: result.questions;

		// Store questions in database
		const questions = questionsToStore.map((question) => ({
			user_id: userId,
			question: question.question,
			category: question.category,
			priority: normalizeOnboardingQuestionPriority(question.priority),
			context: question.context,
			expected_outcome: question.expected_outcome,
			source: 'onboarding' as const,
			source_field: question.source_field,
			triggers: question.triggers,
			status: 'active' as const
		}));

		const { data: insertedQuestions, error } = await this.supabase
			.from('project_questions')
			.insert(questions)
			.select();

		if (error) {
			throw new Error(`Failed to insert questions: ${error.message}`);
		}

		// Update user context to mark fields as parsed
		const updateData: UserContextUpdate = {};
		if (userContext.input_projects)
			updateData.last_parsed_input_projects = userContext.input_projects;
		if (userContext.input_work_style)
			updateData.last_parsed_input_work_style = userContext.input_work_style;
		if (userContext.input_challenges)
			updateData.last_parsed_input_challenges = userContext.input_challenges;
		if (userContext.input_help_focus)
			updateData.last_parsed_input_help_focus = userContext.input_help_focus;

		await this.supabase.from('user_context').update(updateData).eq('user_id', userId);

		return {
			questions: insertedQuestions || [],
			analysis: result.analysis,
			insights: result.insights
		};
	}
}
