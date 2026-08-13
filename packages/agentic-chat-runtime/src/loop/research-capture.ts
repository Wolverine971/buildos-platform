// packages/agentic-chat-runtime/src/loop/research-capture.ts
// Deterministic research-entry construction shared by legacy and worker hosts.

export interface ResearchEntryInput {
	/** Stable one-entry-per-turn identity. */
	streamRunId: string;
	userMessage: string;
	queries: string[];
	visitedUrls: string[];
	findings?: string[];
	unresolved?: string[];
	/** ISO timestamp supplied by the caller so construction remains pure. */
	capturedAt: string;
}

export interface ResearchToolCall {
	name: string;
	args: Record<string, unknown> | null;
	result?: unknown;
}

export const RESEARCH_LOG_TITLE = 'Research Log';
export const RESEARCH_LOG_ARCHIVE_TITLE = 'Research Log (Archive)';
export const RESEARCH_LOG_TYPE_KEY = 'document.knowledge.research';

/** Rotation caps. Whichever trips first moves the oldest entries to the archive. */
export const RESEARCH_LOG_MAX_ENTRIES = 20;
export const RESEARCH_LOG_MAX_BYTES = 24_000;

/** A single entry stays small on purpose — a turn that wants more should write a real document. */
export const RESEARCH_ENTRY_MAX_CHARS = 600;

const USER_MESSAGE_MAX_CHARS = 140;
const LIST_ITEM_MAX = 6;

/** How many durable web-research calls make a turn worth capturing. */
export const RESEARCH_CAPTURE_MINIMUM_CALLS = 2;

export function isResearchCaptureToolName(name: string): boolean {
	const normalized = name.trim().toLowerCase();
	return (
		normalized === 'web_search' ||
		normalized === 'web_visit' ||
		normalized === 'util.web.search' ||
		normalized === 'util.web.visit'
	);
}

/**
 * Build the exact research entry used by the legacy finalization floor. The
 * legacy qualifier is deliberately name-only: a failed research call still
 * counts once it has a durable execution row.
 */
export function buildResearchEntryFromCalls(
	calls: ResearchToolCall[],
	context: { streamRunId: string; userMessage: string; capturedAt: string }
): ResearchEntryInput | null {
	const researchCalls = calls.filter((call) => isResearchCaptureToolName(call.name));
	if (researchCalls.length < RESEARCH_CAPTURE_MINIMUM_CALLS) return null;

	const queries: string[] = [];
	const visitedUrls: string[] = [];
	const findings: string[] = [];

	for (const call of researchCalls) {
		const args = call.args ?? {};
		const query = args.query ?? args.q;
		if (typeof query === 'string' && query.trim()) queries.push(query.trim());
		const url = args.url;
		if (typeof url === 'string' && url.trim()) visitedUrls.push(url.trim());
		for (const found of collectUrls(call.result)) visitedUrls.push(found);
		const answer = (call.result as Record<string, unknown> | undefined)?.answer;
		if (typeof answer === 'string' && answer.trim()) findings.push(answer.trim());
	}

	return {
		streamRunId: context.streamRunId,
		userMessage: context.userMessage,
		queries,
		visitedUrls,
		findings,
		capturedAt: context.capturedAt
	};
}

export function runMarker(streamRunId: string): string {
	return `<!-- run:${streamRunId} -->`;
}

/** Render one deterministic, bounded Research Log entry. */
export function renderResearchEntry(input: ResearchEntryInput): string {
	const date = input.capturedAt.slice(0, 10);
	const topic = clip(input.userMessage || 'Research', USER_MESSAGE_MAX_CHARS);
	const queries = uniqueClipped(input.queries ?? [], LIST_ITEM_MAX, 80);
	const visited = uniqueClipped(input.visitedUrls ?? [], LIST_ITEM_MAX, 120);
	const findings = uniqueClipped(input.findings ?? [], LIST_ITEM_MAX, 120);
	const unresolved = uniqueClipped(input.unresolved ?? [], 3, 100);
	const head = [`## ${date} · ${topic}`, runMarker(input.streamRunId), ''];

	const build = (options: {
		includeFindings: boolean;
		includeUnresolved: boolean;
		visitedLimit: number;
	}): string => {
		const lines = [...head];
		if (queries.length) lines.push(`- Queries: ${queries.join(' · ')}`);
		const shownVisited = visited.slice(0, options.visitedLimit);
		if (shownVisited.length) lines.push(`- Visited: ${shownVisited.join(' , ')}`);
		if (options.includeFindings && findings.length) {
			lines.push(`- Findings: ${findings.join(' · ')}`);
		}
		if (options.includeUnresolved && unresolved.length) {
			lines.push(`- Unresolved: ${unresolved.join(' · ')}`);
		}
		return lines.join('\n').trimEnd();
	};

	// Degrade in a fixed order so the cap never produces a half-written URL.
	const attempts = [
		{ includeFindings: true, includeUnresolved: true, visitedLimit: visited.length },
		{ includeFindings: true, includeUnresolved: false, visitedLimit: visited.length },
		{ includeFindings: false, includeUnresolved: false, visitedLimit: visited.length },
		{ includeFindings: false, includeUnresolved: false, visitedLimit: 2 },
		{ includeFindings: false, includeUnresolved: false, visitedLimit: 0 }
	];
	for (const attempt of attempts) {
		const rendered = build(attempt);
		if (rendered.length <= RESEARCH_ENTRY_MAX_CHARS) return rendered;
	}
	return build(attempts[attempts.length - 1]!).slice(0, RESEARCH_ENTRY_MAX_CHARS);
}

/** The one-line index the model sees without opening the document. */
export function buildResearchLogDescription(input: ResearchEntryInput): string {
	return clip(`Auto-captured research. Latest: ${input.userMessage || 'research'}`, 180);
}

/** Shallow sweep for URL-like string fields across provider result shapes. */
function collectUrls(value: unknown, depth = 0, out: string[] = []): string[] {
	if (out.length >= 20 || depth > 3) return out;
	if (typeof value === 'string') {
		if (/^https?:\/\//i.test(value)) out.push(value);
		return out;
	}
	if (Array.isArray(value)) {
		for (const item of value) collectUrls(item, depth + 1, out);
		return out;
	}
	if (value && typeof value === 'object') {
		for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
			if (typeof item === 'string' && !/url|link|href/i.test(key)) continue;
			collectUrls(item, depth + 1, out);
		}
	}
	return out;
}

function clip(value: string, max: number): string {
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (normalized.length <= max) return normalized;
	return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function uniqueClipped(values: string[], max: number, itemMax: number): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of values) {
		const value = clip(String(raw ?? ''), itemMax);
		if (!value || seen.has(value)) continue;
		seen.add(value);
		out.push(value);
		if (out.length >= max) break;
	}
	return out;
}
