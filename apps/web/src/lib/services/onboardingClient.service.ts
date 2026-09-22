// apps/web/src/lib/services/onboardingClient.service.ts
import type { UserContext } from '$lib/types/user-context';

/**
 * Client-side onboarding service for handling user input display
 */
export class OnboardingClientService {
	// Map categories to input column names
	private static readonly CATEGORY_INPUT_MAPPING: Record<string, keyof UserContext> = {
		projects: 'input_projects',
		work_style: 'input_work_style',
		challenges: 'input_challenges',
		help_focus: 'input_help_focus'
	};

	private static readonly CATEGORIES = ['projects', 'work_style', 'challenges', 'help_focus'];

	/**
	 * Save user input ONLY (no parsing) - for auto-saves
	 */
	static async saveUserInputOnly(
		voiceInput: string,
		category: string,
		options: { appendMode?: boolean } = {}
	): Promise<UserContext> {
		const response = await fetch('/api/onboarding', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				action: 'save_input_only',
				voiceInput,
				category,
				appendMode: options.appendMode || false
			})
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ error: 'Failed to save input' }));
			throw new Error(error.error || 'Failed to save user input');
		}

		const result = await response.json();
		if (!result?.success || !result?.data?.context) {
			throw new Error('Invalid response format from server');
		}
		return result.data.context;
	}

	/**
	 * Get user context summary with input data
	 */
	static async getUserContextSummary(): Promise<{
		context: UserContext | null;
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
		const response = await fetch('/api/onboarding', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				action: 'summary'
			})
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ error: 'Failed to get summary' }));
			throw new Error(error.error || 'Failed to get user context summary');
		}

		const result = await response.json();
		if (!result?.success || !result?.data) {
			throw new Error('Invalid response format from server');
		}
		return {
			context: result.data.context,
			inputs: result.data.inputs,
			completionStatus: result.data.completionStatus,
			overallProgress: result.data.overallProgress
		};
	}

	/**
	 * Complete onboarding
	 */
	static async completeOnboarding(): Promise<void> {
		const response = await fetch('/api/onboarding', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				action: 'complete'
			})
		});

		if (!response.ok) {
			const error = await response
				.json()
				.catch(() => ({ error: 'Failed to complete onboarding' }));
			throw new Error(error.error || 'Failed to complete onboarding');
		}
	}

	/**
	 * Get user input for a specific category
	 */
	static getUserInputForCategory(context: UserContext | null, category: string): string {
		if (!context) return '';

		const inputColumn = this.CATEGORY_INPUT_MAPPING[category];
		if (!inputColumn) return '';

		const input = context[inputColumn];
		return input && typeof input === 'string' ? input : '';
	}

	/**
	 * Check if a category has user input content
	 */
	static hasCategoryContent(context: UserContext | null, category: string): boolean {
		if (!context) return false;

		const inputColumn = this.CATEGORY_INPUT_MAPPING[category];
		if (!inputColumn) return false;

		const input = context[inputColumn];
		return !!(input && typeof input === 'string' && input.trim().length > 0);
	}

	/**
	 * Calculate completion percentage based on input data
	 */
	static calculateCompletionPercentage(context: UserContext | null): number {
		if (!context) return 0;

		const completedCategories = this.CATEGORIES.filter((category) =>
			this.hasCategoryContent(context, category)
		);

		return Math.round((completedCategories.length / this.CATEGORIES.length) * 100);
	}

	/**
	 * Check if user can complete onboarding (at least 3 of 4 categories filled)
	 */
	static canCompleteOnboarding(context: UserContext | null): boolean {
		if (!context) return false;

		// Require at least 3 of 4 categories to be filled
		const completedCount = this.CATEGORIES.filter((category) =>
			this.hasCategoryContent(context, category)
		).length;

		return completedCount >= 3;
	}

	/**
	 * Get next recommended step based on completion status
	 */
	static getNextRecommendedStep(context: UserContext | null): number {
		if (!context) return 0;

		// Find first incomplete category
		for (let i = 0; i < this.CATEGORIES.length; i++) {
			if (!this.hasCategoryContent(context, this.CATEGORIES[i]!)) {
				return i;
			}
		}

		// All categories complete, return last step
		return this.CATEGORIES.length - 1;
	}
}
