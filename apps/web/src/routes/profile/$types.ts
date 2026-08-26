// apps/web/src/routes/profile/$types.ts
import type { Database } from '@buildos/shared-types';

type SubscriptionDetails = {
	subscription: Database['public']['Tables']['customer_subscriptions']['Row'] & {
		subscription_plans: Database['public']['Tables']['subscription_plans']['Row'] | null;
	};
	invoices: Database['public']['Tables']['invoices']['Row'][];
};

export interface PageData {
	user: {
		id: string;
		email: string;
		/** From the `public.users` row — where the Account tab's name actually lands. */
		name?: string | null;
		user_metadata?: {
			name?: string;
		};
	};
	userContext: Database['public']['Tables']['user_context']['Row'] | null;
	progressData: {
		completed: boolean;
		progress: number;
		missingFields: string[];
		completedFields: string[];
		missingRequiredFields: string[];
		categoryProgress: Record<string, boolean>;
		categoryCompletion: Record<string, boolean>;
		missingCategories: string[];
	};
	completedOnboarding: boolean;
	isAdmin: boolean;
	voiceNarrationEnabled: boolean;
	justCompletedOnboarding: boolean;
	activeTab: string;
	subscriptionDetails: SubscriptionDetails | null;
	stripeEnabled: boolean;
	cyclesProfileEnabled: boolean;
	cyclesExecutionAuthority: 'preview';
}
