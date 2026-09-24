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
 * Triggers (revised 2026-09-23, AGENTS.md "Never classify language with
 * regex"): every block keys off a structured signal, never the wording of the
 * user's message. The write block keys off a pending semantic contract — the
 * one structural write signal admission has (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08
 * F44). The lexical `looksLikeMutationTurn` / `looksLikeWebResearchTurn`
 * triggers are gone; admission has no structured research signal, so
 * `webResearch` is set only by callers that have one. On the worker lane the
 * worker owns both sets of rules where the structure is live: the write
 * argument rules ride its write-routing message (mounted with mutation
 * tools), and the research rules are appended when a web tool survives Jev's
 * schema selection (WEB_RESEARCH_RULES_INSTRUCTION). Tool presence alone
 * never selects a block here (F01: web and delegate tools ride every
 * surface). Review-delegation rules live on the delegate_task description.
 *
 * Worker-bound artifacts (`dynamicSkillTools: false`) get the worker's own
 * write recipe (the deterministic direct-write floor, then review for the
 * rest) and lose the "See the X skill" pointers the worker cannot follow.
 */

import { isWriteToolName } from '@buildos/agentic-chat-runtime/catalog';

export type LitePromptTurnSituation = {
	writeIntent: boolean;
	webResearch: boolean;
	/**
	 * True when the prompt is bound to the reviewed worker lane: no dynamic
	 * skill tools, and the worker (not the model) routes unresolved
	 * existing-entity writes to review.
	 */
	workerBound?: boolean;
};

const WEB_TOOL_NAMES = new Set(['web_search', 'web_visit', 'web_navigate']);

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
 * Worker lane: an ordered recipe that leads with the direct cases and matches
 * write-routing.ts (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F02). The old line
 * opened "call declare_turn_contract first, unless ..." while the opening pass
 * does not mount that tool; a weak model executed the imperative and every
 * single-target edit took the contract lane. Tool-neutral on purpose: the
 * worker chooses the route, the model proposes the calls.
 */
export const WORKER_WRITE_TURN_RULE_LINES = [
	'- Writing: call the mutation tool directly when the target is a new entity in the focused project, the focused entity or project itself, the only entity of its kind that a read this turn returned, or a full UUID the user typed that a read this turn loaded (up to three such calls in one response). Any other existing-entity write is routed to review by the worker after you propose it; you do not choose the route.',
	// Exact-ID and state_key rules ride the worker's write-routing message,
	// which is mounted whenever mutation tools are (2026-09-23).
	CLARIFICATION_RULE_LINE
];

export function getWriteTurnRuleLines(workerBound: boolean | null | undefined): string[] {
	return workerBound ? WORKER_WRITE_TURN_RULE_LINES : WRITE_TURN_RULE_LINES;
}

export const WEB_RESEARCH_RULE_LINES = [
	"- The user's own projects, tasks, and documents live in the workspace — search there first. Use web_search to find sources and web_visit to read the most promising pages for current or external information (news, market prices, competitor products, third-party vendor documentation).",
	'- Issuing several web_search or web_visit calls in one response lets them run concurrently. Visit URLs that came from search results or the user, not guessed addresses. When you answer from web results, cite the source URLs.',
	'- Research you do not write down is lost when this session ends. If this turn runs two or more web_search or web_visit calls, save what you learned into a project document before you finish — create one, or append to the document the research was for — with a Sources section listing the URLs used. Then tell the user the takeaways and where you put the detail; do not paste the whole document into the reply. Answering from research without saving it is a failure, not a shortcut.'
];

export function resolveLitePromptTurnSituation(params: {
	/** Accepted for call-site compatibility; mount state never selects a block (F01). */
	toolNames: string[];
	/** A complex-write contract carried forward from a prior turn is a write commitment. */
	pendingTurnContract?: boolean | null;
	workerBound?: boolean | null;
}): LitePromptTurnSituation {
	return {
		writeIntent: Boolean(params.pendingTurnContract),
		// No admission-time structured research signal exists; see the header.
		webResearch: false,
		workerBound: params.workerBound === true
	};
}

export function hasActiveSituation(situation: LitePromptTurnSituation | null | undefined): boolean {
	return Boolean(situation && (situation.writeIntent || situation.webResearch));
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
	// Worker-bound research rules are appended by the worker when a web tool
	// is callable after schema selection, not rendered here.
	if (situation?.webResearch && !situation.workerBound) {
		blocks.push(['This turn involves web research:', ...WEB_RESEARCH_RULE_LINES].join('\n'));
	}
	return blocks.length > 0 ? blocks.join('\n\n') : null;
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
