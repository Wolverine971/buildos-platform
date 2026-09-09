import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { ONBOARDING_STEPS, onboardingProgress, onboardingStep } from '$lib/utils/onboarding-state';

export interface OnboardingProgressData {
	completed: boolean;
	progress: number;
	missingFields: string[];
	completedFields: string[];
	missingRequiredFields: string[];
	categoryProgress: Record<string, { completed: number; total: number; percentage: number }>;
}

/** Navigation and the flow use committed V3 milestones, never legacy questionnaire fields. */
export class OnboardingProgressService {
	constructor(private supabase: SupabaseClient<Database>) {}

	async getOnboardingProgress(userId: string): Promise<OnboardingProgressData> {
		const { data, error } = await this.supabase
			.from('users')
			.select(
				'onboarding_completed_at, onboarding_step, onboarding_intent, onboarding_stakes'
			)
			.eq('id', userId)
			.single();
		if (error) throw error;
		const completed = Boolean(data.onboarding_completed_at);
		const step = onboardingStep(
			data.onboarding_step,
			data.onboarding_intent,
			data.onboarding_stakes
		);
		const completedFields = ONBOARDING_STEPS.filter((_, index) => completed || index < step);
		const missingFields = ONBOARDING_STEPS.filter((label) => !completedFields.includes(label));
		return {
			completed,
			progress: onboardingProgress(step, completed),
			completedFields,
			missingFields,
			missingRequiredFields: missingFields,
			categoryProgress: Object.fromEntries(
				ONBOARDING_STEPS.map((label) => [
					label,
					{
						completed: completedFields.includes(label) ? 1 : 0,
						total: 1,
						percentage: completedFields.includes(label) ? 100 : 0
					}
				])
			)
		};
	}

	async needsOnboarding(userId: string): Promise<boolean> {
		return !(await this.getOnboardingProgress(userId)).completed;
	}
}
