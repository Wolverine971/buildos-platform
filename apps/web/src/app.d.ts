// src/app.d.ts
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

type User = Database['public']['Tables']['users']['Row'];

declare global {
	// Vite defined constants
	const __DEV__: boolean;
	const __PROD__: boolean;
	const __APP_VERSION__: string;
	const __BUILD_TIME__: string;

	namespace App {
		interface Locals {
			supabase: SupabaseClient<Database>;
			safeGetSession: () => Promise<{
				session: Session | null;
				user: User | null;
			}>;
			session: Session | null;
			user: User | null;
			_explicitlyCleared?: boolean;
			getCalendarTokens(): Promise<CalendarTokens | null>;
			csrfToken?: string;
		}
		interface PageData {
			user: User | null;
			url?: string;
			cookies?: Array<{ name: string; value: string }>;
			completedOnboarding?: boolean;
			onboardingProgress?: number;
			onboardingProgressData?: {
				completed: boolean;
				progress: number;
				missingFields: string[];
				completedFields: string[];
				missingRequiredFields: string[];
				categoryProgress: Record<string, number>;
			};
			subscription?: any;
			paymentWarnings?: any[];
			stripeEnabled?: boolean;
			trialStatus?: {
				is_in_trial: boolean;
				is_trial_expired: boolean;
				is_in_grace_period: boolean;
				days_until_trial_end: number;
				trial_end_date: string | null;
				has_active_subscription: boolean;
				is_read_only: boolean;
			} | null;
			isReadOnly?: boolean;
		}
	}
}

declare module 'svelte' {
	export interface ComponentEvents {
		// Toast events
		dismiss: string;
	}
}

export interface CalendarTokens {
	access_token: string;
	refresh_token: string;
	expiry_date: number | null;
	scope: string | null;
	updated_at: string | null;
	token_type: string | null;
	hasValidTokens: boolean;
	needsRefresh: boolean;
}

export {};
