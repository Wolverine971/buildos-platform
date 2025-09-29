// src/lib/types/user-context.ts

import type { Database } from '@buildos/shared-types';

export type UserContext = Database['public']['Tables']['user_context']['Row'];

export interface OnboardingStep {
	id: string;
	title: string;
	subtitle: string;
	category: 'who' | 'building' | 'believe' | 'work' | 'help' | 'goals';
	fields: OnboardingField[];
	icon?: string;
	voicePrompt?: string;
}

export interface OnboardingField {
	key: keyof UserContext;
	label: string;
	placeholder: string;
	type: 'text' | 'textarea' | 'select';
	required?: boolean;
	helpText?: string;
	examples?: string[];
}

export interface OnboardingProgress {
	currentStep: number;
	totalSteps: number;
	completedSteps: string[];
	skippedSteps: string[];
}

export const ONBOARDING_CATEGORIES = {
	who: {
		title: 'Who I Am',
		description: 'Your background, identity, values, and personality',
		icon: 'User',
		color: 'text-blue-600 dark:text-blue-400'
	},
	building: {
		title: "What I'm Building",
		description: 'Your active projects, goals, and missions',
		icon: 'Rocket',
		color: 'text-purple-600 dark:text-purple-400'
	},
	believe: {
		title: 'What I Believe',
		description: 'Your core philosophies, worldviews, and principles',
		icon: 'Heart',
		color: 'text-pink-600 dark:text-pink-400'
	},
	work: {
		title: 'How I Work',
		description: 'Your habits, workflows, tools, and preferences',
		icon: 'Settings',
		color: 'text-amber-600 dark:text-amber-400'
	},
	help: {
		title: 'What I Need Help With',
		description: 'Your blockers, collaboration needs, and skill gaps',
		icon: 'HelpCircle',
		color: 'text-orange-600 dark:text-orange-400'
	},
	goals: {
		title: 'Life Goals + Projects',
		description: 'Your long-term aspirations and priorities',
		icon: 'Target',
		color: 'text-green-600 dark:text-green-400'
	}
};
