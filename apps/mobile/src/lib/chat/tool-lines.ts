// apps/mobile/src/lib/chat/tool-lines.ts
/**
 * One line per tool call in the work log, "verb · target", from the tool's name and
 * arguments. Tool names are structured (`search_onto_tasks`), not prose, so a prefix table is
 * the right shape; the web's presenter does the same with a much larger catalog. Display
 * only: a wrong verb costs a slightly odd log line, nothing else.
 */
export type ToolLine = { verb: string; target: string | null };

const VERBS: Record<string, string> = {
	search: 'Searching',
	list: 'Listing',
	get: 'Reading',
	find: 'Finding',
	read: 'Reading',
	create: 'Creating',
	update: 'Updating',
	delete: 'Deleting',
	link: 'Linking',
	unlink: 'Unlinking',
	move: 'Moving',
	set: 'Setting',
	tag: 'Tagging',
	request: 'Requesting',
	check: 'Checking',
	propose: 'Proposing',
	plan: 'Planning',
	run: 'Running'
};

const SPECIAL: Record<string, string> = {
	web_search: 'Searching the web',
	skill_load: 'Loading a skill',
	skill_search: 'Finding a skill',
	tool_search: 'Finding a tool',
	search_ontology: 'Searching everything'
};

const TARGET_KEYS = ['title', 'name', 'query', 'search', 'q', 'text', 'path', 'url'] as const;
const MAX_TARGET = 60;

function parseArgs(args: string | Record<string, unknown> | null | undefined) {
	if (!args) return null;
	if (typeof args === 'object') return args;
	try {
		const parsed: unknown = JSON.parse(args);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function targetFrom(args: Record<string, unknown> | null): string | null {
	if (!args) return null;
	for (const key of TARGET_KEYS) {
		const value = args[key];
		if (typeof value === 'string' && value.trim()) {
			const text = value.trim().replace(/\s+/g, ' ');
			return text.length > MAX_TARGET ? `${text.slice(0, MAX_TARGET - 1)}…` : text;
		}
	}
	return null;
}

export function toolLine(
	toolName: string,
	args?: string | Record<string, unknown> | null
): ToolLine {
	const name = toolName.trim().toLowerCase();
	const target = targetFrom(parseArgs(args));
	if (SPECIAL[name]) return { verb: SPECIAL[name], target };
	const parts = name.split('_').filter(Boolean);
	const verb = parts.length ? VERBS[parts[0]!] : undefined;
	const rest = (verb ? parts.slice(1) : parts).filter(
		(part) => part !== 'onto' && part !== 'buildos'
	);
	const object = rest.join(' ');
	if (verb) return { verb: object ? `${verb} ${object}` : verb, target };
	const fallback = object ? object.charAt(0).toUpperCase() + object.slice(1) : 'Working';
	return { verb: fallback, target };
}

/** Finished steps read in the past tense ("Searched tasks"), as the web's log does. */
const PAST: Record<string, string> = {
	Searching: 'Searched',
	Listing: 'Listed',
	Reading: 'Read',
	Finding: 'Found',
	Creating: 'Created',
	Updating: 'Updated',
	Deleting: 'Deleted',
	Linking: 'Linked',
	Unlinking: 'Unlinked',
	Moving: 'Moved',
	Setting: 'Set',
	Tagging: 'Tagged',
	Requesting: 'Requested',
	Checking: 'Checked',
	Proposing: 'Proposed',
	Planning: 'Planned',
	Running: 'Ran',
	Loading: 'Loaded'
};
const KNOWN_VERBS = new Set([...Object.keys(PAST), ...Object.values(PAST)]);

function splitVerb(verb: string): { first: string; rest: string } {
	const space = verb.indexOf(' ');
	return space < 0
		? { first: verb, rest: '' }
		: { first: verb.slice(0, space), rest: verb.slice(space + 1).trim() };
}

export function doneVerb(verb: string): string {
	const { first, rest } = splitVerb(verb);
	const past = PAST[first];
	return past ? (rest ? `${past} ${rest}` : past) : verb;
}

/**
 * What the step acted on, without its verb ("task" from "Updating task"), for rows whose action
 * badge already says the verb. Null when the line does not start with a verb this table knows.
 */
export function verbObject(verb: string): string | null {
	const { first, rest } = splitVerb(verb);
	return KNOWN_VERBS.has(first) && rest ? rest : null;
}
