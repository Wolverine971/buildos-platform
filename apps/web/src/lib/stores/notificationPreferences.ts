// apps/web/src/lib/stores/notificationPreferences.ts
import { writable, get } from 'svelte/store';

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
	const store = writable<NotificationPreferencesState>(initialState);
	const { subscribe, set, update } = store;

	return {
		subscribe,

		// Load daily brief notification preferences
		async load() {
			update((state) => ({ ...state, isLoading: true, error: null }));

			try {
				const response = await fetch('/api/notification-preferences?daily_brief=true');

				const result = await response.json();

				if (!response.ok) {
					throw new Error(result.error || 'Failed to load notification preferences');
				}

				const preferences =
					result?.data?.preferences ?? result?.preferences ?? DEFAULT_PREFERENCES;

				update((state) => ({
					...state,
					preferences,
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

				const result = await response.json();

				if (!response.ok) {
					const details = result.details || {};

					// Check for specific error types that need user action
					if (details.requiresPhoneSetup) {
						throw new Error(
							'Phone number required. Please set up your phone number in Settings first.'
						);
					}

					if (details.requiresPhoneVerification) {
						throw new Error(
							'Phone number not verified. Please verify your phone number in Settings first.'
						);
					}

					if (details.requiresOptIn) {
						throw new Error(
							'You have opted out of SMS notifications. Please opt back in via Settings to enable SMS.'
						);
					}

					if (details.requiresBriefActivation) {
						throw new Error(
							'Daily brief generation is not active. Please enable brief generation in Brief Preferences first.'
						);
					}

					throw new Error(result.error || 'Failed to save preferences');
				}

				const preference = result?.data?.preference ?? result?.preference;

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
			let currentState = get(store);

			// Load preferences if not already loaded
			if (!currentState.preferences) {
				await this.load();
				currentState = get(store); // Get updated state after load
			}

			// Toggle and save
			if (currentState.preferences) {
				await this.save({
					should_email_daily_brief: !currentState.preferences.should_email_daily_brief
				});
			}
		},

		// Toggle SMS notifications
		async toggleSMS() {
			let currentState = get(store);

			// Load preferences if not already loaded
			if (!currentState.preferences) {
				await this.load();
				currentState = get(store); // Get updated state after load
			}

			// Toggle and save
			if (currentState.preferences) {
				await this.save({
					should_sms_daily_brief: !currentState.preferences.should_sms_daily_brief
				});
			}
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
			set({ ...initialState });
		}
	};
}

export const notificationPreferencesStore = createNotificationPreferencesStore();
