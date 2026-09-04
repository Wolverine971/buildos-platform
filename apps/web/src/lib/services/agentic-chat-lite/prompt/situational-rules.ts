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
 * Trigger design (revised 2026-09-02, turn executor audit Findings 9 and 10):
 * the write block keys off write INTENT — a pending semantic contract, the
 * retired lexical turn-intent flag, a living-reference capture, or a mutation
 * verb in the message — never off "write tools are mounted". Every project
 * turn mounts write tools, so tool presence rendered the block on pure
 * questions. The research block still keys off web-tool presence (those tools
 * mount only when research is plausible) or research phrasing; the mid-turn
 * notice covers tools that materialize after the seed, which is itself an
 * intent signal.
 *
 * Worker-bound artifacts (`dynamicSkillTools: false`) get the worker's own
 * write route — an existing-entity write opens with declare_turn_contract —
 * and lose the "See the X skill" pointers the worker cannot follow.
 */

import { isWriteToolName } from '@buildos/agentic-chat-runtime/catalog';
import { looksLikeMutationTurn } from '$lib/services/agentic-chat/tools/domains/operational-skill-intent';

export type LitePromptTurnSituation = {
	writeIntent: boolean;
	webResearch: boolean;
	reviewDelegation?: boolean;
	livingWorkspace?: boolean;
	livingWorkspaceCapture?: boolean;
	domainProfile?: string | null;
	domainAffinity?: string | null;
	/**
	 * True when the prompt is bound to the reviewed worker lane: no dynamic
	 * skill tools, and existing-entity writes must open with a turn contract.
	 */
	workerBound?: boolean;
};

const WEB_TOOL_NAMES = new Set(['web_search', 'web_visit']);

// One clarification sentence for the whole file (audit C5 collapsed four
// phrasings). It matches the worker's control rule: clarify only when a
// required target or value still has several plausible choices after reading.
export const CLARIFICATION_RULE_LINE =
	'- Ask one clarification only when a required target or value still has multiple plausible choices after reading context; never guess among candidates, and never ask when a read can settle it.';

const EXACT_ID_RULE_LINE =
	'- Use exact full IDs copied from context or tool results. Never truncate or abbreviate IDs, and never use placeholders like `"..."`, `"REPLACE_ME"`, `"<task_id>"`, `"TBD"`, `"none"`, or `"null"`.';

const TASK_STATE_RULE_LINE =
	'- When a task has visibly advanced (started, in progress, blocked, or finished), include `state_key` in `update_onto_task` alongside any description change.';

/** Web lane: the model can search, then write directly. */
export const WRITE_TURN_RULE_LINES = [
	'- Resolve write targets in this order: reuse exact IDs from loaded context or prior tool results; search within the current project when project scope is known; search the workspace when project scope is unknown.',
	EXACT_ID_RULE_LINE,
	CLARIFICATION_RULE_LINE,
	`${TASK_STATE_RULE_LINE} See the task_management skill for the full playbook.`
];

/**
 * Worker lane: the reviewed harness withholds any direct write that selects an
 * existing entity and redirects it to the contract route (audit F-A3). Teach
 * that route up front instead of "find the id then write".
 */
export const WORKER_WRITE_TURN_RULE_LINES = [
	'- Writing to an existing entity: call declare_turn_contract first, unless the target id is the focused entity, was given by the user, or is the only entity of its kind that a read in this turn returned. Creates inside the focused project can be direct calls.',
	EXACT_ID_RULE_LINE,
	CLARIFICATION_RULE_LINE,
	TASK_STATE_RULE_LINE
];

export function getWriteTurnRuleLines(workerBound: boolean | null | undefined): string[] {
	return workerBound ? WORKER_WRITE_TURN_RULE_LINES : WRITE_TURN_RULE_LINES;
}

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
	'- This is an implicit capture turn: perform the smallest relevant durable document write before replying. Do not merely acknowledge or promise an update.';

export const REVIEW_DELEGATION_RULE_LINES = [
	'- Gather and read the relevant project entities first, then call delegate_task once with the exact focused project ID, the exact discovered entity IDs, and the intended outcome for each entity.',
	'- A prose plan, chat table, or proposal document is not a staged change set. Do not finish with only a plan and do not ask whether to delegate; this turn already commissions the review-only handoff.',
	'- delegate_task stages changes for later user review. It does not approve or apply them, so never substitute direct writes and never claim the proposal is staged until that tool succeeds.'
];

// Conservative on purpose: web-tool mounting is the primary trigger, this
// regex only buys the block for turns that name web research before any web
// tool exists on the surface.
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
	reviewDelegation?: boolean | null;
	livingWorkspace?: boolean | null;
	livingWorkspaceCapture?: boolean | null;
	domainProfile?: string | null;
	domainAffinity?: string | null;
	workerBound?: boolean | null;
}): LitePromptTurnSituation {
	const webToolsMounted = params.toolNames.some((name) => WEB_TOOL_NAMES.has(name));
	const livingWorkspaceCapture = params.livingWorkspaceCapture === true;
	return {
		writeIntent:
			Boolean(params.turnIntentRequiresWrite) ||
			livingWorkspaceCapture ||
			looksLikeMutationTurn(params.latestUserMessage),
		webResearch: webToolsMounted || looksLikeWebResearchTurn(params.latestUserMessage),
		reviewDelegation: params.reviewDelegation === true,
		livingWorkspace: params.livingWorkspace === true,
		livingWorkspaceCapture,
		domainProfile: params.domainProfile ?? null,
		domainAffinity: params.domainAffinity ?? null,
		workerBound: params.workerBound === true
	};
}

export function hasActiveSituation(situation: LitePromptTurnSituation | null | undefined): boolean {
	return Boolean(
		situation &&
			(situation.writeIntent ||
				situation.webResearch ||
				situation.reviewDelegation ||
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
		blocks.push(
			[
				'This turn can write to project data:',
				...getWriteTurnRuleLines(situation.workerBound)
			].join('\n')
		);
	}
	if (situation?.webResearch) {
		blocks.push(['This turn involves web research:', ...WEB_RESEARCH_RULE_LINES].join('\n'));
	}
	if (situation?.reviewDelegation) {
		blocks.push(
			['This turn requires a review-staged Agent Run:', ...REVIEW_DELEGATION_RULE_LINES].join(
				'\n'
			)
		);
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
 * arrive with them, in the recency position. Only the web lane materializes
 * tools mid-turn, so these are the web rules.
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
