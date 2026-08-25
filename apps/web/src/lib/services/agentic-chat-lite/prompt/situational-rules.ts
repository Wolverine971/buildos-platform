// apps/web/src/lib/services/agentic-chat-lite/prompt/situational-rules.ts
/**
 * Situational rule blocks (tasker/39 stage 3, 2026-07-26).
 *
 * Rules that only apply to a recognizable turn shape (writes, web research)
 * used to sit mid-list in the always-on Operating Strategy section, where the
 * measured effect of at least one of them (research persistence, position 13
 * of 19) was zero across five runs. They now render as a dedicated section
 * only when the situation is live, and ride the orchestrator's mid-turn
 * tool-materialization notices when the situation develops after the seed
 * prompt was built.
 *
 * Trigger design: both blocks key off capability, not guessed intent — the
 * write block renders when write tools are mounted (or turn intent flagged a
 * write), the research block when web tools are mounted (or the message
 * plainly asks for web research). A turn that cannot write never needs the
 * write rules, so coverage is complete rather than classifier-limited; the
 * mid-turn notice covers tools that materialize after the seed.
 */

import { isWriteToolName } from '@buildos/agentic-chat-runtime/catalog';

export type LitePromptTurnSituation = {
	writeIntent: boolean;
	webResearch: boolean;
	livingWorkspace?: boolean;
	livingWorkspaceCapture?: boolean;
	domainProfile?: string | null;
	domainAffinity?: string | null;
};

const WEB_TOOL_NAMES = new Set(['web_search', 'web_visit']);

export const WRITE_TURN_RULE_LINES = [
	'- Resolve write targets in this order: reuse exact IDs from loaded context or prior tool results; search within the current project when project scope is known; search the workspace when project scope is unknown; ask one concise clarification when multiple plausible matches remain.',
	'- Use exact full IDs copied from context or tool results; resolve an ambiguous target with a read op or one concise question before writing. Never truncate or abbreviate IDs, and never use placeholders like `"..."`, `"REPLACE_ME"`, `"<task_id>"`, `"TBD"`, `"none"`, or `"null"`.',
	'- When a task has visibly advanced (started, in progress, blocked, or finished), include `state_key` in `update_onto_task` alongside any description change. See the task_management skill for the full playbook.'
];

export const WEB_RESEARCH_RULE_LINES = [
	"- The user's own projects, tasks, and documents live in the workspace — search there first. Use web_search to find sources and web_visit to read the most promising pages for current or external information (news, market prices, competitor products, third-party vendor documentation).",
	'- Issuing several web_search or web_visit calls in one response lets them run concurrently. Visit URLs that came from search results or the user, not guessed addresses. When you answer from web results, cite the source URLs.',
	'- Research you do not write down is lost when this session ends. If this turn runs two or more web_search or web_visit calls, save what you learned into a project document before you finish — create one, or append to the document the research was for — with a Sources section listing the URLs used. Then tell the user the takeaways and where you put the detail; do not paste the whole document into the reply. Answering from research without saving it is a failure, not a shortcut.'
];

export const LIVING_WORKSPACE_RULE_LINES = [
	'- Treat explicit durable additions from the user as updates to the project reference, not as facts that should remain only in chat.',
	'- Prefer the existing canonical document for the subject. Create the smallest useful new document only when no suitable home exists; preserve unrelated content and avoid duplicate reference sheets.',
	'- Questions, brainstorming, and assistant-generated options are proposals, not durable facts. Do not write them unless the user chooses one or explicitly asks to save them.',
	'- Keep initial organization lightweight. Stable homes and retrievability matter first; add hierarchy only when document density makes grouping useful.'
];

export const LIVING_WORKSPACE_CAPTURE_RULE_LINE =
	'- This is an implicit capture turn: perform the smallest relevant durable document write before replying. Do not merely acknowledge or promise an update. Stop for clarification only when a contradiction or genuinely ambiguous target makes a safe write impossible.';

