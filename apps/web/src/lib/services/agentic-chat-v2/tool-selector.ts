// apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import {
	getGatewaySurfaceForContextType,
	getGatewaySurfaceForProfile,
	materializeGatewayTools,
	resolveGatewaySurfaceProfileForContextType,
	type GatewaySurfaceProfileName,
	type ProjectCreateExecutionWorkflow
} from '@buildos/agentic-chat-runtime/catalog';
import { type FastChatTurnIntent } from './turn-intent';
import { looksLikeWebResearchTurn } from '$lib/services/agentic-chat-lite/prompt/situational-rules';
import {
	LIVING_REFERENCE_MODE,
	type AgentWorkspaceMetadata
} from '$lib/services/agentic-chat/project-domain-profiles';

export type LivingWorkspaceToolSelection = {
	tools: ChatToolDefinition[];
	implicitCapture: boolean;
	commissionedWriteMinimumCount: number;
};

/**
 * A living-reference project always exposes the document tools its standing
 * agreement may require. Whether the current message actually commissions a
 * capture is decided by the semantic disposition gate, not by message regex.
 */
export function applyLivingWorkspaceToolProfile(params: {
	tools: ChatToolDefinition[];
	workspace: AgentWorkspaceMetadata | null | undefined;
	latestUserMessage?: string | null;
	turnIntent?: FastChatTurnIntent | null;
}): LivingWorkspaceToolSelection {
	if (params.workspace?.mode !== LIVING_REFERENCE_MODE) {
		return {
			tools: params.tools,
			implicitCapture: false,
			commissionedWriteMinimumCount: 0
		};
	}
	const materialized = materializeGatewayTools(params.tools, [
		'create_onto_document',
		'update_onto_document'
	]).tools;
	return {
		tools: materialized,
		implicitCapture: false,
		commissionedWriteMinimumCount: 0
	};
}

export function selectFastChatTools(params: {
	contextType: ChatContextType;
	surfaceProfile?: GatewaySurfaceProfileName;
	latestUserMessage?: string | null;
	turnIntent?: FastChatTurnIntent | null;
	leanDiscovery?: boolean;
	allowLegacySurfaceFallback?: boolean;
	projectCreateWorkflow?: ProjectCreateExecutionWorkflow;
}): ChatToolDefinition[] {
	let tools: ChatToolDefinition[];
	if (params.surfaceProfile) {
		tools = getGatewaySurfaceForProfile(params.surfaceProfile, {
			leanDiscovery: params.leanDiscovery
		});
	} else {
		const routedProfile = resolveFastChatSurfaceProfileForTurn({
			contextType: params.contextType,
			latestUserMessage: params.latestUserMessage,
			turnIntent: params.turnIntent,
			allowLegacySurfaceFallback: params.allowLegacySurfaceFallback
		});
		tools = routedProfile
			? getGatewaySurfaceForProfile(routedProfile, {
					leanDiscovery: params.leanDiscovery
				})
			: getGatewaySurfaceForContextType(params.contextType, {
					leanDiscovery: params.leanDiscovery
				});
	}
	// Do not let an explicit broader profile or message-shape enrichment expand
	// either project-create lane. Web persists one compound ProjectSpec; the
	// reviewed worker admits semantic controls plus shell/goal/task creation.
	if (params.contextType === 'project_create') {
		return getGatewaySurfaceForProfile(
			params.projectCreateWorkflow === 'reviewed_shell'
				? 'project_create_minimal'
				: 'project_create_compound'
		);
	}
	const crossProjectTools = looksLikeCrossProjectTaskMove(
		params.contextType,
		[
			params.latestUserMessage,
			params.turnIntent?.source === 'pending_continuation'
				? params.turnIntent.originalRequestText
				: null
		]
			.filter(
				(value): value is string => typeof value === 'string' && value.trim().length > 0
			)
			.join('\n')
	)
		? ['move_onto_task']
		: [];
	const delegationIntentText = [
		params.latestUserMessage,
		params.turnIntent?.source === 'pending_continuation'
			? params.turnIntent.originalRequestText
			: null
	]
		.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
		.join('\n');
	const delegationTools =
		looksLikeDelegatedResearchTurn(delegationIntentText) ||
		looksLikeBroadProjectChangeTurn(params.contextType, delegationIntentText) ||
		looksLikeReviewStagingTurn(params.contextType, delegationIntentText)
			? ['delegate_task']
			: [];
	// tasker/39 stage 3: turns that plainly ask for web research get web tools
	// at launch (and with them the situational research rules), instead of
	// spending a discovery round finding web_search first.
	const webResearchTools = looksLikeWebResearchTurn(params.latestUserMessage)
		? ['web_search', 'web_visit']
		: [];
	// External-account tools are intentionally legacy-only during the worker
	// cutover. Materialize them at launch when the request is explicit so worker
	// admission can deterministically renegotiate instead of accepting a turn
	// whose bounded tool surface cannot satisfy the request.
	const externalEmailReadTools = looksLikeExternalEmailReadTurn(params.latestUserMessage)
		? ['list_email_accounts', 'search_email_messages', 'get_email_message']
		: [];
	const externalCalendarTools = looksLikeExternalCalendarTurn(params.latestUserMessage)
		? ['list_calendar_events']
		: [];
	return materializeGatewayTools(tools, [
		...crossProjectTools,
		...delegationTools,
		...webResearchTools,
		...externalEmailReadTools,
		...externalCalendarTools
	]).tools;
}

