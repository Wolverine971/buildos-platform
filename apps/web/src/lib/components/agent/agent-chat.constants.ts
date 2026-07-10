// apps/web/src/lib/components/agent/agent-chat.constants.ts
import type { ChatContextType } from '@buildos/shared-types';

/**
 * How long the stream controller holds a prepared-prompt send while the prewarm
 * request settles. Shared by the prewarm orchestrator (as its default wait) and
 * the stream controller (as the wait it passes in).
 */
export const PREPARED_PROMPT_SEND_WAIT_MS = 250;

export const CONTEXT_DESCRIPTORS: Record<ChatContextType, { title: string; subtitle: string }> = {
	global: {
		title: 'Global conversation',
		subtitle: 'Work across projects, tasks, and the calendar without constraints.'
	},
	project: {
		title: 'Project chat',
		subtitle: 'Answer questions, explore insights, or update the selected project.'
	},
	calendar: {
		title: 'Calendar planning',
		subtitle: 'Coordinate schedules, availability, and time blocks.'
	},
	daily_brief: {
		title: 'Brief chat',
		subtitle: 'Act on your generated brief with context-aware updates.'
	},
	general: {
		title: 'Global conversation',
		subtitle: 'Legacy mode - use global instead.'
	},
	project_create: {
		title: 'New project flow',
		subtitle: 'Guide creation of a structured project from a spark of an idea.'
	},
	daily_brief_update: {
		title: 'Daily brief tuning',
		subtitle: 'Adjust what surfaces in your daily brief and notifications.'
	},
	ontology: {
		title: 'Ontology',
		subtitle: 'Work with the ontology system (projects, tasks, docs, goals).'
	}
};
