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

	return [...candidates].sort((left, right) => {
		const rightMs = timestampMs(right.updated_at) || timestampMs(right.created_at);
		const leftMs = timestampMs(left.updated_at) || timestampMs(left.created_at);
		return rightMs - leftMs;
	})[0];
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
	const headingEnd = match.index + match[0].length;
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

function stripPromptNoiseLines(body: string): string {
	return normalizeMarkdownLineEndings(body)
		.split('\n')
		.filter((line) => {
			const trimmed = line.trim();
			// Volatile per-run managed footer.
			if (/^_?last refreshed\b/i.test(trimmed)) return false;
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