// Conservative on purpose: web-tool mounting is the primary trigger, this
// regex only buys the block (and early web-tool mount, via the tool selector)
// for turns that name web research before any tool exists on the surface.
// Bare "research" is excluded — "research this project" is workspace work.
const WEB_RESEARCH_TURN_PATTERNS = [
	/\b(?:search|look\s?up|check|find)\b[\s\S]{0,50}\b(?:the web|online|the internet|google)\b/i,
	/\b(?:web|online|internet)\b[\s\S]{0,30}\b(?:search|research|look\s?up)\b/i,
	/\b(?:latest|current|up[-\s]?to[-\s]?date|today'?s)\b[\s\S]{0,60}\b(?:news|price|prices|pricing|benchmarks?|release|version|docs|documentation)\b/i,
	/\bcompetitor(?:s)?\b[\s\S]{0,60}\b(?:pricing|prices|products?|features?|research)\b/i,
	/\b(?:research|figure\s+out|find\s+out)\b[\s\S]{0,100}\b(?:other\s+people|others|competitors?)\b[\s\S]{0,50}\b(?:charging|pricing|prices)\b/i,
	// Natural delegated-research phrasing from the Phase 0 readback scenario.
	// Keep this bounded around an external comparison and a price verb so
	// ordinary "look into this project" workspace reads stay on the local path.
	/\b(?:look\s+into|research|figure\s+out|find\s+out)\b[\s\S]{0,100}\bother\b[\s\S]{0,80}\b(?:charge|charges|charging|pricing|prices)\b/i
];

export function looksLikeWebResearchTurn(text: string | null | undefined): boolean {
	const trimmed = text?.trim() ?? '';
	if (!trimmed) return false;
	return WEB_RESEARCH_TURN_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function resolveLitePromptTurnSituation(params: {
	toolNames: string[];
	turnIntentRequiresWrite?: boolean | null;
	latestUserMessage?: string | null;
	livingWorkspace?: boolean | null;
	livingWorkspaceCapture?: boolean | null;
	domainProfile?: string | null;
	domainAffinity?: string | null;
}): LitePromptTurnSituation {
	const webToolsMounted = params.toolNames.some((name) => WEB_TOOL_NAMES.has(name));
	const writeToolsMounted = params.toolNames.some((name) => isWriteToolName(name));
	return {
		writeIntent: Boolean(params.turnIntentRequiresWrite) || writeToolsMounted,
		webResearch: webToolsMounted || looksLikeWebResearchTurn(params.latestUserMessage),
		livingWorkspace: params.livingWorkspace === true,
		livingWorkspaceCapture: params.livingWorkspaceCapture === true,
		domainProfile: params.domainProfile ?? null,
		domainAffinity: params.domainAffinity ?? null
	};
}

export function hasActiveSituation(situation: LitePromptTurnSituation | null | undefined): boolean {
	return Boolean(
		situation &&
			(situation.writeIntent ||
				situation.webResearch ||
				situation.livingWorkspace ||
				situation.livingWorkspaceCapture)
	);
}

/**
 * Section body for the seed prompt. Inline prose lead-ins, no sub-headings —
 * replayed weak models mirror markdown sub-headings verbatim as their own
 * planning doc (see the Operating Strategy note in build-lite-prompt.ts).
 */
export function renderSituationalRulesContent(
	situation: LitePromptTurnSituation | null | undefined
): string | null {
	if (!hasActiveSituation(situation)) return null;
	const blocks: string[] = [];
	if (situation?.writeIntent) {
		blocks.push(['This turn can write to project data:', ...WRITE_TURN_RULE_LINES].join('\n'));
	}
	if (situation?.webResearch) {
		blocks.push(['This turn involves web research:', ...WEB_RESEARCH_RULE_LINES].join('\n'));
	}
	if (situation?.livingWorkspace) {
		const affinity = situation.domainAffinity
			? ` Domain affinity: ${situation.domainAffinity}${
					situation.domainProfile ? ` (${situation.domainProfile})` : ''
				}.`
			: '';
		blocks.push(
			[
				`This project has an active living-reference agreement.${affinity}`,
				...(situation.livingWorkspaceCapture ? [LIVING_WORKSPACE_CAPTURE_RULE_LINE] : []),
				...LIVING_WORKSPACE_RULE_LINES
			].join('\n')
		);
	}
	return blocks.join('\n\n');
}

/**
 * Compact rider for the orchestrator's mid-turn tool-materialization notice:
 * when write or web tools appear after the seed prompt was built, the rules
 * arrive with them, in the recency position.
 */
export function buildMidTurnSituationalNotice(addedToolNames: string[]): string | null {
	const addedWeb = addedToolNames.some((name) => WEB_TOOL_NAMES.has(name));
	const addedWrite = addedToolNames.some((name) => isWriteToolName(name));
	const blocks: string[] = [];
	if (addedWrite) {
		blocks.push(['Write rules now apply:', ...WRITE_TURN_RULE_LINES].join('\n'));
	}
	if (addedWeb) {
		blocks.push(['Web research rules now apply:', ...WEB_RESEARCH_RULE_LINES].join('\n'));
	}
	return blocks.length > 0 ? blocks.join('\n\n') : null;
}
