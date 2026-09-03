// apps/web/src/lib/services/agentic-chat/tools/domains/operational-skill-intent.ts
/**
 * Deterministic intent → operational-skill map (2026-09-02 turn executor
 * audit, Finding 4 / Decision 4).
 *
 * The nine BuildOS-operational skills (task_management, document_workspace,
 * plan_management, calendar_management, ...) live in no domain or outcome
 * card, so lexical domain sensing can never preload them, and the reviewed
 * worker lane cannot call skill_load. This module keys a preload off two
 * things the admission path already knows: the tools mounted on the resolved
 * surface (capability) and the mutation verbs in the message (intent). It
 * cannot misfire on prose the way the domain scorer did, and it never names a
 * skill whose tools are absent from the surface — a playbook that tells the
 * model to call an unmounted tool is a turn kill on the worker.
 *
 * The same lexicon backs `looksLikeMutationTurn`, which the situational write
 * rules use instead of "write tools are mounted" (Findings 9 and 10): the
 * legacy `resolveFastChatTurnIntent` classifier was retired to an empty
 * snapshot, so this is the only lexical write signal left on either lane.
 */

export type OperationalEntityKind = 'task' | 'document' | 'plan' | 'calendar';

export type OperationalSkillId =
	| 'task_management'
	| 'document_workspace'
	| 'plan_management'
	| 'calendar_management';

export type OperationalTurnIntent = {
	/** True when the message carries a mutation verb (with or without an entity noun). */
	mutation: boolean;
	/** Entity kinds the mutation verbs attach to, strongest signal first. */
	entityKinds: OperationalEntityKind[];
};

export type OperationalSkillResolution = {
	skillId: OperationalSkillId;
	entityKind: OperationalEntityKind;
	/** Other operational skills whose intent also fired and whose tools are mounted. */
	alternateSkillIds: OperationalSkillId[];
};

const OPERATIONAL_SKILL_BY_ENTITY: Record<OperationalEntityKind, OperationalSkillId> = {
	task: 'task_management',
	document: 'document_workspace',
	plan: 'plan_management',
	calendar: 'calendar_management'
};

/**
 * A skill is only eligible when at least one of its write tools is mounted on
 * the surface the model will actually see. Calendar tools are not executable
 * on the worker today and plan tools are on no project surface, so those two
 * entries activate automatically once their tools land, without a code change
 * here.
 */
const OPERATIONAL_SKILL_TOOL_REQUIREMENTS: Record<OperationalEntityKind, readonly string[]> = {
	task: ['create_onto_task', 'update_onto_task'],
	document: ['create_onto_document', 'update_onto_document', 'move_document_in_tree'],
	plan: ['create_onto_plan', 'update_onto_plan'],
	calendar: ['create_calendar_event', 'update_calendar_event']
};

const ENTITY_PRIORITY: OperationalEntityKind[] = ['task', 'document', 'plan', 'calendar'];

// Phrases that commission a durable change on their own; no entity noun needed.
const STRONG_MUTATION_PATTERNS: RegExp[] = [
	/\b(?:add|create|make|open|start|set up|spin up)\s+(?:a|an|the|new|another|two|three|\d+)\b/i,
	/\b(?:track|log|record|capture|save|note|jot|write)\s+(?:this|that|it|these|those|them|down)\b/i,
	/\bremind me\b/i,
	/\bmark\b[\s\S]{0,80}\b(?:as\s+)?(?:done|complete|completed|finished|closed|in[-\s]progress|blocked|todo|to-do)\b/i,
	/\b(?:complete|finish|close|reopen|archive|delete|remove|drop|cancel|postpone|unblock)\s+(?:the|this|that|my|our|those|these|all|every)\b/i,
	/\b(?:rename|retitle|reschedule|reassign|reprioritize|re-?organi[sz]e|restructure|nest|unnest|tidy(?: up)?|clean(?: up)?|declutter)\b/i,
	/\b(?:move|transfer|relocate|file)\b[\s\S]{0,80}\b(?:to|into|under|out of|beneath|inside)\b/i,
	/\b(?:append|attach|link|unlink|merge|split|tag|untag)\b/i,
	/\b(?:update|edit|change|revise|rewrite|refresh|bump|push back|pull in|prioriti[sz]e)\s+(?:the|this|that|my|our|its|their|those|these|all|every)\b/i,
	/\b(?:put|add|schedule|book|block)\b[\s\S]{0,60}\b(?:on|onto|in|into)\s+(?:my|the|our)\s+calendar\b/i,
	/\b(?:is|are|was|were)\s+(?:a\s+)?mess\b/i
];

