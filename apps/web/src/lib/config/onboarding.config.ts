// apps/web/src/lib/config/onboarding.config.ts
/**
 * Onboarding V2 Configuration
 *
 * Central configuration for the new onboarding flow including:
 * - Step definitions
 * - User archetypes
 * - Productivity challenges
 * - Feature flags
 */

export const ONBOARDING_V2_CONFIG = {
	version: 2,

	// Step configuration
	steps: {
		welcome: { id: 'welcome', order: 0, skippable: false, title: 'Welcome to BuildOS' },
		capabilities: {
			id: 'capabilities',
			order: 1,
			skippable: true,
			title: 'How BuildOS Works'
		},
		clarity: {
			id: 'clarity',
			order: 2,
			skippable: false,
			title: 'Capture Current Projects (Clarity)'
		},
		focus: {
			id: 'focus',
			order: 3,
			skippable: true,
			title: 'Accountability & Notifications (Focus)'
		},
		flexibility: {
			id: 'flexibility',
			order: 4,
			skippable: true,
			title: 'Knobs and Whistles (Flexibility)'
		},
		preferences: {
			id: 'preferences',
			order: 5,
			skippable: false,
			title: 'Communication Preferences'
		},
		profile: {
			id: 'profile',
			order: 6,
			skippable: false,
			title: 'Your Profile'
		},
		admin_tour: {
			id: 'admin_tour',
			order: 7,
			skippable: true,
			title: 'Explore More'
		},
		summary: { id: 'summary', order: 8, skippable: false, title: 'Summary & First Win' }
	},

	// User archetypes - how users want to use BuildOS
	archetypes: [
		{
			id: 'second_brain',
			icon: 'brain',
			title: 'Second Brain',
			description: 'Capture ideas, notes, and information',
			features: ['Knowledge base', 'Note linking', 'Memory extension'],
			dailyBriefTone: 'informative',
			dailyBriefPrompt:
				'Focus on knowledge connections, insights, and information synthesis. Highlight captured ideas and their relationships.'
		},
		{
			id: 'ai_task_manager',
			icon: 'robot',
			title: 'AI Task Manager',
			description: 'Keep me prepared for meetings, deadlines, and next steps',
			features: ['Smart scheduling', 'Proactive reminders', 'Meeting prep'],
			dailyBriefTone: 'proactive',
			dailyBriefPrompt:
				'Prioritize upcoming meetings, deadlines, and action items. Provide clear next steps and time-sensitive alerts.'
		},
		{
			id: 'project_todo_list',
			icon: 'checklist',
			title: 'Project To-Do List',
			description: 'Simple task organization to keep projects moving',
			features: ['Task lists', 'Project tracking', 'Progress monitoring'],
			dailyBriefTone: 'action-oriented',
			dailyBriefPrompt:
				'List actionable tasks organized by project. Focus on what can be completed today to move projects forward.'
		}
	],

	// Productivity challenges users can select
	challenges: [
		{
			id: 'time_management',
			label: 'Time management — I run out of hours in the day',
			icon: '⏳',
			aiGuidance:
				'User struggles with time management. Suggest time-blocking, prioritization, and realistic scheduling.',
			suggestedFeatures: ['calendar_integration', 'time_blocking', 'daily_brief']
		},
		{
			id: 'focus_adhd',
			label: 'Focus/ADHD — I struggle with follow-through',
			icon: '🧩',
			aiGuidance:
				'User has ADHD or focus challenges. Break tasks into small steps, use encouraging language, suggest frequent breaks and rewards.',
			suggestedFeatures: ['small_tasks', 'progress_tracking', 'celebration_notifications']
		},
		{
			id: 'context_switching',
			label: 'Context switching — I juggle too many things at once',
			icon: '🔀',
			aiGuidance:
				'User struggles with context switching. Group related tasks, suggest focus blocks, minimize interruptions.',
			suggestedFeatures: ['project_grouping', 'focus_mode', 'batch_processing']
		},
		{
			id: 'planning',
			label: 'Planning — I struggle to break big goals into actionable steps',
			icon: '📅',
			aiGuidance:
				'User needs help with planning. Break down large goals into phases and tasks, provide structure and milestones.',
			suggestedFeatures: ['phase_generation', 'milestone_tracking', 'brain_dump']
		},
		{
			id: 'accountability',
			label: 'Accountability — I need someone/something to keep me on track',
			icon: '📈',
			aiGuidance:
				'User needs external accountability. Enable reminders, progress tracking, and regular check-ins.',
			suggestedFeatures: [
				'sms_notifications',
				'daily_brief',
				'progress_reports',
				'streak_tracking'
			]
		},
		{
			id: 'information_overload',
			label: 'Information overload — I have notes everywhere and no system',
			icon: '📝',
			aiGuidance:
				'User has information scattered across tools. Help consolidate, organize, and create a single source of truth.',
			suggestedFeatures: ['brain_dump', 'note_organization', 'search', 'tagging']
		},
		{
			id: 'overwhelm',
			label: "Overwhelm — I don't even know where to start",
			icon: '😰',
			aiGuidance:
				'User feels overwhelmed. Start with one small win, provide clear next steps, use gentle encouraging language.',
			suggestedFeatures: ['quick_wins', 'guided_setup', 'simplified_view', 'daily_focus']
		}
	],

	// SMS notification types
	smsNotificationTypes: [
		{
			id: 'event_reminders',
			label: 'Event Reminders',
			description: 'Text me about big upcoming events',
			icon: '📅',
			defaultEnabled: true
		},
		{
			id: 'next_up',
			label: 'Next Up Notifications',
			description: "Text me what's next on my schedule",
			icon: '⏰',
			defaultEnabled: false
		},
		{
			id: 'morning_kickoff',
			label: 'Morning Kickoff',
			description: 'Text me in the morning to set the tone for the day',
			icon: '🌅',
			defaultEnabled: true,
			defaultTime: '08:00:00'
		},
		{
			id: 'evening_recap',
			label: 'Evening Recap',
			description: 'Text me at night to reflect on what I got done',
			icon: '🌙',
			defaultEnabled: false,
			defaultTime: '20:00:00'
		}
	],

	// Feature flags
	features: {
		enableCalendarAnalysis: true,
		enableSMSNotifications: true,
		enableEmailNotifications: true,
		enableVoiceInput: true,
		showPlaceholderAssets: true // Show placeholder images/videos until real assets are ready
	},

	// Asset paths
	assets: {
		screenshots: {
			brainDumpExample: '/onboarding-assets/screenshots/PLACEHOLDER_brain_dump_example.png',
			calendarAnalysisBefore:
				'/onboarding-assets/screenshots/PLACEHOLDER_calendar_analysis_before.png',
			calendarAnalysisAfter:
				'/onboarding-assets/screenshots/PLACEHOLDER_calendar_analysis_after.png',
			smsNotification:
				'/onboarding-assets/screenshots/PLACEHOLDER_sms_notification_example.png',
			// Flexibility step assets
			braindumpUpdateTask:
				'/onboarding-assets/screenshots/PLACEHOLDER_braindump_update_task.png',
			braindumpReschedule:
				'/onboarding-assets/screenshots/PLACEHOLDER_braindump_reschedule.png',
			phaseGenerationModal:
				'/onboarding-assets/screenshots/PLACEHOLDER_phase_generation_modal.png',
			phaseRegenerationBeforeAfter:
				'/onboarding-assets/screenshots/PLACEHOLDER_phase_regeneration_before_after.png',
			phaseScheduling: '/onboarding-assets/screenshots/PLACEHOLDER_phase_scheduling.png',
			taskScheduleUnschedule:
				'/onboarding-assets/screenshots/PLACEHOLDER_task_schedule_unschedule.png',
			timeblockCreation: '/onboarding-assets/screenshots/PLACEHOLDER_timeblock_creation.png',
			timeblockWithSuggestions:
				'/onboarding-assets/screenshots/PLACEHOLDER_timeblock_with_suggestions.png',
			// Admin tour assets
			profilePageOverview:
				'/onboarding-assets/screenshots/PLACEHOLDER_profile_page_overview.png',
			historyPageContributionChart:
				'/onboarding-assets/screenshots/PLACEHOLDER_history_page_contribution_chart.png',
			projectHistoryModal:
				'/onboarding-assets/screenshots/PLACEHOLDER_project_history_modal.png'
		},
		videos: {
			calendarAnalysisDemo:
				'/onboarding-assets/videos/PLACEHOLDER_calendar_analysis_demo.mp4',
			smsNotificationDemo: '/onboarding-assets/videos/PLACEHOLDER_sms_notification_demo.mp4',
			brainDumpGuided: '/onboarding-assets/videos/PLACEHOLDER_brain_dump_guided_demo.mp4'
		}
	},

	// Default values
	defaults: {
		smsQuietHoursStart: '21:00:00',
		smsQuietHoursEnd: '08:00:00',
		smsDailyLimit: 10,
		emailBriefTime: '08:00:00',
		emailBriefTimezone: 'America/Los_Angeles'
	}
} as const;

