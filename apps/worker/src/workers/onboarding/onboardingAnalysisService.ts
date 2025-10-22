// apps/worker/src/workers/onboarding/onboardingAnalysisService.ts
import type { SupabaseClient } from '@supabase/supabase-js';
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
	analysis?: any;
	insights?: any;
}

export class OnboardingAnalysisService {
	private supabase: SupabaseClient<Database>;
	private llmService: SmartLLMService;

	constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
		this.llmService = new SmartLLMService({
			supabase,
			httpReferer: process.env.PUBLIC_APP_URL || 'https://build-os.com',
			appName: 'BuildOS Onboarding Analyst'
		});
	}

	async generateOnboardingQuestions(
		userId: string,
		userContext: any,
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
			input_projects: userContext.input_projects,
			input_work_style: userContext.input_work_style,
			input_challenges: userContext.input_challenges,
			input_help_focus: userContext.input_help_focus
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
		const questions = questionsToStore.map((q: any) => ({
			user_id: userId,
			question: q.question,
			category: q.category,
			priority: q.priority,
			context: q.context,
			expected_outcome: q.expected_outcome,
			source: 'onboarding' as const,
			source_field: q.source_field,
			triggers: q.triggers,
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
		const updateData: any = {};
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