export function resolveFastChatSurfaceProfileForTurn(params: {
	contextType: ChatContextType;
	latestUserMessage?: string | null;
	turnIntent?: FastChatTurnIntent | null;
	allowLegacySurfaceFallback?: boolean;
}): GatewaySurfaceProfileName {
	// Project turns always receive the same common read/write capability bundle.
	// The model's tool call is the semantic decision; lexical intent inference is
	// retained elsewhere for telemetry and compatibility, not tool authority.
	if (params.contextType === 'project' || params.contextType === 'ontology') {
		return 'project_write_document';
	}
	return resolveGatewaySurfaceProfileForContextType(params.contextType);
}

function looksLikeCrossProjectTaskMove(
	contextType: ChatContextType,
	latestUserMessage?: string | null
): boolean {
	if (contextType !== 'project' && contextType !== 'ontology' && contextType !== 'global') {
		return false;
	}
	const text = latestUserMessage?.trim() ?? '';
	if (!text || !/\b(?:task|todo|item)\b/i.test(text)) return false;

	return (
		/\bwrong\s+project\b/i.test(text) ||
		/\b(?:move|moves|moved|moving|transfer|transfers|transferred|transferring|relocate|relocates|relocated|relocating)\b[\s\S]{0,100}\b(?:task|todo|item)\b[\s\S]{0,120}\b(?:to|into|between|another|different)\b[\s\S]{0,60}\bprojects?\b/i.test(
			text
		) ||
		/\b(?:task|todo|item)\b[\s\S]{0,100}\b(?:move|moves|moved|moving|transfer|transfers|transferred|transferring|relocate|relocates|relocated|relocating)\b[\s\S]{0,120}\b(?:to|into|between|another|different)\b[\s\S]{0,60}\bprojects?\b/i.test(
			text
		)
	);
}

function looksLikeDelegatedResearchTurn(latestUserMessage?: string | null): boolean {
	const text = latestUserMessage?.trim() ?? '';
	if (!text) return false;
	return (
		/\bdeep[-\s]?research\b/i.test(text) ||
		/\b(?:delegate|delegation|sub-?agents?|background agent|research swarm)\b/i.test(text) ||
		/\b(?:research|investigate|analy[sz]e)\b[\s\S]{0,100}\b(?:in the background|take your time|get back to me|report back)\b/i.test(
			text
		)
	);
}

/**
 * Hot-load the review-required Agent Run bridge for the Phase 4 class of work:
 * one coherent project change that needs discovery, several reads, and a staged
 * multi-entity proposal. Keep ordinary single-entity edits on the direct path.
 */
