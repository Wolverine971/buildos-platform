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