// V3 Onboarding Configuration
// Stripped to 4 meaningful steps. Collects only what behavior can't reveal.
export const ONBOARDING_V3_CONFIG = {
	version: 3,

	steps: {
		intent_stakes: {
			id: 'intent_stakes',
			order: 0,
			skippable: false,
			title: 'What Brings You Here?'
		},
		brain_dump: { id: 'brain_dump', order: 1, skippable: true, title: 'Brain Dump' },
		notifications: { id: 'notifications', order: 2, skippable: true, title: 'Notifications' },
		ready: { id: 'ready', order: 3, skippable: false, title: "You're Ready" }
	},

	intents: [
		{
			id: 'organize',
			label: 'I have projects I need to get organized',
			description: 'You have existing work that needs structure'
		},
		{
			id: 'plan',
			label: "I have goals but I'm not sure where to start",
			description: 'You need guidance turning ideas into action'
		},
		{
			id: 'unstuck',
			label: "I'm overwhelmed and need to get unstuck",
			description: 'You have a lot on your plate and need help sorting it out'
		},
		{
			id: 'explore',
			label: 'I just want to try it out',
			description: 'No pressure — just browsing'
		}
	],

	stakes: [
		{
			id: 'high',
			label: 'This is for work or clients — it matters a lot',
			description: "We'll be extra careful and precise"
		},
		{
			id: 'medium',
			label: "It's important to me personally",
			description: "We'll be supportive and encouraging"
		},
		{
			id: 'low',
			label: "It's casual — side projects, hobbies, exploring",
			description: "We'll keep things relaxed"
		}
	],

	brainDumpPrompts: {
		organize: {
			heading: 'Tell us about the projects you need organized',
			placeholder:
				"Describe your projects, what's in progress, what needs structure. Just write freely — we'll sort it out..."
		},
		plan: {
			heading: 'What are you trying to accomplish?',
			placeholder:
				"Describe your goals, even if they feel vague. We'll help you break them down into concrete steps..."
		},
		unstuck: {
			heading: "What's on your plate right now?",
			placeholder:
				"Just dump everything that's on your mind — work, personal, ideas, worries. We'll help sort it out..."
		},
		explore: {
			heading: "Got anything you're working on?",
			placeholder:
				'If you have something in mind, tell us about it. If not, no worries — you can always brain dump later...'
		}
	},

	features: {
		enableVoiceInput: true,
		enableCalendarConnection: true
	}
} as const;