export function looksLikeBroadProjectChangeTurn(
	contextType: ChatContextType,
	latestUserMessage?: string | null
): boolean {
	if (contextType !== 'project' && contextType !== 'ontology') return false;
	const text = latestUserMessage?.trim() ?? '';
	if (!text) return false;

	const hasChangeIntent =
		/\b(?:add|align|change|create|insert|integrate|launch|pivot|realign|refocus|reorient|restructure|revise|rewrite|shift|update)\b/i.test(
			text
		);
	if (!hasChangeIntent) return false;

	const hasBroadWorkingSet =
		/\b(?:all|entire|every|everything|whole)\b[\s\S]{0,100}\b(?:campaigns?|docs?|documents?|entities|goals?|materials?|milestones?|plans?|project|risks?|strategy|tasks?|working set)\b/i.test(
			text
		) ||
		/\b(?:across|throughout)\b[\s\S]{0,80}\b(?:campaigns?|docs?|documents?|goals?|materials?|plans?|project|tasks?)\b/i.test(
			text
		) ||
		/\b(?:relevant|related)\b[\s\S]{0,80}\b(?:campaigns?|docs?|documents?|entities|goals?|materials?|plans?|tasks?)\b/i.test(
			text
		);
	const hasStrategicReorientation =
		/\b(?:pivot|realign|refocus|reorient|restructure|shift)\b[\s\S]{0,100}\b(?:brand|campaign|direction|marketing|positioning|strategy)\b/i.test(
			text
		) ||
		/\b(?:brand|campaign|direction|marketing|positioning|strategy)\b[\s\S]{0,100}\b(?:pivot|realign|refocus|reorient|restructure|shift)\b/i.test(
			text
		);
	const hasCampaignInsertion =
		/\b(?:add|create|insert|integrate|launch)\b[\s\S]{0,80}\b(?:campaign|initiative)\b[\s\S]{0,120}\b(?:audience|channel|instagram|positioning|segment|strategy|target|targeting)\b/i.test(
			text
		);

	return hasBroadWorkingSet || hasStrategicReorientation || hasCampaignInsertion;
}

/**
 * Keep the review bridge mounted across the explicit follow-up that often comes
 * after chat has presented a gathered plan. This is intentionally narrower than
 * generic "proposal" language: the user must ask to stage/dispatch a change set
 * or name the review-required background handoff.
 */
export function looksLikeReviewStagingTurn(
	contextType: ChatContextType,
	latestUserMessage?: string | null
): boolean {
	if (contextType !== 'project' && contextType !== 'ontology') return false;
	const text = latestUserMessage?.trim() ?? '';
	if (!text) return false;

	return (
		/\b(?:stage|dispatch)\b[\s\S]{0,140}\b(?:change[-\s]?set|background\s+(?:agent|delegate|run))\b/i.test(
			text
		) ||
		/\b(?:change[-\s]?set|background\s+(?:agent|delegate|run))\b[\s\S]{0,140}\b(?:stage|dispatch|review[-\s]?required)\b/i.test(
			text
		)
	);
}

