// apps/web/src/lib/services/onboarding-v2.service.ts
/**
 * Onboarding V2 Service
 *
 * Handles all onboarding v2 related database operations including:
 * - Progress tracking
 * - Archetype selection
 * - Productivity challenges
 * - Skip state management
 * - Completion tracking
 * - User preferences capture (saveUserPreferences method)
 *
 * @see /apps/web/docs/features/onboarding/README.md - Onboarding flow overview
 * @see /apps/web/docs/features/onboarding/ONBOARDING_V2_UPDATE_ASSESSMENT.md - Implementation details
 * @see /apps/web/docs/features/preferences/README.md - User preferences system
 */

import { supabase } from '$lib/supabase';
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserPreferences } from '$lib/types/user-preferences';

type User = Database['public']['Tables']['users']['Row'];
type UserSMSPreferences = Database['public']['Tables']['user_sms_preferences']['Row'];
type Project = Database['public']['Tables']['projects']['Row'];

export interface OnboardingProgress {
	currentStep: number;
	completedSteps: string[];
	skippedSteps: string[];
	archetype?: string;
	challenges: string[];
	hasPhoneVerified: boolean;
	hasCreatedProjects: boolean;
	projectsCreated: number;
	completedAt?: string;
}

export interface OnboardingStepData {
	stepId: string;
	isComplete: boolean;
	isSkipped: boolean;
	data?: Record<string, unknown>;
}

export class OnboardingV2Service {
	private get client(): SupabaseClient<Database> {
		const client = supabase;
		if (!client) {
			throw new Error('Supabase client is not initialized');
		}
		return client;
	}

	/**
	 * Get onboarding progress for a user
	 */
	async getProgress(userId: string): Promise<OnboardingProgress> {
		const client = this.client;
		// Fetch user data
		const { data: user } = await client
			.from('users')
			.select(
				'usage_archetype, productivity_challenges, onboarding_v2_completed_at, onboarding_v2_skipped_calendar, onboarding_v2_skipped_sms'
			)
			.eq('id', userId)
			.single();

		// Fetch SMS preferences
		const { data: smsPrefs } = await client
			.from('user_sms_preferences')
			.select('phone_verified')
			.eq('user_id', userId)
			.maybeSingle();

		// Fetch projects
		const { data: projects } = await client.from('projects').select('id').eq('user_id', userId);

		return {
			currentStep: this.calculateCurrentStep(user),
			completedSteps: this.getCompletedSteps(user),
			skippedSteps: this.getSkippedSteps(user),
			archetype: user?.usage_archetype || undefined,
			challenges: (user?.productivity_challenges as string[]) || [],
			hasPhoneVerified: smsPrefs?.phone_verified || false,
			hasCreatedProjects: (projects?.length || 0) > 0,
			projectsCreated: projects?.length || 0,
			completedAt: user?.onboarding_v2_completed_at || undefined
		};
	}

	/**
	 * Save user archetype selection
	 */
	async saveArchetype(userId: string, archetype: string) {
		const client = this.client;
		const { data, error } = await client
			.from('users')
			.update({ usage_archetype: archetype })
			.eq('id', userId)
			.select()
			.single();

		if (error) {
			console.error('Failed to save archetype:', error);
			throw new Error('Failed to save archetype');
		}

		return { success: true, data };
	}

	/**
	 * Save productivity challenges
	 */
	async saveChallenges(userId: string, challenges: string[]) {
		const client = this.client;
		const { data, error } = await client
			.from('users')
			.update({ productivity_challenges: challenges })
			.eq('id', userId)
			.select()
			.single();

		if (error) {
			console.error('Failed to save challenges:', error);
			throw new Error('Failed to save challenges');
		}

		return { success: true, data };
	}

	/**
	 * Save user communication preferences
	 */
	async savePreferences(userId: string, preferences: UserPreferences) {
		const client = this.client;

		const { data: existing, error: fetchError } = await client
			.from('users')
			.select('preferences')
			.eq('id', userId)
			.single();

		if (fetchError) {
			console.error('Failed to fetch existing preferences:', fetchError);
			throw new Error('Failed to fetch existing preferences');
		}

		const existingPrefs =
			existing?.preferences &&
			typeof existing.preferences === 'object' &&
			!Array.isArray(existing.preferences)
				? (existing.preferences as Record<string, unknown>)
				: {};

		const mergedPreferences = {
			...existingPrefs,
			...preferences
		};

		const { data, error } = await client
			.from('users')
			.update({ preferences: mergedPreferences })
			.eq('id', userId)
			.select()
			.single();

		if (error) {
			console.error('Failed to save preferences:', error);
			throw new Error('Failed to save preferences');
		}

		return { success: true, data };
	}

