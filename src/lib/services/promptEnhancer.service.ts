// src/lib/services/promptEnhancer.service.ts

import type { UserContext } from '$lib/types/user-context';

interface EnhancementOptions {
	useEnhancedContext?: boolean;
	includeTimeContext?: boolean;
	includeActivityMetrics?: boolean;
	includeUpcomingEvents?: boolean;
	includeMotivationalContext?: boolean;
	includeEnergyAssessment?: boolean;
}

export class PromptEnhancerService {
	constructor() {}

	/**
	 * Enhance a base prompt with contextual information based on options
	 */
	async enhancePromptWithContext(
		basePrompt: string,
		userContext: UserContext | null,
		options: EnhancementOptions
	): Promise<string> {
		try {
			let enhancedPrompt = basePrompt;

			// Build enhancement sections
			const enhancementSections: string[] = [];

			// Personal context enhancement
			if (options.useEnhancedContext && userContext) {
				enhancementSections.push(this.buildPersonalContextSection(userContext));
			}

			// Time context enhancement
			if (options.includeTimeContext) {
				enhancementSections.push(this.buildTimeContextSection());
			}

			// Activity metrics enhancement
			// if (options.includeActivityMetrics && userContext.recent_tasks) {
			// 	enhancementSections.push(this.buildActivityMetricsSection(userContext.recent_tasks));
			// }

			// Motivational context enhancement
			// if (options.includeMotivationalContext && personalContext) {
			// 	enhancementSections.push(this.buildMotivationalSection(personalContext));
			// }

			// Energy assessment enhancement
			// if (options.includeEnergyAssessment && personalContext) {
			// 	enhancementSections.push(this.buildEnergyAssessmentSection(personalContext));
			// }

			// Combine all enhancements
			if (enhancementSections.length > 0) {
				enhancedPrompt = `${basePrompt}


${enhancementSections.join('\n\n')}

---

Personalize the brief to the user to make it more relevant to the user's specific situation, preferences, working style, and current goals. Focus on actionable insights that align with their personality and current momentum.`;
			}

			return enhancedPrompt;
		} catch (error) {
			console.error('Error enhancing prompt with context:', error);
			return basePrompt; // Fall back to base prompt if enhancement fails
		}
	}

	/**
	 * Build personal context section
	 */
	private buildPersonalContextSection(personalContext: UserContext): string {
		const sections: string[] = [];

		if (personalContext.identity) {
			sections.push(`**Identity**: ${personalContext.identity}`);
		}

		if (personalContext.background) {
			sections.push(`**Background**: ${personalContext.background}`);
		}

		if (personalContext.personality) {
			sections.push(`**Personality**: ${personalContext.personality}`);
		}

		if (personalContext.philosophies) {
			sections.push(`**Philosophies**: ${personalContext.philosophies}`);
		}

		if (personalContext.worldview) {
			sections.push(`**Worldview**: ${personalContext.worldview}`);
		}

		if (personalContext.principles) {
			sections.push(`**Guiding Principles**: ${personalContext.principles}`);
		}

		if (personalContext.values) {
			sections.push(`**Core Values**: ${personalContext.values}`);
		}

		if (personalContext.aspirations) {
			sections.push(`**Aspirations**: ${personalContext.aspirations}`);
		}

		if (personalContext.goals_overview) {
			sections.push(`**Goals Overview**: ${personalContext.goals_overview}`);
		}

		if (personalContext.priorities) {
			sections.push(`**Current Priorities**: ${personalContext.priorities}`);
		}

		if (personalContext.active_projects) {
			sections.push(`**Active Projects**: ${personalContext.active_projects}`);
		}

		if (personalContext.blockers) {
			sections.push(`**Current Blockers**: ${personalContext.blockers}`);
		}

		if (personalContext.skill_gaps) {
			sections.push(`**Skill Gaps**: ${personalContext.skill_gaps}`);
		}

		if (personalContext.work_style) {
			sections.push(`**Work Style**: ${personalContext.work_style}`);
		}

		if (personalContext.schedule_preferences) {
			sections.push(`**Schedule Preferences**: ${personalContext.schedule_preferences}`);
		}

		if (personalContext.habits) {
			sections.push(`**Habits & Routines**: ${personalContext.habits}`);
		}

		if (personalContext.workflows) {
			sections.push(`**Workflows**: ${personalContext.workflows}`);
		}

		if (personalContext.tools) {
			sections.push(`**Preferred Tools**: ${personalContext.tools}`);
		}

		if (personalContext.collaboration_needs) {
			sections.push(`**Collaboration Needs**: ${personalContext.collaboration_needs}`);
		}

		return `### 👤 User Context / Personal Profile which came from user onboarding:\nUse only what is relevant.\n${sections.join('\n')}`;
	}

	/**
	 * Build time context section
	 */
	private buildTimeContextSection(): string {
		const now = new Date();
		const timeOfDay = this.getTimeOfDay(now);
		const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
		const weekOfMonth = Math.ceil(now.getDate() / 7);

		return `### ⏰ Time Context
**Current Time**: ${now.toLocaleTimeString()} (${timeOfDay})
**Day**: ${dayOfWeek}
**Week of Month**: Week ${weekOfMonth}
**Date**: ${now.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		})}`;
	}

	/**
	 * Utility methods
	 */
	private getTimeOfDay(date: Date): string {
		const hour = date.getHours();
		if (hour < 6) return 'early morning';
		if (hour < 12) return 'morning';
		if (hour < 17) return 'afternoon';
		if (hour < 21) return 'evening';
		return 'night';
	}
}
