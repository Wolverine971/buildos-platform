// apps/web/src/lib/stores/notificationPreferences.ts
import { writable } from 'svelte/store';

export interface DailyBriefNotificationPreferences {
	should_email_daily_brief: boolean;
	should_sms_daily_brief: boolean;
	updated_at?: string;
}

interface NotificationPreferencesState {
	preferences: DailyBriefNotificationPreferences | null;
	isLoading: boolean;
	isSaving: boolean;
	error: string | null;
}

const initialState: NotificationPreferencesState = {
	preferences: null,
	isLoading: false,
	isSaving: false,
	error: null
};

// Default preferences
const DEFAULT_PREFERENCES: DailyBriefNotificationPreferences = {
	should_email_daily_brief: false,
	should_sms_daily_brief: false
};

function createNotificationPreferencesStore() {
	const { subscribe, set, update } = writable<NotificationPreferencesState>(initialState);

	return {
		subscribe,

		// Load daily brief notification preferences
		async load() {
			update((state) => ({ ...state, isLoading: true, error: null }));

			try {
				const response = await fetch('/api/notification-preferences?daily_brief=true');

				if (!response.ok) {
					throw new Error('Failed to load notification preferences');
				}

				const { preferences } = await response.json();

				update((state) => ({
					...state,
					preferences: preferences || DEFAULT_PREFERENCES,
					isLoading: false
				}));
			} catch (error) {
				update((state) => ({
					...state,
					error: error instanceof Error ? error.message : 'Failed to load preferences',
					isLoading: false
				}));
			}
		},

		// Save daily brief notification preferences
		async save(preferences: Partial<DailyBriefNotificationPreferences>) {
			update((state) => ({ ...state, isSaving: true, error: null }));

			try {
				const response = await fetch('/api/notification-preferences', {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(preferences)
				});

				if (!response.ok) {
					const errorData = await response.json();

					// Check for specific error types that need user action
					if (errorData.requiresPhoneSetup) {
						throw new Error(
							'Phone number required. Please set up your phone number in Settings first.'
						);
					}

					if (errorData.requiresPhoneVerification) {
						throw new Error(
							'Phone number not verified. Please verify your phone number in Settings first.'
						);
					}

					if (errorData.requiresOptIn) {
						throw new Error(
							'You have opted out of SMS notifications. Please opt back in via Settings to enable SMS.'
						);
					}

					if (errorData.requiresBriefActivation) {
						throw new Error(
							'Daily brief generation is not active. Please enable brief generation in Brief Preferences first.'
						);
					}

					throw new Error(errorData.error || 'Failed to save preferences');
				}

				const { preference } = await response.json();

				update((state) => ({
					...state,
					preferences: {
						should_email_daily_brief: preference.should_email_daily_brief ?? false,
						should_sms_daily_brief: preference.should_sms_daily_brief ?? false,
						updated_at: preference.updated_at
					},
					isSaving: false
				}));
			} catch (error) {
				update((state) => ({
					...state,
					error: error instanceof Error ? error.message : 'Failed to save preferences',
					isSaving: false
				}));
				throw error;
			}
		},

		// Toggle email notifications
		async toggleEmail() {
			const currentState = initialState;
			update((state) => {
				Object.assign(currentState, state);
				return state;
			});

			if (!currentState.preferences) {
				await this.load();
				return;
			}

			await this.save({
				should_email_daily_brief: !currentState.preferences.should_email_daily_brief
			});
		},

		// Toggle SMS notifications
		async toggleSMS() {
			const currentState = initialState;
			update((state) => {
				Object.assign(currentState, state);
				return state;
			});

			if (!currentState.preferences) {
				await this.load();
				return;
			}

			await this.save({
				should_sms_daily_brief: !currentState.preferences.should_sms_daily_brief
			});
		},

		// Get default preferences
		getDefaults(): DailyBriefNotificationPreferences {
			return { ...DEFAULT_PREFERENCES };
		},

		// Clear error
		clearError() {
			update((state) => ({ ...state, error: null }));
		},

		// Reset store
		reset() {
			set(initialState);
		}
	};
}

export const notificationPreferencesStore = createNotificationPreferencesStore();