	/**
	 * Mark calendar analysis as skipped
	 */
	async markCalendarSkipped(userId: string, skipped: boolean = true) {
		const client = this.client;
		const { data, error } = await client
			.from('users')
			.update({ onboarding_v2_skipped_calendar: skipped })
			.eq('id', userId)
			.select()
			.single();

		if (error) {
			console.error('Failed to update calendar skip status:', error);
			throw new Error('Failed to update calendar skip status');
		}

		return { success: true, data };
	}

	/**
	 * Mark SMS setup as skipped
	 */
	async markSMSSkipped(userId: string, skipped: boolean = true) {
		const client = this.client;
		const { data, error } = await client
			.from('users')
			.update({ onboarding_v2_skipped_sms: skipped })
			.eq('id', userId)
			.select()
			.single();

		if (error) {
			console.error('Failed to update SMS skip status:', error);
			throw new Error('Failed to update SMS skip status');
		}

		return { success: true, data };
	}

	/**
	 * Complete onboarding v2
	 */
	async completeOnboarding(userId: string) {
		const client = this.client;
		const { data, error } = await client
			.from('users')
			.update({
				onboarding_v2_completed_at: new Date().toISOString(),
				completed_onboarding: true
			})
			.eq('id', userId)
			.select()
			.single();

		if (error) {
			console.error('Failed to complete onboarding:', error);
			throw new Error('Failed to complete onboarding');
		}

		return { success: true, data };
	}

	/**
	 * Update onboarding version in user_context
	 */
	async updateOnboardingVersion(userId: string, version: number = 2) {
		const client = this.client;
		const { data, error } = await client
			.from('user_context')
			.update({ onboarding_version: version })
			.eq('user_id', userId)
			.select()
			.single();

		if (error) {
			console.error('Failed to update onboarding version:', error);
			throw new Error('Failed to update onboarding version');
		}

		return { success: true, data };
	}

	/**
	 * Check if user has completed onboarding v2
	 */
	async hasCompletedOnboarding(userId: string): Promise<boolean> {
		const client = this.client;
		const { data } = await client
			.from('users')
			.select('onboarding_v2_completed_at')
			.eq('id', userId)
			.single();

		return !!data?.onboarding_v2_completed_at;
	}

	/**
	 * Calculate current step based on user data
	 */
	private calculateCurrentStep(user: Partial<User> | null): number {
		if (!user) return 0; // Welcome step

		// Check archetype (step 3)
		if (!user.usage_archetype) return 3;

		// Check challenges (step 4)
		const challenges = user.productivity_challenges as string[] | null;
		if (!challenges || challenges.length === 0) return 4;

		// All core steps complete, show summary
		return 5;
	}

	/**
	 * Get list of completed steps
	 */
	private getCompletedSteps(user: Partial<User> | null): string[] {
		const completed: string[] = [];

		if (!user) return completed;

		// Welcome is always completed once user data exists
		completed.push('welcome');

		// Check archetype step
		if (user.usage_archetype) {
			completed.push('archetype');
		}

		// Check challenges step
		const challenges = user.productivity_challenges as string[] | null;
		if (challenges && challenges.length > 0) {
			completed.push('challenges');
		}

		// Check completion
		if (user.onboarding_v2_completed_at) {
			completed.push('summary');
		}

		return completed;
	}

	/**
	 * Get list of skipped steps
	 */
	private getSkippedSteps(user: Partial<User> | null): string[] {
		const skipped: string[] = [];

		if (!user) return skipped;

		if (user.onboarding_v2_skipped_calendar) {
			skipped.push('calendar');
		}

		if (user.onboarding_v2_skipped_sms) {
			skipped.push('notifications');
		}

		return skipped;
	}

	/**
	 * Reset onboarding progress (for testing)
	 */
	async resetOnboarding(userId: string) {
		const client = this.client;
		const { data, error } = await client
			.from('users')
			.update({
				usage_archetype: null,
				productivity_challenges: [],
				onboarding_v2_completed_at: null,
				onboarding_v2_skipped_calendar: false,
				onboarding_v2_skipped_sms: false,
				completed_onboarding: false
			})
			.eq('id', userId)
			.select()
			.single();

		if (error) {
			console.error('Failed to reset onboarding:', error);
			throw new Error('Failed to reset onboarding');
		}

		// Also reset user_context version
		await client.from('user_context').update({ onboarding_version: 1 }).eq('user_id', userId);

		return { success: true, data };
	}
}

// Export singleton instance
export const onboardingV2Service = new OnboardingV2Service();
