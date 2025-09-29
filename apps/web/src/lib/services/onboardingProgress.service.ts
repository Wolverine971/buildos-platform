// src/lib/services/onboardingProgress.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { UserContext } from '$lib/types/user-context';

type SupabaseClientType = SupabaseClient<Database>;

export interface OnboardingProgressData {
	completed: boolean;
	progress: number;
	missingFields: string[];
	completedFields: string[];
	missingRequiredFields: string[];
	categoryProgress: Record<string, { completed: number; total: number; percentage: number }>;
}

export class OnboardingProgressService {
	private supabase: SupabaseClientType;

	// Updated fields focused on BuildOS utility (removed personal fields)
	// here
	private readonly ALL_FIELDS = [
		'input_challenges',
		'input_help_focus',
		'input_projects',
		'input_work_style'
	];

	// Essential fields for basic completion (reduced from personal to work-focused)
	private readonly REQUIRED_FIELDS = [
		'input_challenges',
		'input_help_focus',
		'input_projects',
		'input_work_style'
	];

	// Updated field categories matching new 4-question structure
	private readonly FIELD_CATEGORIES = {
		projects: ['active_projects', 'goals_overview', 'priorities'],
		work_style: [
			'work_style',
			'habits',
			'tools',
			'schedule_preferences',
			'workflows',
			'preferred_work_hours',
			'organization_method'
		],
		challenges: ['blockers', 'collaboration_needs', 'skill_gaps', 'productivity_challenges'],
		help_focus: ['help_priorities', 'focus_areas', 'communication_style']
	};

	constructor(supabase: SupabaseClientType) {
		this.supabase = supabase;
	}

	/**
	 * Get comprehensive onboarding progress for a user
	 */
	async getOnboardingProgress(userId: string): Promise<OnboardingProgressData> {
		try {
			// Get user context
			const { data: userContext, error } = await this.supabase
				.from('user_context')
				.select('*')
				.eq('user_id', userId)
				.single();

			if (error && error.code !== 'PGRST116') {
				throw error;
			}

			// Calculate progress
			return this.calculateProgress(userContext);
		} catch (error) {
			console.error('Error getting onboarding progress:', error);
			// Return default progress state
			return this.getDefaultProgress();
		}
	}

	/**
	 * Calculate progress from user context data
	 */
	private calculateProgress(userContext: UserContext | null): OnboardingProgressData {
		if (!userContext) {
			return this.getDefaultProgress();
		}

		// New 4 input fields for focused onboarding
		const inputFields = [
			'input_projects',
			'input_work_style',
			'input_challenges',
			'input_help_focus'
		];

		// Check if all input fields are completed
		const allInputFieldsCompleted = inputFields.every((field) => {
			const value = userContext[field as keyof UserContext];
			return value && value.trim() !== '';
		});

		// Find completed fields (existing logic for parsed fields)
		const completedFields = this.ALL_FIELDS.filter((field) => {
			const value = userContext[field as keyof UserContext];
			return value && value.trim() !== '';
		});

		// Find missing required fields
		const missingRequiredFields = this.REQUIRED_FIELDS.filter((field) => {
			const value = userContext[field as keyof UserContext];
			return !value || value.trim() === '';
		});

		// Find all missing fields
		const missingFields = this.ALL_FIELDS.filter((field) => !completedFields.includes(field));

		// Calculate overall progress percentage
		let progress = Math.round((completedFields.length / this.ALL_FIELDS.length) * 100);

		// Override progress to 100% if all input fields are completed
		if (allInputFieldsCompleted) {
			progress = 100;
		}

		// Calculate category progress based on new 4-category structure
		const categoryProgress: Record<
			string,
			{ completed: number; total: number; percentage: number }
		> = {};

		Object.entries(this.FIELD_CATEGORIES).forEach(([category, fields]) => {
			const completed = fields.filter((field) => completedFields.includes(field)).length;
			const total = fields.length;
			const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

			categoryProgress[category] = {
				completed,
				total,
				percentage
			};
		});

		// Determine if onboarding is considered complete
		// Focus on input completion rather than all parsed fields
		const completed = allInputFieldsCompleted || missingRequiredFields.length === 0;

		return {
			completed,
			progress,
			missingFields,
			completedFields,
			missingRequiredFields,
			categoryProgress
		};
	}

	/**
	 * Get default progress state (no context)
	 */
	private getDefaultProgress(): OnboardingProgressData {
		const categoryProgress: Record<
			string,
			{ completed: number; total: number; percentage: number }
		> = {};

		Object.entries(this.FIELD_CATEGORIES).forEach(([category, fields]) => {
			categoryProgress[category] = {
				completed: 0,
				total: fields.length,
				percentage: 0
			};
		});

		return {
			completed: false,
			progress: 0,
			missingFields: [...this.ALL_FIELDS],
			completedFields: [],
			missingRequiredFields: [...this.REQUIRED_FIELDS],
			categoryProgress
		};
	}

	/**
	 * Check if user needs to complete onboarding
	 */
	async needsOnboarding(userId: string): Promise<boolean> {
		const progress = await this.getOnboardingProgress(userId);
		return !progress.completed || progress.progress < 75; // Increased threshold since we have fewer questions
	}

	/**
	 * Get field display name (updated for new fields)
	 */
	getFieldDisplayName(field: string): string {
		const displayNames: Record<string, string> = {
			active_projects: 'Current Projects',
			goals_overview: 'Goals Overview',
			work_style: 'Work Style',
			habits: 'Work Habits',
			tools: 'Tools & Software',
			schedule_preferences: 'Schedule Preferences',
			workflows: 'Workflows',
			blockers: 'Current Blockers',
			collaboration_needs: 'Support Needed',
			skill_gaps: 'Skills to Develop',
			priorities: 'Current Priorities',
			help_priorities: 'Help Priorities',
			focus_areas: 'Focus Areas',
			productivity_challenges: 'Productivity Challenges',
			preferred_work_hours: 'Preferred Work Hours',
			communication_style: 'Communication Style',
			organization_method: 'Organization Method'
		};

		return displayNames[field] || field.replace('_', ' ');
	}

	/**
	 * Get category display info (updated for new 4-category structure)
	 */
	getCategoryInfo(category: string): { title: string; description: string; color: string } {
		const categoryInfo: Record<string, { title: string; description: string; color: string }> =
			{
				projects: {
					title: 'Current Projects & Initiatives',
					description: 'Your active projects, goals, and initiatives',
					color: 'text-blue-600 dark:text-blue-400'
				},
				work_style: {
					title: 'Work Style & Preferences',
					description: 'How you prefer to work and stay organized',
					color: 'text-green-600 dark:text-green-400'
				},
				challenges: {
					title: 'Current Challenges & Blockers',
					description: "What's slowing you down or causing friction",
					color: 'text-orange-600 dark:text-orange-400'
				},
				help_focus: {
					title: 'BuildOS Focus Areas',
					description: 'How BuildOS should help you most',
					color: 'text-purple-600 dark:text-purple-400'
				}
			};

		return (
			categoryInfo[category] || {
				title: category,
				description: '',
				color: 'text-gray-600 dark:text-gray-400'
			}
		);
	}
}
