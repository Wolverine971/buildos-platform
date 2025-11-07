// apps/web/src/lib/stores/briefPreferences.ts
import { writable } from 'svelte/store';

export interface BriefPreferences {
	id?: string;
	user_id?: string;
	frequency: 'daily' | 'weekly';
	day_of_week: number | null;
	time_of_day: string;
	// timezone removed - now stored in users table
	is_active: boolean;
	created_at?: string;
	updated_at?: string;
}

export interface BriefJob {
	id: string;
	user_id: string;
	job_type: string;
	status: 'pending' | 'completed' | 'failed' | 'cancelled';
	scheduled_for: string;
	created_at: string;
	processed_at?: string;
	error_message?: string;
}

interface BriefPreferencesState {
	preferences: BriefPreferences | null;
	jobs: BriefJob[];
	isLoading: boolean;
	isSaving: boolean;
	error: string | null;
	nextScheduledBrief: Date | null;
}

const initialState: BriefPreferencesState = {
	preferences: null,
	jobs: [],
	isLoading: false,
	isSaving: false,
	error: null,
	nextScheduledBrief: null
};

// Default preferences
// NOTE: Brief preferences control WHEN briefs are generated.
// For notification delivery preferences (email/SMS), see notificationPreferences store.
// Timezone is now stored in users table, not here.
const DEFAULT_PREFERENCES: Omit<BriefPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'> =
	{
		frequency: 'daily',
		day_of_week: 1, // Monday
		time_of_day: '09:00:00',
		is_active: true
	};

function createBriefPreferencesStore() {
	const { subscribe, set, update } = writable<BriefPreferencesState>(initialState);

	// Calculate next scheduled brief
	function calculateNextScheduledBrief(preferences: BriefPreferences): Date | null {
		if (!preferences.is_active) return null;

		try {
			const now = new Date();
			const timeParts = preferences.time_of_day.split(':').map(Number);
			const hours = timeParts[0] ?? 9;
			const minutes = timeParts[1] ?? 0;
			const seconds = timeParts[2] ?? 0;

			// This is a simplified calculation - you might want to use the same logic as your scheduler
			const today = new Date();
			today.setHours(hours, minutes, seconds, 0);

			if (preferences.frequency === 'daily') {
				if (today > now) {
					return today;
				} else {
					const tomorrow = new Date(today);
					tomorrow.setDate(tomorrow.getDate() + 1);
					return tomorrow;
				}
			} else if (preferences.frequency === 'weekly' && preferences.day_of_week !== null) {
				const targetDay = preferences.day_of_week;
				const currentDay = now.getDay();
				let daysUntilTarget = (targetDay - currentDay + 7) % 7;

				if (daysUntilTarget === 0 && today <= now) {
					daysUntilTarget = 7;
				}

				const nextWeek = new Date(today);
				nextWeek.setDate(nextWeek.getDate() + daysUntilTarget);
				return nextWeek;
			}
		} catch (e) {
			console.error('Error calculating next scheduled brief:', e);
		}

		return null;
	}

	return {
		subscribe,

		// Load preferences and jobs
		async load() {
			update((state) => ({ ...state, isLoading: true, error: null }));

			try {
				const [preferencesRes, jobsRes] = await Promise.all([
					fetch('/api/brief-preferences'),
					fetch('/api/brief-jobs?limit=10')
				]);

				if (!preferencesRes.ok) {
					throw new Error('Failed to load preferences');
				}
				if (!jobsRes.ok) {
					throw new Error('Failed to load jobs');
				}

				const preferencesPayload = await preferencesRes.json();
				const preferences =
					preferencesPayload?.data?.preferences ?? preferencesPayload?.preferences;
				const jobsPayload = await jobsRes.json();
				const jobs = jobsPayload?.data?.jobs ?? jobsPayload?.jobs ?? []; // Support legacy response shape

				const nextScheduledBrief = calculateNextScheduledBrief(preferences);

				update((state) => ({
					...state,
					preferences,
					jobs,
					nextScheduledBrief,
					isLoading: false
				}));
			} catch (error) {
				update((state) => ({
					...state,
					error: error instanceof Error ? error.message : 'Failed to load data',
					isLoading: false
				}));
			}
		},

		// Save preferences
		async save(preferences: Partial<BriefPreferences>) {
			update((state) => ({ ...state, isSaving: true, error: null }));

			try {
				const response = await fetch('/api/brief-preferences', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(preferences)
				});

				const responsePayload = await response.json();

				if (!response.ok) {
					throw new Error(
						responsePayload?.error ||
							responsePayload?.message ||
							'Failed to save preferences'
					);
				}

				const updatedPreferences =
					responsePayload?.data?.preferences ?? responsePayload?.preferences;
				const nextScheduledBrief = calculateNextScheduledBrief(updatedPreferences);

				update((state) => ({
					...state,
					preferences: updatedPreferences,
					nextScheduledBrief,
					isSaving: false
				}));

				// Reload jobs to get updated schedule
				await this.loadJobs();
			} catch (error) {
				update((state) => ({
					...state,
					error: error instanceof Error ? error.message : 'Failed to save preferences',
					isSaving: false
				}));
				throw error;
			}
		},

		// Load jobs only
		async loadJobs() {
			try {
				const response = await fetch('/api/brief-jobs?limit=10');
				const payload = await response.json();

				if (!response.ok) {
					throw new Error(payload?.error || payload?.message || 'Failed to load jobs');
				}

				const jobs = payload?.data?.jobs ?? payload?.jobs ?? [];
				update((state) => ({ ...state, jobs }));
			} catch (error) {
				update((state) => ({
					...state,
					error: error instanceof Error ? error.message : 'Failed to load jobs'
				}));
			}
		},

		// Cancel a job
		async cancelJob(briefDate: string) {
			try {
				const response = await fetch('/api/brief-jobs/cancel', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ briefDate })
				});

				if (!response.ok) {
					const payload = await response.json().catch(() => null);
					throw new Error(payload?.error || payload?.message || 'Failed to cancel job');
				}

				// Reload jobs to get updated status
				await this.loadJobs();
			} catch (error) {
				update((state) => ({
					...state,
					error: error instanceof Error ? error.message : 'Failed to cancel job'
				}));
				throw error;
			}
		},

		// Reset to defaults
		async resetToDefaults() {
			await this.save(DEFAULT_PREFERENCES);
		},

		// Get default preferences
		getDefaults(): BriefPreferences {
			return {
				...DEFAULT_PREFERENCES
			};
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

export const briefPreferencesStore = createBriefPreferencesStore();