function looksLikeExternalEmailReadTurn(latestUserMessage?: string | null): boolean {
	const text = latestUserMessage?.trim() ?? '';
	if (!text) return false;
	if (/\b(?:gmail|inbox|mailbox)\b/i.test(text)) return true;
	if (/\b(?:who|when|has|have|did)\b[\s\S]{0,60}\be-?mailed\s+(?:me|us)\b/i.test(text)) {
		return true;
	}
	if (!/\be-?mails?\b/i.test(text)) return false;
	if (/\b(?:(?:my|the|an?|connected|linked)\s+)+(?:e-?mail|mail)\s+accounts?\b/i.test(text)) {
		return true;
	}
	// Retrieval language must govern the email object. `list` needs a stronger
	// imperative boundary than the other retrieval verbs because it is also a
	// common noun inside task titles ("the beta list email thing").
	return (
		/\b(?:search|find|look\s+(?:for|through)|pull\s+up|get|check|read|open|show|scan)\s+(?:(?:me|my|the|that|this|these|those|all|any|new|recent|latest|unread|connected|linked|through|for|in|up)\s+){0,5}(?:e-?mails?|mail|email\s+messages?|messages?)\b/i.test(
			text
		) ||
		/(?:^|[.!?]\s+)(?:(?:please|kindly)\s+|(?:can|could|would|will)\s+you\s+(?:please\s+)?|(?:i(?:'d|\s+would)?\s+like|i\s+(?:want|need))\s+(?:you\s+)?to\s+)?list\s+(?:(?:me|my|the|that|this|these|those|all|any|new|recent|latest|unread|connected|linked|through|for|in|up)\s+){0,5}(?:e-?mails?|mail|email\s+messages?|messages?)\b/i.test(
			text
		) ||
		/\b(?:what|which|whose|how\s+many)\s+(?:(?:new|recent|latest|unread)\s+){0,2}e-?mails?\b/i.test(
			text
		)
	);
}

const CALENDAR_MENTION_PATTERN = /\bcalendars?\b/gi;
const CALENDAR_EVENT_MENTION_PATTERN = /\b(?:events?|appointments?)\b/gi;
const CALENDAR_ACTION_PATTERN =
	/\b(?:schedule|reschedule|move|create|update|cancel|delete|list|show|find|check|today|tomorrow|week|month)\b/i;
// Negation cues that suppress a calendar mention. `don't forget` / `don't
// hesitate` are encouragements, not exclusions, so they are filtered below.
const CALENDAR_NEGATION_CUE_PATTERN =
	/\b(?:no|not|don'?t|do\s+not|does\s+not|doesn'?t|didn'?t|won'?t|never|without|avoids?|avoiding|skips?|skipping|excludes?|excluding|omits?|omitting|rather\s+than|instead\s+of)\b/gi;
const CALENDAR_NEGATION_FALSE_CUE_PATTERN = /^\s*(?:forget|hesitate)\b/i;
// A negation binds a nearby mention directly ("with no calendar events"), or
// governs a coordinated continuation of the same clause ("Do not duplicate the
// existing permit task or create calendar events").
const CALENDAR_NEGATION_ADJACENT_WORD_WINDOW = 6;
const CALENDAR_NEGATION_COORDINATED_WORD_WINDOW = 20;
const CALENDAR_NEGATION_COORDINATOR_PATTERN = /\b(?:or|nor)\b/i;

function countWords(text: string): number {
	return text.split(/\s+/).filter((word) => word.length > 0).length;
}

/** Clause spans, so a negation in one sentence cannot suppress the next. */
function findEnclosingClause(text: string, index: number): { start: number; end: number } {
	let start = 0;
	let end = text.length;
	for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
		if (/[.!?;\n]/.test(text[cursor] ?? '')) {
			start = cursor + 1;
			break;
		}
	}
	for (let cursor = index; cursor < text.length; cursor += 1) {
		if (/[.!?;\n]/.test(text[cursor] ?? '')) {
			end = cursor;
			break;
		}
	}
	return { start, end };
}

function isCalendarMentionNegated(text: string, mentionIndex: number): boolean {
	const clause = findEnclosingClause(text, mentionIndex);
	const before = text.slice(clause.start, mentionIndex);
	CALENDAR_NEGATION_CUE_PATTERN.lastIndex = 0;
	let negationEnd: number | null = null;
	let cue: RegExpExecArray | null;
	while ((cue = CALENDAR_NEGATION_CUE_PATTERN.exec(before)) !== null) {
		const trailing = before.slice(cue.index + cue[0].length);
		if (CALENDAR_NEGATION_FALSE_CUE_PATTERN.test(trailing)) continue;
		negationEnd = cue.index + cue[0].length;
	}
	if (negationEnd === null) return false;
	const between = before.slice(negationEnd);
	const distance = countWords(between);
	if (distance <= CALENDAR_NEGATION_ADJACENT_WORD_WINDOW) return true;
	return (
		distance <= CALENDAR_NEGATION_COORDINATED_WORD_WINDOW &&
		CALENDAR_NEGATION_COORDINATOR_PATTERN.test(between)
	);
}

function collectUnnegatedMentionCount(text: string, pattern: RegExp): number {
	pattern.lastIndex = 0;
	let count = 0;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text)) !== null) {
		if (!isCalendarMentionNegated(text, match.index)) count += 1;
	}
	return count;
}

/**
 * Detect turns that genuinely reach for the connected calendar. Calendar words
 * used as an *exclusion* ("with no calendar events", "Do not create another
 * task or a calendar event") must not mount `list_calendar_events`: that tool is
 * worker-unavailable, so materializing it renegotiates the turn onto the legacy
 * web engine, where ordinary task writes are then rejected by the lexical write
 * gate. Only mentions outside a negation window count as a calendar request.
 */
export function looksLikeExternalCalendarTurn(latestUserMessage?: string | null): boolean {
	const text = latestUserMessage?.trim() ?? '';
	if (!text) return false;
	if (collectUnnegatedMentionCount(text, CALENDAR_MENTION_PATTERN) > 0) return true;
	return (
		collectUnnegatedMentionCount(text, CALENDAR_EVENT_MENTION_PATTERN) > 0 &&
		CALENDAR_ACTION_PATTERN.test(text)
	);
}
