// apps/worker/src/workers/sms/prompts.ts
/**
 * LLM Prompts for SMS Event Reminder Generation
 *
 * These prompts guide the LLM to create concise, helpful SMS reminders
 * for calendar events that fit within the 160-character SMS limit.
 */

export type MessageType = 'meeting' | 'deadline' | 'all_day';

/**
 * Base system prompt for all SMS generation
 */
export const SYSTEM_PROMPT = `You are a helpful SMS reminder generator for BuildOS, a productivity platform.

Your goal: Create concise, actionable SMS reminders for calendar events.

CONSTRAINTS:
- Maximum 160 characters (SMS limit)
- Use plain text only (no emojis, markdown, or special formatting)
- Be friendly, supportive, and clear
- Include the most relevant event details
- Always mention the time until the event

LINK HANDLING (CRITICAL):
- NEVER create fake, shortened, or made-up links (no bit.ly, no tinyurl, etc.)
- If a meeting link is provided and fits within the character limit, include it verbatim
- If the link is too long to fit, omit it entirely or reference it generically (e.g., "Join via Google Meet link")
- Only include actual links that were provided in the event context

TONE:
- Friendly but professional
- Encouraging without being pushy
- Respectful of the user's time

FORMAT:
- Start with context (what/when)
- Add helpful details if space allows
- End with subtle call-to-action if relevant

EXAMPLES:
- "Meeting in 15 mins: 'Project Sync' with Sarah. Agenda: Q4 roadmap discussion."
- "Deadline in 2 hours: Submit quarterly report. Location: Shared drive."
- "Starting soon: 'Team Standup' at 10am. Join via Google Meet link."

Remember: Be helpful, not annoying. Users appreciate context, not just notification spam.`;

/**
 * Context for event reminder generation
 */
export interface EventPromptContext {
	event_title: string;
	time_until_event: string;
	duration?: string;
	description?: string;
	location?: string;
	attendees?: string;
	meeting_link?: string;
	event_date?: string;
}

/**
 * Build user prompt for meeting reminder
 */
function buildMeetingReminderPrompt(context: EventPromptContext): string {
	let prompt = `Generate an SMS reminder for an upcoming meeting.

Event details:
- Title: ${context.event_title}
- Starts in: ${context.time_until_event}`;

	if (context.duration) {
		prompt += `\n- Duration: ${context.duration}`;
	}

	if (context.description) {
		prompt += `\n- Details: ${context.description}`;
	}

	if (context.attendees) {
		prompt += `\n- With: ${context.attendees}`;
	}

	if (context.location) {
		prompt += `\n- Location: ${context.location}`;
	}

	if (context.meeting_link) {
		prompt += `\n- Link: ${context.meeting_link}`;
	}

	prompt += `\n\nFocus on: Meeting title, time until start, key details from description.
Remember: Keep it under 160 characters total.

IMPORTANT: If a link is provided, either include it verbatim if it fits, or omit it entirely. NEVER create fake shortened links like bit.ly. If the link is too long, you can reference it generically (e.g., "Join via Google Calendar link").`;

	return prompt;
}

/**
 * Build user prompt for deadline reminder
 */
function buildDeadlineReminderPrompt(context: EventPromptContext): string {
	let prompt = `Generate an SMS reminder for an upcoming deadline.

Event details:
- Task: ${context.event_title}
- Due in: ${context.time_until_event}`;

	if (context.description) {
		prompt += `\n- Details: ${context.description}`;
	}

	if (context.location) {
		prompt += `\n- Location: ${context.location}`;
	}

	prompt += `\n\nFocus on: Creating urgency without stress, mentioning what's due and when.
Remember: Keep it under 160 characters total.`;

	return prompt;
}

/**
 * Build user prompt for all-day event reminder
 */
function buildAllDayEventPrompt(context: EventPromptContext): string {
	let prompt = `Generate an SMS reminder for an all-day event or milestone.

Event details:
- Event: ${context.event_title}
- Date: ${context.event_date || 'today'}`;

	if (context.description) {
		prompt += `\n- Details: ${context.description}`;
	}

	if (context.location) {
		prompt += `\n- Location: ${context.location}`;
	}

	prompt += `\n\nFocus on: What's happening today, why it matters, any preparation needed.
Remember: Keep it under 160 characters total.`;

	return prompt;
}

/**
 * Get user prompt based on message type
 */
export function getUserPrompt(messageType: MessageType, context: EventPromptContext): string {
	switch (messageType) {
		case 'meeting':
			return buildMeetingReminderPrompt(context);
		case 'deadline':
			return buildDeadlineReminderPrompt(context);
		case 'all_day':
			return buildAllDayEventPrompt(context);
		default:
			return buildMeetingReminderPrompt(context);
	}
}

/**
 * Get system prompt (same for all types for now)
 */
export function getSystemPrompt(_messageType?: MessageType): string {
	return SYSTEM_PROMPT;
}