// Phrases that look like verbs but ask for a read.
const READ_ONLY_OVERRIDE_PATTERNS: RegExp[] = [
	/\b(?:update me|catch me up|fill me in|bring me up to speed|give me an update|status update)\b/i,
	/\b(?:what|which|where|when|who|how many|how much|is there|are there|do we have|did we)\b[\s\S]{0,40}\b(?:changed|moved|updated|created|added|completed|done)\b/i
];

// A message that opens as a question is a read unless it also carries a
// strong mutation phrase ("could you rename…", "can you add a task…").
const QUESTION_LEAD_PATTERN =
	/^\s*(?:what|which|who|when|where|why|how|is|are|do|does|did|has|have|should|could|would|will|can|any)\b/i;

type EntityLexicon = {
	nouns: RegExp;
	/** Entity-specific idioms that fire without a generic mutation verb. */
	idioms: RegExp[];
	/** Verbs that only count when they sit near one of the entity nouns. */
	verbs: RegExp;
};

const ENTITY_LEXICON: Record<OperationalEntityKind, EntityLexicon> = {
	task: {
		nouns: /\b(?:tasks?|to-?dos?|todo items?|action items?|follow-?ups?|reminders?|checklist items?|next steps?|deliverables?|deadlines?|due dates?)\b/i,
		idioms: [
			/\bremind me\b/i,
			/\bmark\b[\s\S]{0,80}\b(?:as\s+)?(?:done|complete|completed|finished|closed|in[-\s]progress|blocked)\b/i,
			/\b(?:add|create|make|open)\s+(?:a|an|the|new|another|two|three|\d+)\s+(?:quick\s+|new\s+)?(?:tasks?|to-?dos?|reminders?|action items?|follow-?ups?)\b/i,
			/\btrack\s+(?:this|that|it|these|those)\b/i,
			/\b(?:assign|reassign|hand)\s+(?:this|that|it|the|these|those)?\s*(?:task|tasks|item|items|work)?\s*(?:to|over to)\b/i,
			/\bi\s+(?:finished|completed|closed out|wrapped up|knocked out|did|started|kicked off)\s+(?:the|that|this|my|our)\b/i
		],
		verbs: /\b(?:add|create|make|open|update|edit|change|rename|complete|finish|close|reopen|archive|delete|remove|drop|move|assign|reassign|prioriti[sz]e|reschedule|schedule|start|block|unblock|bump|push|pull|set|mark|track|log|split|merge|tag)\b/i
	},
	document: {
		nouns: /\b(?:documents?|docs?|notes?|pages?|folders?|outlines?|sections?|wiki|write-?ups?|briefs?|specs?|readmes?|document tree|doc tree|knowledge base|reference sheet|research notes?|meeting notes?)\b/i,
		idioms: [
			/\b(?:documents?|docs?|folders?|notes?|tree)\b[\s\S]{0,40}\b(?:is|are)\s+(?:a\s+)?(?:mess|messy|disorganized|all over the place|scattered)\b/i,
			/\b(?:save|write|jot|note|capture|record)\s+(?:this|that|it|these|those|them|down)\b/i,
			/\b(?:write|draft|start|create|make|open)\s+(?:a|an|the|new|another)\s+(?:quick\s+|new\s+|short\s+)?(?:documents?|docs?|notes?|pages?|outlines?|write-?ups?|briefs?|specs?)\b/i,
			/\bappend\b/i,
			/\bnest\b/i,
			/\bput\s+(?:this|that|it|these|those)\s+(?:in|into|under)\s+(?:a|the|my|our)?\s*(?:documents?|docs?|notes?|folders?)\b/i
		],
		verbs: /\b(?:create|make|write|draft|add|update|edit|change|rename|retitle|revise|rewrite|append|attach|move|file|organi[sz]e|re-?organi[sz]e|restructure|nest|unnest|tidy|clean|declutter|archive|delete|remove|merge|split|save|record|capture|link|unlink)\b/i
	},
	plan: {
		nouns: /\b(?:plans?|phases?|sprints?|roadmaps?|milestones?|work ?streams?|iterations?|releases?)\b/i,
		idioms: [
			/\b(?:plan|lay|map|sketch|block)\s+out\b/i,
			/\b(?:create|make|build|draft|put together|set up|write)\s+(?:a|an|the|new|another|our|my)\s+(?:quick\s+|new\s+|rough\s+|execution\s+|project\s+)?(?:plans?|phases?|sprints?|roadmaps?|milestones?)\b/i,
			/\b(?:next|new|upcoming)\s+(?:sprint|phase|iteration|release)\b/i
		],
		verbs: /\b(?:create|make|build|draft|update|edit|change|revise|refine|rework|rename|add|remove|delete|reorder|resequence|move|split|merge|set|extend|shorten|push|pull)\b/i
	},
	calendar: {
		nouns: /\b(?:calendar|events?|meetings?|calls?|appointments?|sessions?|time ?blocks?|slots?|invites?|standups?|syncs?|check-?ins?)\b/i,
		idioms: [
			/\b(?:put|add|schedule|book|block)\b[\s\S]{0,60}\b(?:on|onto|in|into)\s+(?:my|the|our)\s+calendar\b/i,
			/\b(?:schedule|book|set up|arrange|reschedule|move|push|cancel)\s+(?:a|an|the|my|our|this|that|next|another)?\s*(?:quick\s+)?(?:meeting|call|session|appointment|event|standup|sync|check-?in|time block|working session|focus block)\b/i,
			/\bblock\s+(?:off\s+|out\s+)?(?:\d+|an?|some|the)\s+(?:hours?|minutes?|mornings?|afternoons?|days?|time)\b/i
		],
		verbs: /\b(?:schedule|reschedule|book|block|set up|arrange|move|push|cancel|delete|remove|update|edit|change|add|create|put|shift|extend|shorten)\b/i
	}
};

