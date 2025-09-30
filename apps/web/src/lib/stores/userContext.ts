// apps/web/src/lib/stores/userContext.ts
import { writable } from 'svelte/store';
import type { UserContext } from '$lib/types/user-context';
import { OnboardingClientService } from '$lib/services/onboardingClient.service';

interface UserContextState {
	context: UserContext | null;
	loading: boolean;
	error: string | null;
	completedOnboarding: boolean;
	progress: {
		percentage: number;
		completedCategories: string[];
		missingCategories: string[];
	};
}

function createUserContextStore() {
	const { subscribe, set, update } = writable<UserContextState>({
		context: null,
		loading: false,
		error: null,
		completedOnboarding: false,
		progress: {
			percentage: 0,
			completedCategories: [],
			missingCategories: ['projects', 'work_style', 'challenges', 'help_focus']
		}
	});

	return {
		subscribe,

		initialize(userData: { context: UserContext | null; completedOnboarding: boolean }) {
			const progress = userData.context
				? this.calculateProgress(userData.context)
				: {
						percentage: 0,
						completedCategories: [],
						missingCategories: ['projects', 'work_style', 'challenges', 'help_focus']
					};

			set({
				context: userData.context,
				loading: false,
				error: null,
				completedOnboarding: userData.completedOnboarding,
				progress
			});
		},

		calculateProgress(context: UserContext | null) {
			if (!context) {
				return {
					percentage: 0,
					completedCategories: [],
					missingCategories: ['projects', 'work_style', 'challenges', 'help_focus']
				};
			}

			const categories = ['projects', 'work_style', 'challenges', 'help_focus'];
			const completedCategories = categories.filter((category) =>
				OnboardingClientService.hasCategoryContent(context, category)
			);

			return {
				percentage: OnboardingClientService.calculateCompletionPercentage(context),
				completedCategories,
				missingCategories: categories.filter((cat) => !completedCategories.includes(cat))
			};
		},

		/**
		 * Load user context via API
		 */
		async load() {
			update((state) => ({ ...state, loading: true, error: null }));

			try {
				const summary = await OnboardingClientService.getUserContextSummary();

				const progress = summary.context
					? this.calculateProgress(summary.context)
					: {
							percentage: 0,
							completedCategories: [],
							missingCategories: [
								'projects',
								'work_style',
								'challenges',
								'help_focus'
							]
						};

				set({
					context: summary.context,
					loading: false,
					error: null,
					completedOnboarding: Object.values(summary.completionStatus).every(Boolean),
					progress
				});
			} catch (error) {
				update((state) => ({
					...state,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load user context'
				}));
			}
		},

		/**
		 * Save user input ONLY (no parsing) - for auto-saves
		 * @param voiceInput - The user input text
		 * @param category - The category to save for
		 * @param appendMode - Whether to append or replace (default: false for replace)
		 */
		async saveUserInputOnly(voiceInput: string, category: string, appendMode: boolean = false) {
			update((state) => ({ ...state, loading: true, error: null }));

			try {
				// Save input only (no parsing)
				const updatedContext = await OnboardingClientService.saveUserInputOnly(
					voiceInput,
					category,
					{ appendMode }
				);

				const progress = this.calculateProgress(updatedContext);

				update((state) => ({
					...state,
					context: updatedContext,
					loading: false,
					error: null,
					progress
				}));

				return updatedContext;
			} catch (error) {
				update((state) => ({
					...state,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to save user input'
				}));
				throw error;
			}
		},

		/**
		 * Complete onboarding via API
		 */
		async completeOnboarding() {
			try {
				await OnboardingClientService.completeOnboarding();
				update((state) => ({ ...state, completedOnboarding: true }));
			} catch (error) {
				console.error('Error completing onboarding:', error);
				update((state) => ({
					...state,
					error: error instanceof Error ? error.message : 'Failed to complete onboarding'
				}));
				throw error;
			}
		},

		/**
		 * Get user input for a specific category
		 */
		getUserInput(category: string): string {
			let input = '';
			update((state) => {
				input = OnboardingClientService.getUserInputForCategory(state.context, category);
				return state;
			});
			return input;
		},

		/**
		 * Check if user can complete onboarding
		 */
		canComplete(): boolean {
			let canComplete = false;

			update((state) => {
				canComplete = state.context
					? OnboardingClientService.canCompleteOnboarding(state.context)
					: false;
				return state;
			});

			return canComplete;
		},

		/**
		 * Get next recommended step
		 */
		getNextStep(): number {
			let nextStep = 0;

			update((state) => {
				nextStep = state.context
					? OnboardingClientService.getNextRecommendedStep(state.context)
					: 0;
				return state;
			});

			return nextStep;
		},

		/**
		 * Reset store state
		 */
		reset() {
			set({
				context: null,
				loading: false,
				error: null,
				completedOnboarding: false,
				progress: {
					percentage: 0,
					completedCategories: [],
					missingCategories: ['projects', 'work_style', 'challenges', 'help_focus']
				}
			});
		},

		/**
		 * Clear any errors
		 */
		clearError() {
			update((state) => ({ ...state, error: null }));
		}
	};
}

export const userContextStore = createUserContextStore();
