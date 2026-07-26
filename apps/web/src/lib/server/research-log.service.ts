// apps/web/src/lib/server/research-log.service.ts
//
// Deterministic research capture — the floor beneath the model's own document writes.
//
// Why this exists in code rather than as a prompt rule or a skill (both measured 2026-07-25):
//   - A persistence rule added at position 13 of the 20-item "How to act" list scored 0/5.
//   - `activation: always_on` is a dead enum; across 10 instrumented turns the model issued exactly
//     one `skill_load`. Skills cannot carry behavior that must hold every turn.
// So a turn that researched and saved nothing is repaired by the model when possible
// (`shouldRepairResearchNoPersist`) and captured here regardless of what the model chose to do.
//
// Storage note: `document.knowledge.research` is deliberately NOT a `*scratch*` type key.
// `ontology-context-loader.ts` filters any type_key containing 'scratch' or 'workspace' out of
// project context, so a scratch-typed log could be written but never read back. This type key is
// visible in document highlights (metadata only — title/type/description), with the body fetched on
// demand via get_document_outline / read_document_section.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import {
	createOrMergeDocumentVersion,
	toDocumentSnapshot
} from '$lib/services/ontology/versioning.service';
import { addDocumentToTree } from '$lib/services/ontology/doc-structure.service';

export const RESEARCH_LOG_TITLE = 'Research Log';
export const RESEARCH_LOG_ARCHIVE_TITLE = 'Research Log (Archive)';
export const RESEARCH_LOG_TYPE_KEY = 'document.knowledge.research';

/** Rotation caps (DJ, 2026-07-26). Whichever trips first moves the oldest entries to the archive. */
export const RESEARCH_LOG_MAX_ENTRIES = 20;
export const RESEARCH_LOG_MAX_BYTES = 24_000;

/** A single entry stays small on purpose — a turn that wants more should write a real document. */
export const RESEARCH_ENTRY_MAX_CHARS = 600;

const USER_MESSAGE_MAX_CHARS = 140;
const LIST_ITEM_MAX = 6;

const LOG_HEADER = [
	`# ${RESEARCH_LOG_TITLE}`,
	'',
	'Research captured automatically from chat turns, newest first. Each entry records what was',
	'searched, which sources were read, and what went unresolved.',
	''
].join('\n');

const ARCHIVE_HEADER = [
	`# ${RESEARCH_LOG_ARCHIVE_TITLE}`,
	'',
	`Older entries rotated out of ${RESEARCH_LOG_TITLE}, newest first.`,
	''
].join('\n');

