// apps/web/src/lib/server/onboarding.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { queueOnboardingAnalysis } from '$lib/server/onboarding-analysis.service';
import {
	seedProfileFromOnboarding,
	type OnboardingV3SeedData
} from '$lib/server/onboarding-profile-seed.service';
import type { UserContext } from '$lib/types/user-context';

type SupabaseClientType = SupabaseClient<Database>;
type OnboardingInputKey =
	| 'input_projects'
	| 'input_work_style'
	| 'input_challenges'
	| 'input_help_focus';

export class OnboardingServerService {
	private supabase: SupabaseClientType;

	// Input column mapping (where raw input is stored)
	private readonly CATEGORY_INPUT_MAPPING: Record<string, OnboardingInputKey> = {
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
		const sanitizedUpdates: Partial<Record<OnboardingInputKey, string>> = {};

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
					...(sanitizedUpdates as Partial<UserContext>),
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
				...(sanitizedUpdates as Partial<UserContext>),
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
				const result = await queueOnboardingAnalysis({
					userId: user.id,
					userContext: {
						input_projects: context.input_projects,
						input_work_style: context.input_work_style,
						input_challenges: context.input_challenges,
						input_help_focus: context.input_help_focus
					},
					options: {
						maxQuestions: 5 // Generate up to 5 initial questions
					}
				});

				if (!result.queued) {
					console.warn(
						`Failed to queue onboarding analysis for user ${user.id}:`,
						result.reason
					);
				} else {
					console.log(`Queued onboarding analysis for user ${user.id}:`, result.jobId);
				}
			}
		} catch (queueError) {
			// Log the error but don't fail the onboarding completion
			console.error('Failed to queue onboarding analysis:', queueError);
		}
	}

	/**
	 * V3: Save onboarding intent and stakes to users table
	 */
	async saveIntentAndStakes(intent: string, stakes: string, userId: string): Promise<void> {
		const { error } = await this.supabase
			.from('users')
			.update({
				onboarding_intent: intent,
				onboarding_stakes: stakes
			} as any)
			.eq('id', userId);

		if (error) {
			console.error('Error saving intent/stakes:', error);
			throw new Error(`Failed to save intent/stakes: ${error.message}`);
		}
	}

	/**
	 * V3: Complete onboarding, seed behavioral profile, and queue analysis
	 */
	async completeOnboardingV3(
		userId: string,
		onboardingData: {
			intent: string;
			stakes: string;
			projectsCreated: number;
			tasksCreated: number;
			goalsCreated?: number;
			smsEnabled: boolean;
			emailEnabled: boolean;
			timeSpentSeconds?: number;
		}
	): Promise<void> {
		const completedAt = new Date().toISOString();

		// 1. Mark onboarding complete on users table
		const { error: userError } = await this.supabase
			.from('users')
			.update({
				completed_onboarding: true,
				onboarding_intent: onboardingData.intent,
				onboarding_stakes: onboardingData.stakes,
				onboarding_v2_completed_at: completedAt
			})
			.eq('id', userId);

		if (userError) {
			console.error('Error completing onboarding (users):', userError);
			throw new Error(`Failed to complete onboarding: ${userError.message}`);
		}

		// 2. Mark complete on user_context table (backward compat).
		// Create a row if this user never had one (e.g. V3 users who skipped legacy prompts).
		const { data: updatedContext, error: contextUpdateError } = await this.supabase
			.from('user_context')
			.update({
				onboarding_completed_at: completedAt,
				onboarding_version: 3,
				updated_at: completedAt
			} as any)
			.eq('user_id', userId)
			.select('user_id')
			.maybeSingle();

		if (contextUpdateError) {
			console.error(
				'Error updating onboarding completion in user_context (non-fatal):',
				contextUpdateError
			);
		} else if (!updatedContext) {
			const { error: contextInsertError } = await this.supabase.from('user_context').insert({
				user_id: userId,
				onboarding_completed_at: completedAt,
				onboarding_version: 3,
				created_at: completedAt,
				updated_at: completedAt
			} as any);

			if (contextInsertError) {
				console.error(
					'Error creating onboarding completion row in user_context (non-fatal):',
					contextInsertError
				);
			}
		}

		// 3. Seed behavioral profile (non-fatal)
		try {
			await seedProfileFromOnboarding(userId, {
				intent: onboardingData.intent as OnboardingV3SeedData['intent'],
				stakes: onboardingData.stakes as OnboardingV3SeedData['stakes'],
				projectsCreated: onboardingData.projectsCreated,
				tasksCreated: onboardingData.tasksCreated,
				goalsCreated: onboardingData.goalsCreated ?? 0,
				smsEnabled: onboardingData.smsEnabled,
				emailEnabled: onboardingData.emailEnabled,
				timeSpentSeconds: onboardingData.timeSpentSeconds
			});
		} catch (seedError) {
			console.error('Failed to seed behavioral profile (non-fatal):', seedError);
		}

		// 4. Queue onboarding analysis (non-fatal)
		try {
			const result = await queueOnboardingAnalysis({
				userId,
				userContext: {},
				options: { maxQuestions: 5 }
			});

			if (!result.queued) {
				console.warn(`Failed to queue analysis for ${userId}:`, result.reason);
			}
		} catch (queueError) {
			console.error('Failed to queue onboarding analysis (non-fatal):', queueError);
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