const NEAR_WINDOW = 70;

function verbNearNoun(text: string, verbs: RegExp, nouns: RegExp): boolean {
	const verbMatches = collectMatches(text, verbs);
	if (verbMatches.length === 0) return false;
	const nounMatches = collectMatches(text, nouns);
	if (nounMatches.length === 0) return false;
	return verbMatches.some((verb) =>
		nounMatches.some((noun) => Math.abs(noun.index - verb.index) <= NEAR_WINDOW)
	);
}

function collectMatches(text: string, pattern: RegExp): Array<{ index: number }> {
	const global = new RegExp(
		pattern.source,
		pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
	);
	const matches: Array<{ index: number }> = [];
	let match: RegExpExecArray | null;
	while ((match = global.exec(text)) !== null) {
		matches.push({ index: match.index });
		if (match[0].length === 0) global.lastIndex += 1;
	}
	return matches;
}

function isReadOnlyOverride(text: string): boolean {
	return READ_ONLY_OVERRIDE_PATTERNS.some((pattern) => pattern.test(text));
}

export function classifyOperationalTurnIntent(
	message: string | null | undefined
): OperationalTurnIntent {
	const text = message?.trim() ?? '';
	if (!text || isReadOnlyOverride(text)) return { mutation: false, entityKinds: [] };
	const strongMutation = STRONG_MUTATION_PATTERNS.some((pattern) => pattern.test(text));
	if (QUESTION_LEAD_PATTERN.test(text) && !strongMutation) {
		return { mutation: false, entityKinds: [] };
	}

	const scored = ENTITY_PRIORITY.map((entityKind) => {
		const lexicon = ENTITY_LEXICON[entityKind];
		const idiomHits = lexicon.idioms.filter((pattern) => pattern.test(text)).length;
		const verbNearNounHit = verbNearNoun(text, lexicon.verbs, lexicon.nouns) ? 1 : 0;
		return { entityKind, score: idiomHits * 2 + verbNearNounHit };
	}).filter((entry) => entry.score > 0);
	scored.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return ENTITY_PRIORITY.indexOf(a.entityKind) - ENTITY_PRIORITY.indexOf(b.entityKind);
	});
	const entityKinds = scored.map((entry) => entry.entityKind);
	return { mutation: entityKinds.length > 0 || strongMutation, entityKinds };
}

/** Lexical write signal for the situational write rules. */
export function looksLikeMutationTurn(message: string | null | undefined): boolean {
	return classifyOperationalTurnIntent(message).mutation;
}

export function isOperationalSkillEligibleForTools(
	entityKind: OperationalEntityKind,
	toolNames: readonly string[]
): boolean {
	const mounted = new Set(toolNames);
	return OPERATIONAL_SKILL_TOOL_REQUIREMENTS[entityKind].some((name) => mounted.has(name));
}

/**
 * Pick the operational skill for this turn: the strongest entity intent whose
 * write tools are mounted. Returns null for read turns and for surfaces that
 * cannot act on the sensed entity.
 */
export function resolveOperationalSkillForTurn(params: {
	message: string | null | undefined;
	toolNames: readonly string[];
}): OperationalSkillResolution | null {
	const intent = classifyOperationalTurnIntent(params.message);
	const eligible = intent.entityKinds.filter((entityKind) =>
		isOperationalSkillEligibleForTools(entityKind, params.toolNames)
	);
	const [primary, ...rest] = eligible;
	if (!primary) return null;
	return {
		skillId: OPERATIONAL_SKILL_BY_ENTITY[primary],
		entityKind: primary,
		alternateSkillIds: rest.map((entityKind) => OPERATIONAL_SKILL_BY_ENTITY[entityKind])
	};
}
