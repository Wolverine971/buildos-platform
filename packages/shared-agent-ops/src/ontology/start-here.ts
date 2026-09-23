// packages/shared-agent-ops/src/ontology/start-here.ts

export const START_HERE_DOCUMENT_TYPE_KEY = 'document.context.project' as const;
export const START_HERE_MANAGED_REGION_VERSION = 1;
export const START_HERE_PROMPT_MAX_CHARS = 2400;
export const START_HERE_CONTEXT_LOAD_MAX_CHARS = 12000;

export const START_HERE_MANAGED_REGION_NAMES = ['status', 'map'] as const;
export type StartHereManagedRegionName = (typeof START_HERE_MANAGED_REGION_NAMES)[number];
export const START_HERE_AUTHORED_SECTION_NAMES = [
	'What this is',
	'Non-goals',
	'Current state',
	'Decisions',
	'Vocabulary and mental model',
	'Open questions'
] as const;
export type StartHereAuthoredSectionName = (typeof START_HERE_AUTHORED_SECTION_NAMES)[number];

export type StartHereTemplateInput = {
	projectName?: string | null;
	projectDescription?: string | null;
};

export type StartHereManagedRegionInput = {
	name: StartHereManagedRegionName;
	content: string;
	version?: number;
};

export type StartHereAuthoredSectionUpdate = {
	section: StartHereAuthoredSectionName;
	markdown: string;
};

export type StartHerePromptExcerpt = {
	content: string;
	truncated: boolean;
	originalChars: number;
	maxChars: number;
};

export type StartHereStatusInput = {
	state?: string | null;
	scale?: string | null;
	stage?: string | null;
	openTasks?: number | null;
	overdueTasks?: number | null;
	nextMilestoneTitle?: string | null;
	nextMilestoneDate?: string | null;
	nextStep?: string | null;
	refreshedAt?: string | null;
};

export type StartHereMapDocument = {
	id: string;
	title?: string | null;
	description?: string | null;
	type_key?: string | null;
};

export type StartHereMapInput = {
	docStructure?: unknown;
	documents?: StartHereMapDocument[];
	maxItems?: number;
};

export type StartHereDocumentCandidate = {
	title?: string | null;
	content?: string | null;
	props?: unknown;
	created_at?: string | null;
	updated_at?: string | null;
};

export type StartHereManagedRegionRange = {
	name: StartHereManagedRegionName;
	from: number;
	to: number;
};

const MANAGED_REGION_PATTERN =
	/<!--\s*managed:([a-z0-9_-]+)\s+v=(\d+)\s*-->\s*([\s\S]*?)\s*<!--\s*\/managed:\1\s*-->/gi;

function normalizeMarkdownLineEndings(value: string): string {
	return value.replace(/\r\n?/g, '\n');
}

function preferredLineEnding(value: string): '\n' | '\r\n' {
	return value.includes('\r\n') ? '\r\n' : '\n';
}

