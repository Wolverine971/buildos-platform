// src/lib/server/onboarding.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { RailwayWorkerService } from '$lib/services/railwayWorker.service';
import type { UserContext } from '$lib/types/user-context';

type SupabaseClientType = SupabaseClient<Database>;

export class OnboardingServerService {
	private supabase: SupabaseClientType;

	// Input column mapping (where raw input is stored)
	private readonly CATEGORY_INPUT_MAPPING: Record<string, keyof UserContext> = {
		projects: 'input_projects',
		work_style: 'input_work_style',
		challenges: 'input_challenges',
		help_focus: 'input_help_focus'
	};

	constructor(supabase: SupabaseClientType) {
		this.supabase = supabase;
	}

	/**
	 * Save multiple user inputs in a single call.
	 */
	async saveUserInputs(
		updates: Record<string, string | null | undefined>,
		userId: string
	): Promise<UserContext | null> {
		const sanitizedUpdates: Partial<UserContext> = {};

		for (const [category, value] of Object.entries(updates)) {
			const inputColumn = this.CATEGORY_INPUT_MAPPING[category];
			if (!inputColumn) continue;

			if (typeof value === 'string') {
				const trimmed = value.trim();
				sanitizedUpdates[inputColumn] = trimmed.length > 0 ? trimmed : '';
			} else {
				sanitizedUpdates[inputColumn] = '';
			}
		}

		let existingContext: UserContext | null = null;

		try {
			const { data, error } = await this.supabase
				.from('user_context')
				.select('*')
				.eq('user_id', userId)
				.single();

			if (error && error.code !== 'PGRST116') {
				throw error;
			}

			existingContext = data ?? null;
		} catch (error) {
			console.error('Error fetching user context before update:', error);
			throw new Error('Failed to fetch user context');
		}

		if (Object.keys(sanitizedUpdates).length === 0) {
			return existingContext;
		}

		const timestamp = new Date().toISOString();

		if (existingContext) {
			const { data, error } = await this.supabase
				.from('user_context')
				.update({
					...sanitizedUpdates,
					updated_at: timestamp
				})
				.eq('user_id', userId)
				.select()
				.single();

			if (error) {
				console.error('Error updating user context:', error);
				throw new Error(`Failed to save input: ${error.message}`);
			}

			return data;
		}

		const { data, error } = await this.supabase
			.from('user_context')
			.insert({
				user_id: userId,
				...sanitizedUpdates,
				created_at: timestamp,
				updated_at: timestamp
			})
			.select()
			.single();

		if (error) {
			console.error('Error creating user context:', error);
			throw new Error(`Failed to save input: ${error.message}`);
		}

		return data;
	}

	/**
	 * Save user input only - simplified version
	 */
	async saveUserInputOnly(voiceInput: string, category: string, userId: string): Promise<any> {
		if (!this.CATEGORY_INPUT_MAPPING[category]) {
			throw new Error(`Invalid category: ${category}`);
		}

		const context = await this.saveUserInputs({ [category]: voiceInput }, userId);
		if (!context) {
			throw new Error('Failed to save input');
		}

		return context;
	}

	/**
	 * Complete onboarding - simplified version
	 */
	async completeOnboarding(user: User): Promise<void> {
		// Mark onboarding as complete
		const { error } = await this.supabase
			.from('user_context')
			.update({
				onboarding_completed_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('user_id', user.id);

		if (error) {
			console.error('Error completing onboarding:', error);
			throw new Error(`Failed to complete onboarding: ${error.message}`);
		}

		// Queue onboarding analysis for question generation
		try {
			// Get the user's context to pass to the analysis
			const { data: context } = await this.supabase
				.from('user_context')
				.select('input_projects, input_work_style, input_challenges, input_help_focus')
				.eq('user_id', user.id)
				.single();

			if (context) {
				// Queue the analysis job
				const result = await RailwayWorkerService.queueOnboardingAnalysis(
					user.id,
					{
						input_projects: context.input_projects,
						input_work_style: context.input_work_style,
						input_challenges: context.input_challenges,
						input_help_focus: context.input_help_focus
					},
					{
						maxQuestions: 5 // Generate up to 5 initial questions
					}
				);

				console.log(`Queued onboarding analysis for user ${user.id}:`, result);
			}
		} catch (queueError) {
			// Log the error but don't fail the onboarding completion
			console.error('Failed to queue onboarding analysis:', queueError);
		}
	}

	/**
	 * Get user context summary - simplified version
	 */
	async getUserContextSummary(userId: string): Promise<{
		context: any | null;
		inputs: {
			input_projects: string | null;
			input_work_style: string | null;
			input_challenges: string | null;
			input_help_focus: string | null;
		};
		completionStatus: {
			projects: boolean;
			work_style: boolean;
			challenges: boolean;
			help_focus: boolean;
		};
		overallProgress: number;
	}> {
		const { data: context } = await this.supabase
			.from('user_context')
			.select('*')
			.eq('user_id', userId)
			.single();

		const inputs = {
			input_projects: context?.input_projects || null,
			input_work_style: context?.input_work_style || null,
			input_challenges: context?.input_challenges || null,
			input_help_focus: context?.input_help_focus || null
		};

		const completionStatus = {
			projects: !!inputs.input_projects?.trim(),
			work_style: !!inputs.input_work_style?.trim(),
			challenges: !!inputs.input_challenges?.trim(),
			help_focus: !!inputs.input_help_focus?.trim()
		};

		const completedCount = Object.values(completionStatus).filter(Boolean).length;
		const overallProgress = Math.round((completedCount / 4) * 100);

		return {
			context,
			inputs,
			completionStatus,
			overallProgress
		};
	}
}
