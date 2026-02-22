// apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import { GATEWAY_TOOL_DEFINITIONS } from '$lib/services/agentic-chat/tools/core/definitions/gateway';
import {
	getToolsForContextType,
	resolveToolName
} from '$lib/services/agentic-chat/tools/core/tools.config';
import { isToolGatewayEnabled } from '$lib/services/agentic-chat/tools/registry/gateway-config';
import { normalizeFastContextType } from './prompt-builder';

const CALENDAR_TOOL_NAMES = new Set([
	'list_calendar_events',
	'get_calendar_event_details',
	'create_calendar_event',
	'update_calendar_event',
	'delete_calendar_event',
	'get_project_calendar',
	'set_project_calendar'
]);

const PROJECT_CALENDAR_TOOL_NAMES = new Set(['get_project_calendar', 'set_project_calendar']);

const WEB_INTENT_PATTERNS: RegExp[] = [
	/\bweb\b/i,
	/\binternet\b/i,
	/\bonline\b/i,
	/\bgoogle\b/i,
	/\bbing\b/i,
	/\bduckduckgo\b/i,
	/\bsearch the web\b/i,
	/\bsearch online\b/i,
	/\bweb search\b/i,
	/\bbrowse\b/i,
	/\blook up\b/i,
	/\bnews\b/i,
	/\bcurrent events\b/i,
	/\bwebsite\b/i,
	/\burl\b/i,
	/\bcitation\b/i,
	/\bcite\b/i,
	/https?:\/\//i,
	/www\./i
];

const CALENDAR_INTENT_PATTERNS: RegExp[] = [
	/\bcalendar\b/i,
	/\bschedule\b/i,
	/\bmeeting\b/i,
	/\bevent\b/i,
	/\bavailability\b/i,
	/\bappointment\b/i,
	/\breminder\b/i,
	/\bdeadline\b/i,
	/\bwhat(?:'s| is)\s+on\s+my\s+calendar\b/i,
	/\bcalendar\s+for\b/i,
	/\bdue\s+(?:date|by)\b/i
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
	return patterns.some((pattern) => pattern.test(text));
}

function isProjectContext(contextType: ChatContextType): boolean {
	return (
		contextType === 'project' ||
		contextType === 'project_audit' ||
		contextType === 'project_forecast' ||
		contextType === 'ontology'
	);
}

function isCalendarContext(contextType: ChatContextType): boolean {
	return contextType === 'calendar';
}

export function shouldEnableWebTools(message: string): boolean {
	const text = message?.trim() ?? '';
	if (!text) return false;
	return matchesAny(text, WEB_INTENT_PATTERNS);
}

export function shouldEnableCalendarTools(contextType: ChatContextType, message: string): boolean {
	if (isCalendarContext(contextType)) return true;
	if (isProjectContext(contextType)) return true;
	const text = message?.trim() ?? '';
	if (!text) return false;
	return matchesAny(text, CALENDAR_INTENT_PATTERNS);
}

export function selectFastChatTools(params: {
	contextType: ChatContextType;
	message: string;
}): ChatToolDefinition[] {
	if (isToolGatewayEnabled()) {
		return [...GATEWAY_TOOL_DEFINITIONS];
	}

	const normalized = normalizeFastContextType(params.contextType);
	let tools = getToolsForContextType(normalized as Exclude<ChatContextType, 'general'>, {
		includeWriteTools: true
	});

	if (!shouldEnableCalendarTools(normalized, params.message)) {
		tools = tools.filter((tool) => !CALENDAR_TOOL_NAMES.has(resolveToolName(tool)));
	} else if (!isProjectContext(normalized) && !isCalendarContext(normalized)) {
		tools = tools.filter((tool) => !PROJECT_CALENDAR_TOOL_NAMES.has(resolveToolName(tool)));
	}

	return tools;
}
