// src/routes/profile/$types.ts
import type { PageServerLoad, Actions } from './$types';

export interface PageData {
	user: {
		id: string;
		email: string;
		user_metadata?: {
			name?: string;
		};
	};
	userContext: {
		user_id: string;
		background?: string;
		identity?: string;
		values?: string;
		personality?: string;
		active_projects?: string;
		goals_overview?: string;
		philosophies?: string;
		worldview?: string;
		principles?: string;
		habits?: string;
		workflows?: string;
		tools?: string;
		schedule_preferences?: string;
		work_style?: string;
		blockers?: string;
		collaboration_needs?: string;
		skill_gaps?: string;
		aspirations?: string;
		priorities?: string;
		onboarding_completed_at?: string;
		created_at?: string;
		updated_at?: string;
	} | null;
	progressData: {
		completed: boolean;
		progress: number;
		missingFields: string[];
		completedFields: string[];
		missingRequiredFields: string[];
		categoryProgress: Record<string, number>;
	};
	projectTemplates: Array<{
		id: string;
		user_id: string | null;
		name: string;
		description: string | null;
		template_content: string;
		in_use: boolean | null;
		is_default: boolean | null;
		variables: any;
		created_at: string | null;
		updated_at: string | null;
	}>;
	completedOnboarding: boolean;
	isAdmin: boolean;
	justCompletedOnboarding: boolean;
}