export interface ResearchEntryInput {
	/** Idempotency key — one entry per turn, even if finalization runs twice. */
	streamRunId: string;
	userMessage: string;
	queries: string[];
	visitedUrls: string[];
	findings?: string[];
	unresolved?: string[];
	/** ISO timestamp; injected so rendering stays pure and testable. */
	capturedAt: string;
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

export function runMarker(streamRunId: string): string {
	return `<!-- run:${streamRunId} -->`;
}

/** True when this turn's entry is already in the log. Finalization can run more than once. */
export function hasEntryForRun(content: string, streamRunId: string): boolean {
	if (!streamRunId) return false;
	return content.includes(runMarker(streamRunId));
}

/**
 * Renders one entry. Capped at RESEARCH_ENTRY_MAX_CHARS — the cap is enforced by trimming the
 * optional lines (findings, then unresolved, then visited) rather than truncating mid-URL, so what
 * survives stays parseable.
 */
export function renderResearchEntry(input: ResearchEntryInput): string {
	const date = input.capturedAt.slice(0, 10);
	const topic = clip(input.userMessage || 'Research', USER_MESSAGE_MAX_CHARS);
	const queries = uniqueClipped(input.queries ?? [], LIST_ITEM_MAX, 80);
	const visited = uniqueClipped(input.visitedUrls ?? [], LIST_ITEM_MAX, 120);
	const findings = uniqueClipped(input.findings ?? [], LIST_ITEM_MAX, 120);
	const unresolved = uniqueClipped(input.unresolved ?? [], 3, 100);

	const head = [`## ${date} · ${topic}`, runMarker(input.streamRunId), ''];

	const build = (opts: {
		includeFindings: boolean;
		includeUnresolved: boolean;
		visitedLimit: number;
	}): string => {
		const lines = [...head];
		if (queries.length) lines.push(`- Queries: ${queries.join(' · ')}`);
		const shownVisited = visited.slice(0, opts.visitedLimit);
		if (shownVisited.length) lines.push(`- Visited: ${shownVisited.join(' , ')}`);
		if (opts.includeFindings && findings.length)
			lines.push(`- Findings: ${findings.join(' · ')}`);
		if (opts.includeUnresolved && unresolved.length) {
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

/** Splits a log body into its entries (each begins with a level-2 heading), discarding the header. */
export function splitEntries(content: string): string[] {
	if (!content) return [];
	const parts = content.split(/\n(?=## )/g);
	return parts.map((part) => part.trim()).filter((part) => part.startsWith('## '));
}

function joinEntries(header: string, entries: string[]): string {
	if (entries.length === 0) return header.trimEnd();
	return `${header}\n${entries.join('\n\n')}`.trimEnd();
}

/** Newest entry goes directly under the header, so reading the top of the doc gives latest research. */
export function prependEntry(content: string, entry: string): string {
	const entries = splitEntries(content);
	return joinEntries(LOG_HEADER, [entry, ...entries]);
}

export interface RotationPlan {
	liveContent: string;
	rotatedEntries: string[];
}

/**
 * Returns null when no rotation is needed. Otherwise the live body keeps the newest entries under
 * both caps and `rotatedEntries` are the oldest, in newest-first order for the archive.
 */
export function planRotation(content: string): RotationPlan | null {
	const entries = splitEntries(content);
	const overCount = entries.length > RESEARCH_LOG_MAX_ENTRIES;
	const overBytes = Buffer.byteLength(content, 'utf8') > RESEARCH_LOG_MAX_BYTES;
	if (!overCount && !overBytes) return null;

	let keep = Math.min(entries.length, RESEARCH_LOG_MAX_ENTRIES);
	// Always keep at least the newest entry, even if it alone exceeds the byte cap.
	while (keep > 1) {
		const candidate = joinEntries(LOG_HEADER, entries.slice(0, keep));
		if (Buffer.byteLength(candidate, 'utf8') <= RESEARCH_LOG_MAX_BYTES) break;
		keep -= 1;
	}
	if (keep >= entries.length) return null;

	return {
		liveContent: joinEntries(LOG_HEADER, entries.slice(0, keep)),
		rotatedEntries: entries.slice(keep)
	};
}

/** The one-line index the model sees without opening the document. */
export function buildLogDescription(input: ResearchEntryInput): string {
	return clip(`Auto-captured research. Latest: ${input.userMessage || 'research'}`, 180);
}

/** Minimal shape the route passes in, so this module stays decoupled from orchestrator types. */
export interface ResearchToolCall {
	name: string;
	args: Record<string, unknown> | null;
	result?: unknown;
}

/** How many web research calls a turn needs before it is worth capturing. */
export const RESEARCH_CAPTURE_MINIMUM_CALLS = 2;

function isResearchToolName(name: string): boolean {
	const normalized = name.trim().toLowerCase();
	return (
		normalized === 'web_search' ||
		normalized === 'web_visit' ||
		normalized === 'util.web.search' ||
		normalized === 'util.web.visit'
	);
}

/** Shallow sweep for `url`-ish string fields, since search result payload shapes vary by provider. */
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

/**
 * Builds an entry from a turn's tool calls, or null when the turn does not meet the capture bar.
 * Pure — the caller supplies identity and time.
 */
export function buildResearchEntryFromCalls(
	calls: ResearchToolCall[],
	context: { streamRunId: string; userMessage: string; capturedAt: string }
): ResearchEntryInput | null {
	const researchCalls = calls.filter((call) => isResearchToolName(call.name));
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

type Client = SupabaseClient<Database>;
type DocumentRow = { id: string; content: string | null; title: string; props: unknown };

async function findLogDocument(
	supabase: Client,
	projectId: string,
	title: string
): Promise<DocumentRow | null> {
	const { data, error } = await supabase
		.from('onto_documents')
		.select('id, content, title, props')
		.eq('project_id', projectId)
		.eq('type_key', RESEARCH_LOG_TYPE_KEY)
		.eq('title', title)
		.is('deleted_at', null)
		.order('created_at', { ascending: true })
		.limit(1)
		.maybeSingle();
	if (error) throw error;
	return (data as DocumentRow | null) ?? null;
}

async function createLogDocument(
	supabase: Client,
	params: {
		projectId: string;
		actorId: string;
		title: string;
		content: string;
		description: string;
	}
): Promise<DocumentRow> {
	const { data, error } = await supabase
		.from('onto_documents')
		.insert({
			project_id: params.projectId,
			title: params.title,
			type_key: RESEARCH_LOG_TYPE_KEY,
			state_key: 'draft',
			content: params.content,
			description: params.description,
			props: { body_markdown: params.content },
			created_by: params.actorId
		})
		.select('id, content, title, props')
		.single();
	if (error) throw error;
	const document = data as DocumentRow;

	// Both are nice-to-have: a log that exists but is missing a tree slot or a version row is still
	// a successful capture, and capture must never fail the turn.
	try {
		await createOrMergeDocumentVersion({
			supabase,
			documentId: document.id,
			actorId: params.actorId,
			snapshot: toDocumentSnapshot(data as Record<string, unknown>),
			changeSource: 'chat'
		});
	} catch (versionError) {
		console.warn('[research-log] version create failed (non-fatal)', versionError);
	}
	try {
		await addDocumentToTree(
			supabase,
			params.projectId,
			document.id,
			{ title: params.title, description: params.description },
			params.actorId
		);
	} catch (treeError) {
		console.warn('[research-log] doc-tree placement failed (non-fatal)', treeError);
	}

	return document;
}

async function writeLogContent(
	supabase: Client,
	documentId: string,
	content: string,
	description?: string
): Promise<void> {
	const { error } = await supabase
		.from('onto_documents')
		.update({
			content,
			props: { body_markdown: content },
			...(description ? { description } : {})
		})
		.eq('id', documentId);
	if (error) throw error;
}

async function resolveActorId(supabase: Client, userId: string): Promise<string> {
	const { data, error } = await supabase.rpc('ensure_actor_for_user', { p_user_id: userId });
	if (error) throw error;
	if (!data) throw new Error('[research-log] ensure_actor_for_user returned no actor');
	return data as unknown as string;
}

export interface AppendResearchEntryParams {
	projectId: string;
	userId: string;
	actorId?: string;
	entry: ResearchEntryInput;
}

export type AppendResearchEntryResult =
	| { status: 'appended'; documentId: string; rotated: number }
	| { status: 'duplicate'; documentId: string }
	| { status: 'skipped'; reason: string };

/**
 * Appends one entry to the project's Research Log, creating the log on first use and rotating older
 * entries into the archive when either cap trips.
 *
 * Callers should await this before closing the response — a fire-and-forget write races the e2e
 * assertions. It is one read plus one write.
 */
export async function appendResearchEntry(
	supabase: Client,
	params: AppendResearchEntryParams
): Promise<AppendResearchEntryResult> {
	const { projectId, entry } = params;
	if (!projectId) return { status: 'skipped', reason: 'no_project' };
	if (!entry.streamRunId) return { status: 'skipped', reason: 'no_stream_run_id' };

	const actorId = params.actorId ?? (await resolveActorId(supabase, params.userId));
	const description = buildLogDescription(entry);
	const rendered = renderResearchEntry(entry);

	const existing = await findLogDocument(supabase, projectId, RESEARCH_LOG_TITLE);

	if (!existing) {
		const created = await createLogDocument(supabase, {
			projectId,
			actorId,
			title: RESEARCH_LOG_TITLE,
			content: prependEntry('', rendered),
			description
		});
		return { status: 'appended', documentId: created.id, rotated: 0 };
	}

	const currentContent = existing.content ?? '';
	if (hasEntryForRun(currentContent, entry.streamRunId)) {
		return { status: 'duplicate', documentId: existing.id };
	}

	const nextContent = prependEntry(currentContent, rendered);
	const rotation = planRotation(nextContent);

	if (!rotation) {
		await writeLogContent(supabase, existing.id, nextContent, description);
		return { status: 'appended', documentId: existing.id, rotated: 0 };
	}

	await archiveEntries(supabase, { projectId, actorId, entries: rotation.rotatedEntries });
	await writeLogContent(supabase, existing.id, rotation.liveContent, description);
	return { status: 'appended', documentId: existing.id, rotated: rotation.rotatedEntries.length };
}

async function archiveEntries(
	supabase: Client,
	params: { projectId: string; actorId: string; entries: string[] }
): Promise<void> {
	if (params.entries.length === 0) return;
	const archive = await findLogDocument(supabase, params.projectId, RESEARCH_LOG_ARCHIVE_TITLE);
	if (!archive) {
		await createLogDocument(supabase, {
			projectId: params.projectId,
			actorId: params.actorId,
			title: RESEARCH_LOG_ARCHIVE_TITLE,
			content: `${ARCHIVE_HEADER}\n${params.entries.join('\n\n')}`.trimEnd(),
			description: 'Older auto-captured research entries rotated out of the Research Log.'
		});
		return;
	}
	const existingEntries = splitEntries(archive.content ?? '');
	const merged =
		`${ARCHIVE_HEADER}\n${[...params.entries, ...existingEntries].join('\n\n')}`.trimEnd();
	await writeLogContent(supabase, archive.id, merged);
}