function applyLineEnding(value: string, lineEnding: '\n' | '\r\n'): string {
	if (lineEnding === '\n') return value;
	return value.replace(/\n/g, '\r\n');
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function truncateByChars(value: string, maxChars: number): string {
	if (value.length <= maxChars) return value;
	if (maxChars <= 0) return '';
	return value.slice(0, maxChars).trimEnd();
}

function compactLabel(value: string | null | undefined): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function compactNumber(value: number | null | undefined): number | null {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.max(0, Math.floor(value))
		: null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function timestampMs(value: string | null | undefined): number {
	if (!value) return 0;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

export function buildStartHereTitle(projectName?: string | null): string {
	const name =
		typeof projectName === 'string' && projectName.trim() ? projectName.trim() : 'Project';
	return `START HERE - ${name}`;
}

export function isExplicitStartHereDocument(document: StartHereDocumentCandidate): boolean {
	const props = isPlainObject(document.props) ? document.props : {};
	if (props.origin === 'start_here_template') return true;

	const title = compactLabel(document.title);
	if (title && /^start\s+here\b/i.test(title)) return true;

	const content = compactLabel(document.content);
	return Boolean(content && /^#\s+start\s+here\b/i.test(content));
}

export function pickProjectStartHereDocument<T extends StartHereDocumentCandidate>(
	documents: T[]
): T | null {
	const explicit = documents.filter(isExplicitStartHereDocument);
	const candidates = explicit.length > 0 ? explicit : documents;
	if (candidates.length === 0) return null;

	return (
		[...candidates].sort((left, right) => {
			const rightMs = timestampMs(right.updated_at) || timestampMs(right.created_at);
			const leftMs = timestampMs(left.updated_at) || timestampMs(left.created_at);
			return rightMs - leftMs;
		})[0] ?? null
	);
}

export function renderStartHereManagedRegion(input: StartHereManagedRegionInput): string {
	const version = input.version ?? START_HERE_MANAGED_REGION_VERSION;
	const content = normalizeMarkdownLineEndings(input.content).trim();
	return [
		`<!-- managed:${input.name} v=${version} -->`,
		content,
		`<!-- /managed:${input.name} -->`
	].join('\n');
}

export function buildStartHereTemplate(input: StartHereTemplateInput = {}): string {
	const projectName =
		typeof input.projectName === 'string' && input.projectName.trim()
			? input.projectName.trim()
			: 'Project';
	const description =
		typeof input.projectDescription === 'string' && input.projectDescription.trim()
			? input.projectDescription.trim()
			: null;

	return [
		`# ${buildStartHereTitle(projectName)}`,
		'',
		renderStartHereManagedRegion({
			name: 'status',
			content: [
				'**State:** Unknown',
				'**Now:** No project snapshot has been rendered yet.',
				'**Next step:** Not captured yet.'
			].join('\n')
		}),
		'',
		// Authoring guidance is a single italic-blockquote "capture target" line per
		// section. These are human/agent scaffolding for editing the doc, NOT project
		// context — buildStartHerePromptExcerpt strips them so they never reach the
		// model. Real authored content (or a seeded description) replaces them.
		'## What this is',
		description ??
			'> _Capture target: one paragraph on what this project is and what "done" looks like._',
		'',
		'## Non-goals',
		'> _Capture target: what this project is deliberately not doing, and why._',
		'',
		'## Current state',
		'> _Capture target: what just happened, what is in progress, and what is blocked._',
		'',
		'## Decisions',
		'> _Capture target: settled decisions and one-line rationale, with dates._',
		'',
		'## Vocabulary and mental model',
		'> _Capture target: project-specific terms and how to think about them._',
		'',
		'## Open questions',
		'> _Capture target: live questions the project has not resolved._',
		'',
		renderStartHereManagedRegion({
			name: 'map',
			content: [
				'## Where the detail lives',
				'- No project knowledge map has been rendered yet.',
				'_(Auto-generated from the project knowledge map. Use get_document_outline, then read_document_section to drill in.)_'
			].join('\n')
		})
	].join('\n');
}

export function renderStartHereStatusContent(input: StartHereStatusInput): string {
	const state = compactLabel(input.state) ?? 'Unknown';
	const scale = compactLabel(input.scale);
	const stage = compactLabel(input.stage);
	const openTasks = compactNumber(input.openTasks);
	const overdueTasks = compactNumber(input.overdueTasks);
	const nextStep = compactLabel(input.nextStep) ?? 'Not captured yet.';
	const nextMilestoneTitle = compactLabel(input.nextMilestoneTitle);
	const nextMilestoneDate = compactLabel(input.nextMilestoneDate);

	const stateParts = [
		`**State:** ${state}`,
		scale ? `**Scale:** ${scale}` : null,
		stage ? `**Stage:** ${stage}` : null
	].filter((part): part is string => Boolean(part));

	const nowParts = [
		openTasks !== null ? `${openTasks} open task${openTasks === 1 ? '' : 's'}` : null,
		overdueTasks !== null ? `${overdueTasks} overdue` : null,
		nextMilestoneTitle
			? `next milestone ${nextMilestoneTitle}${nextMilestoneDate ? ` (${nextMilestoneDate})` : ''}`
			: null
	].filter((part): part is string => Boolean(part));

	return [
		stateParts.join(' · '),
		nowParts.length
			? `**Now:** ${nowParts.join(' · ')}`
			: '**Now:** No snapshot summary loaded.',
		`**Next step:** ${nextStep}`,
		compactLabel(input.refreshedAt)
			? `_Last refreshed ${input.refreshedAt} from project snapshot._`
			: null
	]
		.filter((line): line is string => Boolean(line))
		.join('\n');
}

function documentsById(documents: StartHereMapDocument[]): Map<string, StartHereMapDocument> {
	const map = new Map<string, StartHereMapDocument>();
	for (const document of documents) {
		if (document?.id) map.set(document.id, document);
	}
	return map;
}

function asDocStructureNodes(value: unknown): unknown[] {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
	const root = (value as Record<string, unknown>).root;
	return Array.isArray(root) ? root : [];
}

function renderMapNodeLines(params: {
	nodes: unknown[];
	documents: Map<string, StartHereMapDocument>;
	maxItems: number;
}): { lines: string[]; shown: number; total: number } {
	const lines: string[] = [];
	let total = 0;
	let shown = 0;

	const walk = (nodes: unknown[], depth: number): void => {
		for (const node of nodes) {
			if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
			const record = node as Record<string, unknown>;
			const id = typeof record.id === 'string' ? record.id : null;
			if (!id) continue;
			const document = params.documents.get(id);
			if (document?.type_key === START_HERE_DOCUMENT_TYPE_KEY) {
				const children = Array.isArray(record.children) ? record.children : [];
				if (children.length) walk(children, depth);
				continue;
			}

			total += 1;
			if (shown < params.maxItems) {
				const title =
					compactLabel(document?.title) ??
					compactLabel(record.title as string | null | undefined) ??
					'Untitled document';
				const description =
					compactLabel(document?.description) ??
					compactLabel(record.description as string | null | undefined);
				const suffix = description ? ` - ${truncateByChars(description, 100)}` : '';
				lines.push(`${'  '.repeat(depth)}- ${title}${suffix} [id: ${id}]`);
				shown += 1;
			}

			const children = Array.isArray(record.children) ? record.children : [];
			if (children.length) walk(children, depth + 1);
		}
	};

	walk(params.nodes, 0);
	return { lines, shown, total };
}

export function renderStartHereMapContent(input: StartHereMapInput): string {
	const maxItems = Math.max(1, input.maxItems ?? 40);
	const documents = (input.documents ?? []).filter(
		(document) => document.type_key !== START_HERE_DOCUMENT_TYPE_KEY
	);
	const byId = documentsById(input.documents ?? []);
	const nodes = asDocStructureNodes(input.docStructure);
	const fromStructure = renderMapNodeLines({ nodes, documents: byId, maxItems });
	const fallbackDocuments = documents.slice(0, maxItems);
	const lines =
		fromStructure.lines.length > 0
			? fromStructure.lines
			: fallbackDocuments.map((document) => {
					const title = compactLabel(document.title) ?? 'Untitled document';
					const description = compactLabel(document.description);
					return `- ${title}${description ? ` - ${truncateByChars(description, 100)}` : ''} [id: ${document.id}]`;
				});
	const total = fromStructure.total || documents.length;
	const shown = fromStructure.shown || fallbackDocuments.length;
	const omitted = Math.max(0, total - shown);

	return [
		'## Where the detail lives',
		lines.length > 0 ? lines.join('\n') : '- No project documents are available yet.',
		omitted > 0 ? `- ${omitted} more document(s) not shown.` : null,
		'_(Auto-generated from the project knowledge map. Use get_document_outline, then read_document_section to drill in.)_'
	]
		.filter((line): line is string => Boolean(line))
		.join('\n');
}

function managedRegionRegex(name: StartHereManagedRegionName): RegExp {
	const escapedName = escapeRegExp(name);
	return new RegExp(
		`<!--\\s*managed:${escapedName}\\s+v=\\d+\\s*-->\\s*[\\s\\S]*?\\s*<!--\\s*\\/managed:${escapedName}\\s*-->`,
		'i'
	);
}

function sectionHeadingRegex(section: string): RegExp {
	return new RegExp(`^##\\s+${escapeRegExp(section)}\\s*$`, 'im');
}

function findSectionBounds(
	body: string,
	section: StartHereAuthoredSectionName
): {
	start: number;
	end: number;
} | null {
	const match = sectionHeadingRegex(section).exec(body);
	if (!match || match.index === undefined) return null;
	return sectionBoundsAfterHeading(body, match.index + match[0].length);
}

function sectionBoundsAfterHeading(
	body: string,
	headingEnd: number
): {
	start: number;
	end: number;
} {
	const rest = body.slice(headingEnd);
	const nextHeadingMatch = /^##\s+.+$/im.exec(rest);
	// A managed-region fence also terminates an authored section. Authored content
	// must never be appended inside a machine-owned managed block: it would be
	// silently wiped on the next deterministic merge (and wrongly counted as
	// "managed" by the recency guard). The last authored section ("Open questions")
	// is immediately followed by the managed:map region, whose body opens with a
	// "## Where the detail lives" heading — so without this guard, appends to the
	// final authored section land inside the fence.
	const nextManagedMatch = /<!--\s*managed:[a-z0-9_-]+\s+v=\d+\s*-->/i.exec(rest);
	const candidateOffsets = [nextHeadingMatch?.index, nextManagedMatch?.index].filter(
		(index): index is number => typeof index === 'number'
	);
	const end =
		candidateOffsets.length > 0 ? headingEnd + Math.min(...candidateOffsets) : body.length;
	return { start: headingEnd, end };
}

function appendToAuthoredSection(
	body: string,
	section: StartHereAuthoredSectionName,
	markdown: string
): string {
	const trimmed = normalizeMarkdownLineEndings(markdown).trim();
	if (!trimmed) return body;
	const bounds = findSectionBounds(body, section);
	if (!bounds) {
		return [body.trimEnd(), `## ${section}`, trimmed].join('\n\n');
	}

	const before = body.slice(0, bounds.end).trimEnd();
	const after = body.slice(bounds.end).trimStart();
	return [before, trimmed, after].filter(Boolean).join('\n\n');
}

/**
 * Sanitize authored markdown before it is appended into a Start Here document.
 * Authored content is often model output (session-end capture); neutralize two
 * structural hazards so it cannot corrupt the document's machinery:
 * - HTML comments — especially `<!-- managed:* -->` fences — would break the
 *   managed/authored boundary used by merge, strip, and the recency-guard trigger.
 * - Markdown headings would create phantom sections that break authored-section
 *   boundary detection on later appends/merges. Demote to bold so the text survives.
 */
export function sanitizeStartHereAuthoredMarkdown(value: string): string {
	return normalizeMarkdownLineEndings(value)
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/^\s{0,3}#{1,6}\s+(.*)$/gm, '**$1**')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export function appendStartHereAuthoredSectionUpdates(
	currentBody: string,
	updates: StartHereAuthoredSectionUpdate[]
): string {
	const lineEnding = preferredLineEnding(currentBody);
	let nextBody = normalizeMarkdownLineEndings(currentBody);
	for (const update of updates) {
		if (!START_HERE_AUTHORED_SECTION_NAMES.includes(update.section)) continue;
		nextBody = appendToAuthoredSection(nextBody, update.section, update.markdown);
	}
	const finalBody = applyLineEnding(nextBody, lineEnding);
	return finalBody === currentBody ? currentBody : finalBody;
}

// ---------------------------------------------------------------------------
// Section reconciliation (tasker/93). Session-end capture used to append
// snippets, so every chat re-derived the same facts in new words and the doc
// grew contradictions. Capture now returns each changed section's COMPLETE new
// body; these helpers swap bodies in place and apply deterministic guards the
// model cannot bypass (never wipe a section, no invented dates, no repeated
// decision/term bullets, bounded length).
// ---------------------------------------------------------------------------

export type StartHereAuthoredSections = Partial<Record<StartHereAuthoredSectionName, string>>;

export const START_HERE_SECTION_MAX_CHARS: Record<StartHereAuthoredSectionName, number> = {
	'What this is': 1600,
	'Non-goals': 2000,
	'Current state': 1600,
	Decisions: 4000,
	'Vocabulary and mental model': 3000,
	'Open questions': 2000
};

const START_HERE_LIST_SECTIONS = new Set<StartHereAuthoredSectionName>([
	'Non-goals',
	'Decisions',
	'Vocabulary and mental model',
	'Open questions'
]);

type SectionOccurrence = { headingStart: number; start: number; end: number };

function isInsideRanges(index: number, ranges: StartHereManagedRegionRange[]): boolean {
	return ranges.some((range) => index >= range.from && index < range.to);
}

/** Every `## <section>` occurrence outside managed fences, in document order. */
function findAllSectionOccurrences(
	body: string,
	section: StartHereAuthoredSectionName
): SectionOccurrence[] {
	const managedRanges = findStartHereManagedRegionRanges(body);
	const occurrences: SectionOccurrence[] = [];
	const headingPattern = new RegExp(`^##\\s+${escapeRegExp(section)}\\s*$`, 'gim');
	for (const match of body.matchAll(headingPattern)) {
		if (match.index === undefined || isInsideRanges(match.index, managedRanges)) continue;
		const bounds = sectionBoundsAfterHeading(body, match.index + match[0].length);
		occurrences.push({ headingStart: match.index, ...bounds });
	}
	return occurrences;
}

function joinMarkdownBlocks(...blocks: string[]): string {
	return blocks
		.map((block, index) =>
			index === 0
				? block.trimEnd()
				: index === blocks.length - 1
					? block.trimStart()
					: block.trim()
		)
		.filter(Boolean)
		.join('\n\n');
}

/**
 * Current body of each authored section, keyed by name. A section whose heading
 * appears more than once (legacy append damage) returns every occurrence's body
 * joined, so a full-section rewrite sees — and then replaces — all of it.
 */
export function readStartHereAuthoredSections(body: string): StartHereAuthoredSections {
	const normalized = normalizeMarkdownLineEndings(body);
	const sections: StartHereAuthoredSections = {};
	for (const section of START_HERE_AUTHORED_SECTION_NAMES) {
		const occurrences = findAllSectionOccurrences(normalized, section);
		if (occurrences.length === 0) continue;
		sections[section] = occurrences
			.map((occurrence) => normalized.slice(occurrence.start, occurrence.end).trim())
			.filter(Boolean)
			.join('\n\n');
	}
	return sections;
}

/**
 * The document minus managed regions and the six authored sections: the
 * creation preamble, custom `##` sections, and the H1 title. Capture shows it to
 * the model read-only so a contradiction there can be flagged, never edited.
 */
export function stripStartHereAuthoredSections(body: string): string {
	let next = stripStartHereManagedRegions(body);
	for (const section of START_HERE_AUTHORED_SECTION_NAMES) {
		for (const occurrence of findAllSectionOccurrences(next, section).reverse()) {
			next = joinMarkdownBlocks(
				next.slice(0, occurrence.headingStart),
				next.slice(occurrence.end)
			);
		}
	}
	return next.trim();
}

/** Authoring scaffolding ("> _Capture target: ..._", legacy backfill lines) removed. */
export function stripStartHereScaffolding(value: string): string {
	return stripPromptNoiseLines(value);
}

function insertAuthoredSection(
	body: string,
	section: StartHereAuthoredSectionName,
	markdown: string
): string {
	const block = `## ${section}\n\n${markdown}`;
	const order = START_HERE_AUTHORED_SECTION_NAMES.indexOf(section);
	// Keep canonical order: before the next authored section that exists...
	for (const later of START_HERE_AUTHORED_SECTION_NAMES.slice(order + 1)) {
		const next = findAllSectionOccurrences(body, later)[0];
		if (next) {
			return joinMarkdownBlocks(
				body.slice(0, next.headingStart),
				block,
				body.slice(next.headingStart)
			);
		}
	}
	// ...else after the last earlier authored section that exists...
	for (const earlier of START_HERE_AUTHORED_SECTION_NAMES.slice(0, order).reverse()) {
		const occurrences = findAllSectionOccurrences(body, earlier);
		const previous = occurrences[occurrences.length - 1];
		if (previous) {
			return joinMarkdownBlocks(body.slice(0, previous.end), block, body.slice(previous.end));
		}
	}
	// ...else before the managed map fence, never inside it.
	const mapRange = findStartHereManagedRegionRanges(body).find((range) => range.name === 'map');
	if (mapRange) {
		return joinMarkdownBlocks(body.slice(0, mapRange.from), block, body.slice(mapRange.from));
	}
	return joinMarkdownBlocks(body, block);
}

function replaceAuthoredSection(
	body: string,
	section: StartHereAuthoredSectionName,
	markdown: string
): string {
	const occurrences = findAllSectionOccurrences(body, section);
	const [first, ...duplicates] = occurrences;
	if (!first) return insertAuthoredSection(body, section, markdown);

	let next = body;
	// Duplicate headings come after the first; removing them back to front keeps
	// the first occurrence's offsets valid. Their text was part of what the
	// rewrite read, so the new body supersedes it.
	for (const duplicate of duplicates.reverse()) {
		next = joinMarkdownBlocks(next.slice(0, duplicate.headingStart), next.slice(duplicate.end));
	}
	return joinMarkdownBlocks(next.slice(0, first.start), markdown, next.slice(first.end));
}

/**
 * Replace the named authored sections' bodies wholesale. Managed fences, the
 * preamble, and sections not named in `updates` are untouched. An update whose
 * sanitized markdown is empty is ignored: a rewrite can never delete a section.
 */
export function replaceStartHereAuthoredSections(
	currentBody: string,
	updates: StartHereAuthoredSectionUpdate[]
): string {
	const lineEnding = preferredLineEnding(currentBody);
	let nextBody = normalizeMarkdownLineEndings(currentBody);
	for (const update of updates) {
		if (!START_HERE_AUTHORED_SECTION_NAMES.includes(update.section)) continue;
		const markdown = sanitizeStartHereAuthoredMarkdown(update.markdown);
		if (!markdown) continue;
		nextBody = replaceAuthoredSection(nextBody, update.section, markdown);
	}
	const finalBody = applyLineEnding(nextBody, lineEnding);
	return finalBody === currentBody ? currentBody : finalBody;
}

export type StartHereDateStampPolicy = {
	/** The user's civil date today (YYYY-MM-DD). */
	today: string;
	/** No stamp may predate this civil date (the project's creation day). */
	earliest?: string | null;
	/** Further dates a stamp may carry, e.g. the civil dates of chat messages. */
	allowed?: Iterable<string>;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_STAMP_PATTERN = /[ \t]*[_*]\(\s*(\d{4}-\d{2}-\d{2}|YYYY-MM-DD)\s*\)[_*]/gi;
const DATE_PLACEHOLDER_PATTERN = /\bYYYY-MM-DD\b/gi;
const PLACEHOLDER_STAMP_PATTERN = /[ \t]*[_*]\(\s*YYYY-MM-DD\s*\)[_*]/gi;

function collectDateStamps(markdown: string): string[] {
	return [...markdown.matchAll(DATE_STAMP_PATTERN)]
		.map((match) => match[1] ?? '')
		.filter((date) => ISO_DATE_PATTERN.test(date));
}

/**
 * Code owns the `_(YYYY-MM-DD)_` decision stamps. A stamp survives only when it
 * falls between the project's creation day and today AND is today, an allowed
 * date (a chat message's day), or already recorded. The literal placeholder
 * becomes today; any other stamp — a model-guessed date — is dropped, since no
 * date is more honest than a wrong one.
 */
export function normalizeStartHereDateStamps(
	markdown: string,
	policy: StartHereDateStampPolicy
): string {
	const inRange = (date: string) =>
		ISO_DATE_PATTERN.test(date) &&
		date <= policy.today &&
		(!policy.earliest || date >= policy.earliest);
	const allowed = new Set([policy.today, ...(policy.allowed ?? [])].filter(inRange));
	return markdown
		.replace(DATE_STAMP_PATTERN, (stamp, date: string) => {
			if (/^YYYY-MM-DD$/i.test(date)) return ` _(${policy.today})_`;
			return allowed.has(date) ? stamp : '';
		})
		.replace(DATE_PLACEHOLDER_PATTERN, policy.today)
		.replace(/[ \t]+$/gm, '');
}

const BULLET_KEY_STOPWORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'at',
	'be',
	'by',
	'for',
	'in',
	'is',
	'of',
	'on',
	'the',
	'to',
	'with'
]);
const BULLET_KEY_SUFFIXES: Array<[string, string]> = [
	['ility', 'il'],
	['ies', 'y'],
	['ity', ''],
	['ness', ''],
	['ing', ''],
	['ed', ''],
	['es', ''],
	['s', ''],
	['e', '']
];

function stemBulletKeyToken(token: string): string {
	for (const [suffix, replacement] of BULLET_KEY_SUFFIXES) {
		if (token.length > suffix.length + 2 && token.endsWith(suffix)) {
			return token.slice(0, -suffix.length) + replacement;
		}
	}
	return token;
}

/**
 * Identity of a bullet: its bold title (or, untitled, its text) reduced to a
 * sorted set of stemmed content words, so "Book Contract locked in" and
 * "**Book Contract locked**" collide while different decisions do not.
 */
function bulletKey(text: string): string | null {
	const withoutStamps = text.replace(DATE_STAMP_PATTERN, '');
	const bold = /^\s{0,3}[-*+]\s+\*\*(.+?)\*\*/.exec(withoutStamps);
	const source = bold?.[1] ?? withoutStamps.replace(/^\s{0,3}[-*+]\s+/, '');
	const tokens = source
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.split(' ')
		.filter((token) => token && !BULLET_KEY_STOPWORDS.has(token))
		.map(stemBulletKeyToken);
	return tokens.length > 0 ? [...new Set(tokens)].sort().join(' ') : null;
}

// Top-level only: a 2+ space indent is a nested item that belongs to its parent.
const TOP_LEVEL_BULLET_PATTERN = /^ ?[-*+]\s+/;

type MarkdownBlock = { bullet: boolean; lines: string[] };

/** Top-level bullets (with their continuation lines) and paragraphs, in order. */
function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
	const blocks: MarkdownBlock[] = [];
	let current: MarkdownBlock | null = null;
	let afterBlank = false;
	for (const line of normalizeMarkdownLineEndings(markdown).split('\n')) {
		if (!line.trim()) {
			afterBlank = true;
			continue;
		}
		if (TOP_LEVEL_BULLET_PATTERN.test(line)) {
			current = { bullet: true, lines: [line] };
			blocks.push(current);
		} else if (current && (!afterBlank || (current.bullet && /^\s{2,}/.test(line)))) {
			current.lines.push(line);
		} else {
			current = { bullet: false, lines: [line] };
			blocks.push(current);
		}
		afterBlank = false;
	}
	return blocks;
}

/** Bullets as a tight list; paragraphs separated by one blank line. */
function renderMarkdownBlocks(blocks: MarkdownBlock[]): string {
	let output = '';
	blocks.forEach((block, index) => {
		const text = block.lines.join('\n');
		if (index === 0) output = text;
		else output += (block.bullet && blocks[index - 1]?.bullet ? '\n' : '\n\n') + text;
	});
	return output;
}

function isStruckBullet(block: MarkdownBlock): boolean {
	return /^\s{0,3}[-*+]\s+~~/.test(block.lines[0] ?? '');
}

/**
 * Collapse bullets that restate the same decision/term/question. The LAST
 * occurrence wins (newest wording). Struck-through bullets (`- ~~...~~`) are
 * intentional history and never collapse. Bullets are re-emitted as a tight list.
 */
export function dedupeStartHereBulletList(markdown: string): string {
	const seen = new Set<string>();
	const kept: MarkdownBlock[] = [];
	for (const block of parseMarkdownBlocks(markdown).reverse()) {
		const key =
			block.bullet && !isStruckBullet(block) ? bulletKey(block.lines.join(' ')) : null;
		if (key) {
			if (seen.has(key)) continue;
			seen.add(key);
		}
		kept.unshift(block);
	}
	return renderMarkdownBlocks(kept);
}

/**
 * A `_(YYYY-MM-DD)_` placeholder already in the document marks an old record
 * whose real date was never captured. When the rewrite carries that bullet
 * forward, drop the placeholder instead of letting it become today.
 */
function dropCarriedPlaceholderStamps(markdown: string, currentSection: string): string {
	const carriedKeys = new Set(
		parseMarkdownBlocks(currentSection)
			.filter((block) => block.bullet && /\bYYYY-MM-DD\b/i.test(block.lines.join(' ')))
			.map((block) => bulletKey(block.lines.join(' ')))
			.filter((key): key is string => Boolean(key))
	);
	if (carriedKeys.size === 0) return markdown;
	const blocks = parseMarkdownBlocks(markdown);
	for (const block of blocks) {
		const key = block.bullet ? bulletKey(block.lines.join(' ')) : null;
		if (key && carriedKeys.has(key)) {
			block.lines = block.lines.map((line) => line.replace(PLACEHOLDER_STAMP_PATTERN, ''));
		}
	}
	return renderMarkdownBlocks(blocks);
}

export type StartHereReconcileSkipReason = 'empty' | 'too_long' | 'unchanged' | 'locked';

export type StartHereReconcileResult = {
	body: string;
	applied: StartHereAuthoredSectionUpdate[];
	skipped: Array<{ section: StartHereAuthoredSectionName; reason: StartHereReconcileSkipReason }>;
};

function comparableSectionText(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

/**
 * Apply full-section rewrites (model output) to a Start Here body behind
 * deterministic guards. Per section, first answer wins; `lockedSections` (e.g.
 * sections too long to show the model in full) are never rewritten.
 */
export function reconcileStartHereAuthoredSections(params: {
	currentBody: string;
	rewrites: StartHereAuthoredSectionUpdate[];
	dates: StartHereDateStampPolicy;
	lockedSections?: Iterable<StartHereAuthoredSectionName>;
}): StartHereReconcileResult {
	const current = readStartHereAuthoredSections(params.currentBody);
	const locked = new Set(params.lockedSections ?? []);
	const seen = new Set<StartHereAuthoredSectionName>();
	const applied: StartHereAuthoredSectionUpdate[] = [];
	const skipped: StartHereReconcileResult['skipped'] = [];

	for (const rewrite of params.rewrites) {
		const section = rewrite.section;
		if (!START_HERE_AUTHORED_SECTION_NAMES.includes(section) || seen.has(section)) continue;
		seen.add(section);
		if (locked.has(section)) {
			skipped.push({ section, reason: 'locked' });
			continue;
		}

		const currentText = stripStartHereScaffolding(current[section] ?? '');
		let markdown = stripStartHereScaffolding(
			sanitizeStartHereAuthoredMarkdown(rewrite.markdown)
		);
		markdown = dropCarriedPlaceholderStamps(markdown, currentText);
		markdown = normalizeStartHereDateStamps(markdown, {
			...params.dates,
			allowed: [...(params.dates.allowed ?? []), ...collectDateStamps(currentText)]
		});
		if (START_HERE_LIST_SECTIONS.has(section)) markdown = dedupeStartHereBulletList(markdown);
		markdown = markdown.trim();

		if (!markdown) {
			skipped.push({ section, reason: 'empty' });
			continue;
		}
		if (markdown.length > Math.max(START_HERE_SECTION_MAX_CHARS[section], currentText.length)) {
			skipped.push({ section, reason: 'too_long' });
			continue;
		}
		if (comparableSectionText(markdown) === comparableSectionText(currentText)) {
			skipped.push({ section, reason: 'unchanged' });
			continue;
		}
		applied.push({ section, markdown });
	}

	return {
		body: replaceStartHereAuthoredSections(params.currentBody, applied),
		applied,
		skipped
	};
}

// ---------------------------------------------------------------------------
// Checkpoint capture over the document's REAL sections (tasker/95). About half
// of START HERE docs carry custom `##` headings ("What this book is"), and a
// capture that only knows the six standard names inserts a twin section. These
// helpers address sections by their actual heading. They split a model's
// full-section rewrite into what applies now (additions, and the Current state
// snapshot) and what needs review (removed or reworded blocks), and they check
// the structural invariants before anything is written.
// ---------------------------------------------------------------------------

export type StartHereDocumentSection = {
	heading: string;
	body: string;
	standard: StartHereAuthoredSectionName | null;
};

export type StartHereSectionBody = { heading: string; markdown: string };

type HeadingOccurrence = SectionOccurrence & { heading: string };

function headingKey(heading: string): string {
	return heading.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** The standard section a heading names, matched case- and space-insensitively. */
export function standardStartHereSectionName(heading: string): StartHereAuthoredSectionName | null {
	const key = headingKey(heading);
	return START_HERE_AUTHORED_SECTION_NAMES.find((name) => headingKey(name) === key) ?? null;
}

/** Every `## heading` outside managed fences, in document order. */
function findAllHeadingOccurrences(body: string): HeadingOccurrence[] {
	const managedRanges = findStartHereManagedRegionRanges(body);
	const occurrences: HeadingOccurrence[] = [];
	for (const match of body.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)) {
		if (match.index === undefined || isInsideRanges(match.index, managedRanges)) continue;
		const bounds = sectionBoundsAfterHeading(body, match.index + match[0].length);
		occurrences.push({
			heading: (match[1] ?? '').trim(),
			headingStart: match.index,
			...bounds
		});
	}
	return occurrences;
}

/**
 * The authored sections under their real headings, in document order. A heading
 * that repeats (legacy damage) is reported once with every occurrence's body
 * joined, so a rewrite sees all of it.
 */
export function readStartHereDocumentSections(content: string): StartHereDocumentSection[] {
	const body = normalizeMarkdownLineEndings(content);
	const byKey = new Map<string, StartHereDocumentSection>();
	for (const occurrence of findAllHeadingOccurrences(body)) {
		const text = body.slice(occurrence.start, occurrence.end).trim();
		const existing = byKey.get(headingKey(occurrence.heading));
		if (existing) {
			existing.body = [existing.body, text].filter(Boolean).join('\n\n');
			continue;
		}
		byKey.set(headingKey(occurrence.heading), {
			heading: occurrence.heading,
			body: text,
			standard: standardStartHereSectionName(occurrence.heading)
		});
	}
	return [...byKey.values()];
}

/**
 * Section-body sanitizer. HTML comments could forge managed fences and `#`/`##`
 * headings would split the section, so both are neutralized; `###` and deeper
 * subheadings are ordinary section content and stay.
 */
export function sanitizeStartHereSectionMarkdown(value: string): string {
	return normalizeMarkdownLineEndings(value)
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/^[ \t]{0,3}#{1,2}[ \t]+(.*)$/gm, '**$1**')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/**
 * Replace section bodies by heading (case-insensitive). A repeated heading
 * collapses into its first occurrence. A heading the document lacks is added
 * only when it is a standard section name: in canonical order, never inside a
 * managed fence. Managed fences and untouched sections keep their bytes.
 */
export function applyStartHereSectionBodies(
	content: string,
	updates: StartHereSectionBody[]
): string {
	const lineEnding = preferredLineEnding(content);
	let next = normalizeMarkdownLineEndings(content);
	for (const update of updates) {
		const markdown = sanitizeStartHereSectionMarkdown(update.markdown);
		if (!markdown) continue;
		const key = headingKey(update.heading);
		const [first, ...duplicates] = findAllHeadingOccurrences(next).filter(
			(occurrence) => headingKey(occurrence.heading) === key
		);
		if (!first) {
			const standard = standardStartHereSectionName(update.heading);
			if (standard) next = insertAuthoredSection(next, standard, markdown);
			continue;
		}
		for (const duplicate of duplicates.reverse()) {
			next = joinMarkdownBlocks(
				next.slice(0, duplicate.headingStart),
				next.slice(duplicate.end)
			);
		}
		// Keep the section's own spacing around its body (a doc that puts the body
		// right under the heading stays that way), so a capture's version diff shows
		// only the lines that changed.
		const region = next.slice(first.start, first.end);
		const lead = region.slice(0, region.length - region.trimStart().length);
		const trail = region.slice(region.trimEnd().length);
		next =
			region.trim() &&
			lead.includes('\n') &&
			(trail.includes('\n') || first.end === next.length)
				? `${next.slice(0, first.start)}${lead}${markdown}${trail}${next.slice(first.end)}`
				: joinMarkdownBlocks(next.slice(0, first.start), markdown, next.slice(first.end));
	}
	const finalBody = applyLineEnding(next, lineEnding);
	return finalBody === content ? content : finalBody;
}

/** A section body as top-level blocks: each bullet with its continuation lines, or a paragraph. */
export function splitStartHereSectionBlocks(body: string): string[] {
	return parseMarkdownBlocks(body).map((block) => block.lines.join('\n'));
}

/** Blocks back into a section body: bullets as a tight list, paragraphs a blank line apart. */
export function joinStartHereSectionBlocks(blocks: string[]): string {
	return renderMarkdownBlocks(blocks.flatMap((block) => parseMarkdownBlocks(block)));
}

/**
 * Identity of a block for "was this line kept?": date stamps, bullet markers,
 * quote/dash styles and whitespace do not count as a change.
 */
function blockIdentity(block: MarkdownBlock): string {
	return block.lines
		.join('\n')
		.replace(DATE_STAMP_PATTERN, '')
		.replace(/^(\s*)[-*+](\s+)/gm, '$1-$2')
		.replace(/[‘’]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/\s*[–—]\s*|\s+-\s+/g, ' - ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Drop any stamp the model wrote and, when given, stamp the capture date. */
function restampBlock(block: MarkdownBlock, date: string | null): MarkdownBlock {
	const lines = block.lines.map((line) =>
		line.replace(DATE_STAMP_PATTERN, '').replace(/[ \t]+$/, '')
	);
	if (date && block.bullet) {
		const last = lines.length - 1;
		lines[last] = `${lines[last]} _(${date})_`;
	}
	return { bullet: block.bullet, lines };
}

export type StartHereSectionChangeKind =
	| 'added_section'
	| 'additive'
	| 'snapshot'
	| 'mixed'
	| 'replacement';

export type StartHereSectionPlan = {
	heading: string;
	kind: StartHereSectionChangeKind;
	/** Body to apply now; null when nothing in this section applies automatically. */
	autoMarkdown: string | null;
	/** Complete rewrite to review; null when the automatic part already covers it. */
	reviewMarkdown: string | null;
	addedBlocks: string[];
	removedBlocks: string[];
};

export type StartHereCheckpointSkipReason =
	| 'unknown_heading'
	| 'duplicate'
	| 'locked'
	| 'empty'
	| 'too_long'
	| 'unchanged';

export type StartHereCheckpointPlan = {
	plans: StartHereSectionPlan[];
	skipped: Array<{ heading: string; reason: StartHereCheckpointSkipReason }>;
};

const START_HERE_CUSTOM_SECTION_MAX_CHARS = 4000;

/**
 * Split full-section rewrites into automatic and reviewed parts.
 *
 * - A block the rewrite keeps (same text, ignoring stamps and punctuation
 *   style) stays byte-for-byte as it is in the document.
 * - A section with nothing removed or reworded applies automatically, and so
 *   does a missing standard section and every snapshot section (Current state).
 * - Otherwise the whole rewrite goes to review, while its brand-new bullets
 *   (no matching bold title in the document) still apply now.
 * - Decision bullets that are new or reworded carry the capture date; a date
 *   the model wrote is always dropped.
 */
export function planStartHereCheckpointRewrites(params: {
	content: string;
	rewrites: StartHereSectionBody[];
	today: string;
	lockedHeadings?: Iterable<string>;
	snapshotHeadings?: Iterable<string>;
}): StartHereCheckpointPlan {
	const sections = new Map(
		readStartHereDocumentSections(params.content).map((section) => [
			headingKey(section.heading),
			section
		])
	);
	const locked = new Set([...(params.lockedHeadings ?? [])].map(headingKey));
	const snapshots = new Set([...(params.snapshotHeadings ?? ['Current state'])].map(headingKey));
	const hasCustomHeadings = [...sections.values()].some((section) => !section.standard);
	const seen = new Set<string>();
	const result: StartHereCheckpointPlan = { plans: [], skipped: [] };
	const skip = (heading: string, reason: StartHereCheckpointSkipReason) =>
		result.skipped.push({ heading, reason });

	for (const rewrite of params.rewrites) {
		const key = headingKey(rewrite.heading);
		const current = sections.get(key) ?? null;
		const standard = standardStartHereSectionName(rewrite.heading);
		const heading = current?.heading ?? standard ?? rewrite.heading.trim();
		if (seen.has(key)) {
			skip(heading, 'duplicate');
			continue;
		}
		seen.add(key);
		if (!current && !standard) {
			skip(heading, 'unknown_heading');
			continue;
		}
		if (locked.has(key)) {
			skip(heading, 'locked');
			continue;
		}
		const markdown = stripStartHereScaffolding(
			sanitizeStartHereSectionMarkdown(rewrite.markdown)
		);
		if (!markdown) {
			skip(heading, 'empty');
			continue;
		}

		const currentText = stripStartHereScaffolding(current?.body ?? '');
		const oldBlocks = parseMarkdownBlocks(currentText);
		const newBlocks = parseMarkdownBlocks(markdown);
		const oldIds = oldBlocks.map(blockIdentity);
		const oldKeys = oldBlocks.map((block) =>
			block.bullet ? bulletKey(block.lines.join(' ')) : null
		);
		const stampDate = headingKey(heading) === 'decisions' ? params.today : null;

		const kept = new Set<number>();
		const reworded = new Set<number>();
		// Each new block, resolved: kept old text, a fresh block, or dropped.
		const resolved: Array<{ block: MarkdownBlock; oldIndex: number | null; fresh: boolean }> =
			[];
		const keysOfKept = new Set<string>();
		newBlocks.forEach((block) => {
			const identity = blockIdentity(block);
			const oldIndex = oldIds.findIndex((id, index) => id === identity && !kept.has(index));
			if (oldIndex >= 0) {
				kept.add(oldIndex);
				const oldKey = oldKeys[oldIndex];
				if (oldKey) keysOfKept.add(oldKey);
				resolved.push({ block: oldBlocks[oldIndex]!, oldIndex, fresh: false });
				return;
			}
			if (oldIds.includes(identity)) return; // a kept line written twice
			resolved.push({ block, oldIndex: null, fresh: true });
		});
		const fresh = resolved.filter((entry) => entry.fresh);
		const restated = new Set<(typeof resolved)[number]>();
		for (const entry of fresh) {
			const key = entry.block.bullet ? bulletKey(entry.block.lines.join(' ')) : null;
			if (!key) continue;
			if (keysOfKept.has(key)) {
				restated.add(entry); // a kept decision/term said again in new words
				continue;
			}
			const pairedOld = oldKeys.findIndex(
				(oldKey, index) => oldKey === key && !kept.has(index)
			);
			if (pairedOld >= 0) reworded.add(pairedOld);
		}
		const reviewEntries = resolved
			.filter((entry) => !restated.has(entry))
			.map((entry) =>
				entry.fresh ? { ...entry, block: restampBlock(entry.block, stampDate) } : entry
			);
		const reviewText = renderMarkdownBlocks(reviewEntries.map((entry) => entry.block));
		const removedIndexes = oldBlocks
			.map((_, index) => index)
			.filter((index) => !kept.has(index));
		const addedEntries = reviewEntries.filter((entry) => entry.fresh);

		let kind: StartHereSectionChangeKind;
		let autoText: string | null;
		let reviewTextOrNull: string | null = null;
		if (!current) {
			// In a doc with its own headings, a new standard section may duplicate
			// a custom one ("What this is" beside "What this book is"), so the
			// structural change waits for review there.
			kind = 'added_section';
			autoText = hasCustomHeadings ? null : reviewText;
			reviewTextOrNull = hasCustomHeadings ? reviewText : null;
		} else if (snapshots.has(key)) {
			kind = 'snapshot';
			autoText = reviewText;
		} else {
			// Fresh bullets that pair with no old bullet are safe to add now; when
			// lines were removed, fresh paragraphs may be rewrites of them and wait
			// for review with the rest.
			const hasRemovals = removedIndexes.length > 0;
			const autoAdditions = addedEntries.filter((entry) => {
				if (!hasRemovals) return true;
				if (!entry.block.bullet) return false;
				const key = bulletKey(entry.block.lines.join(' '));
				return !key || !oldKeys.includes(key);
			});
			const anchored = anchorAdditions(reviewEntries, autoAdditions);
			autoText =
				anchored.length > 0
					? renderMarkdownBlocks(insertAdditions(oldBlocks, anchored))
					: null;
			if (hasRemovals) {
				kind = autoAdditions.length > 0 ? 'mixed' : 'replacement';
				reviewTextOrNull = reviewText;
			} else {
				kind = 'additive';
			}
		}

		if (
			autoText !== null &&
			comparableSectionText(autoText) === comparableSectionText(currentText)
		) {
			autoText = null;
		}
		if (
			reviewTextOrNull !== null &&
			comparableSectionText(reviewTextOrNull) ===
				comparableSectionText(autoText ?? currentText)
		) {
			reviewTextOrNull = null;
		}
		if (autoText === null && reviewTextOrNull === null) {
			skip(heading, 'unchanged');
			continue;
		}
		const maxChars = Math.max(
			standard ? START_HERE_SECTION_MAX_CHARS[standard] : START_HERE_CUSTOM_SECTION_MAX_CHARS,
			currentText.length
		);
		if ((autoText?.length ?? 0) > maxChars) {
			skip(heading, 'too_long');
			continue;
		}
		if ((reviewTextOrNull?.length ?? 0) > maxChars) reviewTextOrNull = null;
		if (autoText === null && reviewTextOrNull === null) {
			skip(heading, 'too_long');
			continue;
		}

		result.plans.push({
			heading,
			kind,
			autoMarkdown: autoText,
			reviewMarkdown: reviewTextOrNull,
			addedBlocks: addedEntries.map((entry) => entry.block.lines.join('\n')),
			removedBlocks: [...new Set([...removedIndexes, ...reworded])].map((index) =>
				oldBlocks[index]!.lines.join('\n')
			)
		});
	}
	return result;
}

type AnchoredAddition = { block: MarkdownBlock; anchor: number | null };

/** Each addition, anchored to the kept block that precedes it in the rewrite. */
function anchorAdditions(
	rewrite: Array<{ block: MarkdownBlock; oldIndex: number | null; fresh: boolean }>,
	additions: Array<{ block: MarkdownBlock; oldIndex: number | null; fresh: boolean }>
): AnchoredAddition[] {
	const include = new Set(additions);
	const anchored: AnchoredAddition[] = [];
	let anchor: number | null = null;
	for (const entry of rewrite) {
		if (!entry.fresh) anchor = entry.oldIndex;
		else if (include.has(entry)) anchored.push({ block: entry.block, anchor });
	}
	return anchored;
}

/** The existing blocks in their order, each addition after its anchor. Existing text never moves. */
function insertAdditions(
	oldBlocks: MarkdownBlock[],
	additions: AnchoredAddition[]
): MarkdownBlock[] {
	const leading = additions.filter((addition) => addition.anchor === null).map((a) => a.block);
	return [
		...leading,
		...oldBlocks.flatMap((block, index) => [
			block,
			...additions.filter((addition) => addition.anchor === index).map((a) => a.block)
		])
	];
}

export type StartHereInvariantViolation =
	| 'managed_regions_changed'
	| 'duplicate_heading'
	| 'section_removed';

function headingCounts(content: string): Map<string, number> {
	const counts = new Map<string, number>();
	for (const occurrence of findAllHeadingOccurrences(normalizeMarkdownLineEndings(content))) {
		const key = headingKey(occurrence.heading);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

/**
 * Structural invariants for a capture write. Managed fences must survive
 * byte-for-byte, no heading may appear more often than it already did (and
 * never twice when it was new), and no section may disappear.
 */
export function checkStartHereCaptureInvariants(
	before: string,
	after: string
): StartHereInvariantViolation[] {
	const violations: StartHereInvariantViolation[] = [];
	const fences = (body: string) =>
		findStartHereManagedRegionRanges(body).map((range) => body.slice(range.from, range.to));
	const beforeFences = fences(before);
	const afterFences = fences(after);
	if (
		beforeFences.length !== afterFences.length ||
		beforeFences.some((fence, index) => fence !== afterFences[index])
	) {
		violations.push('managed_regions_changed');
	}
	const beforeCounts = headingCounts(before);
	const afterCounts = headingCounts(after);
	for (const [key, count] of afterCounts) {
		if (count > 1 && count > (beforeCounts.get(key) ?? 0)) {
			violations.push('duplicate_heading');
			break;
		}
	}
	for (const key of beforeCounts.keys()) {
		if (!afterCounts.has(key)) {
			violations.push('section_removed');
			break;
		}
	}
	return violations;
}

function insertStatusRegion(body: string, block: string): string {
	const headingMatch = body.match(/^# .+$/m);
	if (!headingMatch || headingMatch.index === undefined) {
		return [block, body.trimStart()].filter(Boolean).join('\n\n');
	}

	const headingEnd = headingMatch.index + headingMatch[0].length;
	const before = body.slice(0, headingEnd);
	const after = body.slice(headingEnd).trimStart();
	return [before, block, after].filter(Boolean).join('\n\n');
}

function insertMapRegion(body: string, block: string): string {
	return [body.trimEnd(), block].filter(Boolean).join('\n\n');
}

function insertManagedRegion(
	body: string,
	name: StartHereManagedRegionName,
	block: string
): string {
	switch (name) {
		case 'status':
			return insertStatusRegion(body, block);
		case 'map':
			return insertMapRegion(body, block);
		default:
			return insertMapRegion(body, block);
	}
}

export function mergeStartHereManagedRegions(
	currentBody: string,
	regions: StartHereManagedRegionInput[]
): string {
	const lineEnding = preferredLineEnding(currentBody);
	let nextBody = normalizeMarkdownLineEndings(currentBody);

	for (const region of regions) {
		const block = renderStartHereManagedRegion(region);
		const regex = managedRegionRegex(region.name);
		if (regex.test(nextBody)) {
			nextBody = nextBody.replace(regex, block);
			continue;
		}
		nextBody = insertManagedRegion(nextBody, region.name, block);
	}

	const finalBody = applyLineEnding(nextBody, lineEnding);
	return finalBody === currentBody ? currentBody : finalBody;
}

export function extractStartHereManagedRegions(
	body: string
): Partial<Record<StartHereManagedRegionName, string>> {
	const regions: Partial<Record<StartHereManagedRegionName, string>> = {};
	const normalized = normalizeMarkdownLineEndings(body);
	for (const match of normalized.matchAll(MANAGED_REGION_PATTERN)) {
		const name = match[1] as StartHereManagedRegionName;
		if (!START_HERE_MANAGED_REGION_NAMES.includes(name)) continue;
		regions[name] = (match[3] ?? '').trim();
	}
	return regions;
}

/**
 * Locate complete machine-owned START HERE blocks, including both comment
 * fences. Generic document patches use these ranges to fail closed before an
 * agent-authored proposal can alter managed content.
 */
export function findStartHereManagedRegionRanges(body: string): StartHereManagedRegionRange[] {
	const ranges: StartHereManagedRegionRange[] = [];
	for (const match of body.matchAll(MANAGED_REGION_PATTERN)) {
		const name = match[1] as StartHereManagedRegionName;
		if (!START_HERE_MANAGED_REGION_NAMES.includes(name) || match.index === undefined) continue;
		ranges.push({
			name,
			from: match.index,
			to: match.index + match[0].length
		});
	}
	return ranges;
}

export function stripStartHereManagedRegions(body: string): string {
	return normalizeMarkdownLineEndings(body).replace(MANAGED_REGION_PATTERN, '').trim();
}

/**
 * Apply an authored-body update without losing the current machine-owned managed
 * regions. This is used by generic document update paths that receive a proposed
 * Start Here body from review/capture flows: callers may pass a body that omits
 * status/map fences, but the stored document should keep the latest current
 * managed regions.
 */
export function preserveCurrentStartHereManagedRegions(
	currentBody: string,
	nextBody: string
): string {
	const regions = extractStartHereManagedRegions(currentBody);
	const managedInputs: StartHereManagedRegionInput[] = START_HERE_MANAGED_REGION_NAMES.flatMap(
		(name) => {
			const content = regions[name];
			return typeof content === 'string' && content.trim() ? [{ name, content }] : [];
		}
	);
	const authoredBody = stripStartHereManagedRegions(nextBody);
	return managedInputs.length > 0
		? mergeStartHereManagedRegions(authoredBody, managedInputs)
		: authoredBody;
}

// The 2026-06-24 backfill template emitted its per-section editing guidance as
// plain text (not italic blockquotes), so those exact lines survive in prod
// docs and would otherwise reach prompts as fake authored content. Match them
// verbatim (trimmed) — real content never reproduces these strings exactly.
const LEGACY_SCAFFOLD_LINES = new Set([
	'- Things we are deliberately not doing, with the reason in brief.',
	'2-4 sentences: what just happened, what is in progress, and what is blocked.',
	'- **Decision** - one-line rationale. _(YYYY-MM-DD)_',
	'- **Term** - what it means in this project.',
	'- Live question we have not resolved.'
]);

function stripPromptNoiseLines(body: string): string {
	return normalizeMarkdownLineEndings(body)
		.split('\n')
		.filter((line) => {
			const trimmed = line.trim();
			// Volatile per-run managed footer.
			if (/^_?last refreshed\b/i.test(trimmed)) return false;
			if (LEGACY_SCAFFOLD_LINES.has(trimmed)) return false;
			// Authoring scaffolding: a line that is entirely an italic blockquote
			// (e.g. "> _Capture target: ..._" or the legacy "> _authored - capture
			// target_"). This is editing guidance, not project context, so it must
			// not be injected into the prompt. Real content is never a pure-italic
			// blockquote line.
			if (/^>\s*_.+_\s*$/.test(trimmed)) return false;
			return true;
		})
		.join('\n')
		.trim();
}

function collectMarkdownHeadings(body: string, limit = 20): string[] {
	const headings: string[] = [];
	for (const line of body.split('\n')) {
		const match = /^(#{1,4})\s+(.+)$/.exec(line.trim());
		if (!match) continue;
		headings.push(`${match[1]} ${match[2]}`.trim());
		if (headings.length >= limit) break;
	}
	return headings;
}

export type StartHereStatusSnapshot = {
	state: string | null;
	scale: string | null;
	stage: string | null;
	now: string | null;
	nextStep: string | null;
	refreshedAt: string | null;
	/** False while the region still holds the never-rendered template copy. */
	rendered: boolean;
};

const STATUS_TEMPLATE_NOW_VALUES = new Set([
	'No project snapshot has been rendered yet.',
	'No snapshot summary loaded.'
]);
const STATUS_TEMPLATE_NEXT_STEP = 'Not captured yet.';

/**
 * Parse the machine-owned `managed:status` region (the inverse of
 * `renderStartHereStatusContent`) so display surfaces can show State / Now /
 * Next step without re-rendering the raw markdown. Returns null when the body
 * has no status region at all.
 */
export function parseStartHereStatusRegion(body: string): StartHereStatusSnapshot | null {
	const region = extractStartHereManagedRegions(body).status;
	if (typeof region !== 'string') return null;

	let state: string | null = null;
	let scale: string | null = null;
	let stage: string | null = null;
	let now: string | null = null;
	let nextStep: string | null = null;
	let refreshedAt: string | null = null;

	for (const rawLine of region.split('\n')) {
		const line = rawLine.trim();
		if (!line) continue;

		const refreshedMatch = /^_Last refreshed (.+?) from project snapshot\._$/.exec(line);
		if (refreshedMatch) {
			refreshedAt = refreshedMatch[1]?.trim() || null;
			continue;
		}

		// Now/Next step hold a single free-text value for the whole line; only
		// the state line packs State/Scale/Stage as ` · `-joined bold labels.
		const wholeLineMatch = /^\*\*(Now|Next step):\*\*\s*(.*)$/.exec(line);
		if (wholeLineMatch) {
			const value = compactLabel(wholeLineMatch[2]);
			if (wholeLineMatch[1] === 'Now') now = value;
			else nextStep = value;
			continue;
		}

		for (const part of line.split(' · ')) {
			const labelMatch = /^\*\*(State|Scale|Stage):\*\*\s*(.*)$/.exec(part.trim());
			if (!labelMatch) continue;
			const value = compactLabel(labelMatch[2]);
			if (labelMatch[1] === 'State') state = value;
			else if (labelMatch[1] === 'Scale') scale = value;
			else stage = value;
		}
	}

	if (now && STATUS_TEMPLATE_NOW_VALUES.has(now)) now = null;
	if (nextStep === STATUS_TEMPLATE_NEXT_STEP) nextStep = null;
	const rendered = Boolean(refreshedAt) || (state !== null && state !== 'Unknown');
	if (state === 'Unknown') state = null;

	return { state, scale, stage, now, nextStep, refreshedAt, rendered };
}

/**
 * Pull a short "what this project is" orientation line from a Start Here body.
 * Handles both authored dialects — the `## What this is` template section and
 * the instantiation `## Vision & Summary` section — and falls back to the
 * first real paragraph. Managed regions, headings, and editing scaffolding are
 * never returned.
 */
export function extractStartHereOrientation(body: string, maxChars = 280): string | null {
	const authored = stripPromptNoiseLines(stripStartHereManagedRegions(body));
	if (!authored) return null;

	const sectionsToTry = ['What this is', 'Vision & Summary', 'Vision and Summary'];
	const candidates: string[] = [];
	for (const section of sectionsToTry) {
		const match = new RegExp(
			`^##\\s+${escapeRegExp(section)}\\s*$([\\s\\S]*?)(?=^#{1,2}\\s|$(?![\\s\\S]))`,
			'im'
		).exec(authored);
		if (match?.[1]) candidates.push(match[1]);
	}
	candidates.push(authored);

	for (const candidate of candidates) {
		const paragraph = candidate
			.split(/\n{2,}/)
			.map((block) =>
				block
					.split('\n')
					.filter((line) => !/^#{1,6}\s/.test(line.trim()))
					.join(' ')
					.replace(/\s+/g, ' ')
					.trim()
			)
			.find((block) => block.length > 0);
		if (paragraph) return truncateByChars(paragraph, Math.max(1, maxChars));
	}
	return null;
}

export function buildStartHerePromptExcerpt(
	body: string,
	maxChars = START_HERE_PROMPT_MAX_CHARS
): StartHerePromptExcerpt {
	const normalized = stripPromptNoiseLines(body);
	const originalChars = normalized.length;
	const safeMaxChars = Math.max(0, Math.floor(maxChars));

	if (normalized.length <= safeMaxChars) {
		return {
			content: normalized,
			truncated: false,
			originalChars,
			maxChars: safeMaxChars
		};
	}

	const headings = collectMarkdownHeadings(normalized);
	const headingsBlock = headings.length
		? ['Included section headings:', ...headings.map((heading) => `- ${heading}`)].join('\n')
		: '';
	const truncationNote =
		'(Truncated. Use get_document_outline and read_document_section for the full Start Here document.)';
	const reservedChars = headingsBlock.length + truncationNote.length + 4;
	const excerptBudget = Math.max(0, safeMaxChars - reservedChars);
	const excerpt = truncateByChars(normalized, excerptBudget);
	const content = [excerpt, headingsBlock, truncationNote].filter(Boolean).join('\n\n');

	return {
		content: truncateByChars(content, safeMaxChars),
		truncated: true,
		originalChars,
		maxChars: safeMaxChars
	};
}