// V3 Type exports
export type OnboardingIntent = (typeof ONBOARDING_V3_CONFIG.intents)[number]['id'];
export type OnboardingStakes = (typeof ONBOARDING_V3_CONFIG.stakes)[number]['id'];
export type OnboardingV3Step = keyof typeof ONBOARDING_V3_CONFIG.steps;

// V2 Type exports (kept for backward compatibility)
export type OnboardingStep = keyof typeof ONBOARDING_V2_CONFIG.steps;
export type UserArchetype = (typeof ONBOARDING_V2_CONFIG.archetypes)[number]['id'];
export type ProductivityChallenge = (typeof ONBOARDING_V2_CONFIG.challenges)[number]['id'];
export type SMSNotificationType = (typeof ONBOARDING_V2_CONFIG.smsNotificationTypes)[number]['id'];

// Helper functions
export function getArchetypeById(id: string) {
	return ONBOARDING_V2_CONFIG.archetypes.find((a) => a.id === id);
}

export function getChallengeById(id: string) {
	return ONBOARDING_V2_CONFIG.challenges.find((c) => c.id === id);
}

export function getSMSNotificationTypeById(id: string) {
	return ONBOARDING_V2_CONFIG.smsNotificationTypes.find((t) => t.id === id);
}

export function getStepByOrder(order: number) {
	return Object.values(ONBOARDING_V2_CONFIG.steps).find((s) => s.order === order);
}

export function getTotalSteps() {
	return Object.keys(ONBOARDING_V2_CONFIG.steps).length;
}
