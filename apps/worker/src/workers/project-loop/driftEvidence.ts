// apps/worker/src/workers/project-loop/driftEvidence.ts
//
// Drift is usually a change that didn't propagate: a decision recorded in one document while
// another still lists it as open. The drift pass used to see 140-character document slices, so it
// could not compare documents at all (tasker 107). This module gives it both sides:
//
//   1. What changed: document sections edited or added in the last DRIFT_LOOKBACK_DAYS, from
//      version snapshots (onto_document_versions keeps the full content of every version).
//   2. What else covers the same subjects: the shared Jev context finder, with those changes as
//      its request, ranks every record and document section in the project (START HERE included).
//
// Everything is fail-open. Without Jev the pass gets START HERE's authored sections and the
// openings of recently edited documents. Markdown headings are a structured format; nothing
// here classifies prose.
import {
	type ContextEvidenceRankerV1,
	type ContextFinderDecider,
	type ContextFinderEntity,
	type ContextFinderProjectV1,
	type ContextPlanV1,
	buildContextFinderEntities,
	loadContextFinderProject,
	rankProjectContext,
	rankerSummary,
	selectProjectContext
} from '@buildos/agentic-chat-runtime/context-finder';
import {
	START_HERE_DOCUMENT_TYPE_KEY,
	readStartHereAuthoredSections,
	stripStartHereManagedRegions
} from '@buildos/shared-agent-ops/ontology/start-here';
import { clipForPrompt } from './promptText';

export const DRIFT_EVIDENCE_LIMITS = Object.freeze({
	lookbackDays: 14,
	/** Documents diffed per run, most recently updated first. */
	maxChangedDocuments: 12,
	maxChangesPerDocument: 6,
	maxChanges: 12,
	/** Changes are an index of what moved; the related sections carry the full text. */
	changeChars: 600,
	/** Per change, in the Jev request. */
	queryChangeChars: 240,
	/**
	 * Related sections load whole up to this size. The chat finder cuts sections at 2,000
	 * characters; a decision can sit deeper than that (the book's Card 9 is ~2,600 characters
	 * into its section).
	 */
	sectionChars: 5_000,
	recordChars: 1_200,
	relatedBudgetChars: 24_000,
	fallbackOpeningChars: 1_500,
	fallbackDocuments: 4,
	jevTimeoutMs: 6_000
});

export type DriftChange = {
	documentId: string;
	documentTitle: string;
	heading: string | null;
	change: 'added' | 'edited';
	/** Lines added by the change (the whole section when it is new). */
	text: string;
	changedAt: string;
};

export type DriftRelatedItem = {
	kind: string;
	id: string;
	title: string;
	excerpts: { heading: string | null; text: string }[];
};

export type ProjectDriftEvidence = {
	since: string;
	changes: DriftChange[];
	related: DriftRelatedItem[];
	/** jev: ranked by the context finder; fallback: START HERE plus document openings. */
	source: 'jev' | 'fallback';
	ranker: ContextEvidenceRankerV1 | null;
	/** Why the fallback was used, for the run log. */
	fallbackReason: string | null;
	/**
	 * Full current text of every document shown above, keyed by id: the only documents a
	 * one-click fix may edit, and the text its edits must resolve against (driftFixes.ts).
	 */
	documents: Record<string, { title: string; content: string }>;
};

type DocSection = { key: string; heading: string | null; text: string };

const HEADING = /^(#{1,3})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*```/;
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * A document split at every H1–H3, each section holding only its own lines (not its
 * subsections), so an edit marks the section it touched rather than the whole parent.
 * Managed START HERE regions are system-refreshed and never count as a change.
 */
export function flatDocumentSections(markdown: string | null | undefined): DocSection[] {
	const body = stripStartHereManagedRegions(String(markdown ?? '')).replace(/\r\n?/g, '\n');
	const sections: { heading: string | null; lines: string[] }[] = [{ heading: null, lines: [] }];
	let fenced = false;
	for (const line of body.split('\n')) {
		if (FENCE.test(line)) fenced = !fenced;
		const match = fenced ? null : HEADING.exec(line);
		if (match) sections.push({ heading: match[2]!, lines: [line] });
		else sections[sections.length - 1]!.lines.push(line);
	}
	const occurrences = new Map<string, number>();
	return sections
		.map((section) => {
			const base = section.heading ?? '';
			const n = occurrences.get(base) ?? 0;
			occurrences.set(base, n + 1);
			return {
				key: `${base}\u0000${n}`,
				heading: section.heading,
				text: section.lines.join('\n').trim()
			};
		})
		.filter((section) => section.text.length > 0);
}

/** Sections of `after` that are new or edited relative to `before` (null: document is new). */
export function diffDocumentSections(
	before: string | null,
	after: string
): { heading: string | null; change: 'added' | 'edited'; text: string }[] {
	const old = new Map(
		flatDocumentSections(before ?? '').map((section) => [section.key, section.text])
	);
	const out: { heading: string | null; change: 'added' | 'edited'; text: string }[] = [];
	for (const section of flatDocumentSections(after)) {
		const previous = old.get(section.key);
		if (previous === undefined) {
			out.push({ heading: section.heading, change: 'added', text: section.text });
			continue;
		}
		if (normalize(previous) === normalize(section.text)) continue;
		// Show what the edit added; a pure deletion or reorder rarely leaves drift elsewhere.
		const oldLines = new Set(previous.split('\n').map(normalize).filter(Boolean));
		const added = section.text
			.split('\n')
			.filter((line) => normalize(line) && !oldLines.has(normalize(line)));
		if (!added.length) continue;
		out.push({ heading: section.heading, change: 'edited', text: added.join('\n').trim() });
	}
	return out;
}

type VersionRow = { document_id?: unknown; content?: unknown; created_at?: unknown };
type DriftQueryResult = { data: unknown; error: { message?: string } | null };
/** The query surface both the context-finder loader and the version lookup use. */
type DriftQuery = {
	select(columns: string): DriftQuery;
	eq(column: string, value: string): DriftQuery;
	in(column: string, values: readonly string[]): DriftQuery;
	is(column: string, value: null): DriftQuery;
	lt(column: string, value: string): DriftQuery;
	order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): DriftQuery;
	limit(count: number): DriftQuery;
	abortSignal(signal: AbortSignal): DriftQuery;
	maybeSingle(): PromiseLike<DriftQueryResult>;
	then: PromiseLike<DriftQueryResult>['then'];
};
export type DriftEvidenceClient = { from(table: string): DriftQuery };

const time = (value: unknown) => {
	const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
	return Number.isFinite(parsed) ? parsed : 0;
};

/** The document's content as of `since`: its latest version snapshot from before then. */
async function contentAsOf(
	client: DriftEvidenceClient,
	documentId: string,
	since: string,
	signal: AbortSignal
): Promise<string | null | undefined> {
	const { data, error } = await client
		.from('onto_document_versions')
		.select('document_id, created_at, content:props->snapshot->>content')
		.eq('document_id', documentId)
		.lt('created_at', since)
		.order('number', { ascending: false })
		.limit(1)
		.abortSignal(signal)
		.maybeSingle();
	if (error) return undefined;
	const row = data as VersionRow | null;
	return row && typeof row.content === 'string' ? row.content : null;
}

/**
 * Sections changed since `since`. Edits to existing sections come first (a decision written
 * into an existing document is the classic change that fails to propagate), then new sections
 * in existing documents, then documents created inside the window. Within each tier, documents
 * take turns, newest first, so one busy document cannot fill every slot. An older document
 * with no version from before the window has no baseline and is skipped, not guessed at.
 */
export async function loadRecentDocumentChanges(input: {
	client: DriftEvidenceClient;
	project: ContextFinderProjectV1;
	since: string;
	signal: AbortSignal;
}): Promise<DriftChange[]> {
	const limits = DRIFT_EVIDENCE_LIMITS;
	const sinceMs = time(input.since);
	const recent = input.project.documents
		.filter((doc) => time(doc.updated_at) >= sinceMs && typeof doc.content === 'string')
		.sort((a, b) => time(b.updated_at) - time(a.updated_at))
		.slice(0, limits.maxChangedDocuments);
	const perDocument = await Promise.all(
		recent.map(async (doc) => {
			const createdInWindow = time(doc.created_at) >= sinceMs;
			const before = createdInWindow
				? null
				: await contentAsOf(input.client, String(doc.id), input.since, input.signal);
			if (before === undefined || (before === null && !createdInWindow)) return [];
			return diffDocumentSections(before, String(doc.content)).map(
				(section): DriftChange & { tier: number } => ({
					documentId: String(doc.id),
					documentTitle: String(doc.title ?? 'Untitled'),
					heading: section.heading,
					change: section.change,
					text: clipForPrompt(section.text, limits.changeChars, { keepLines: true }),
					changedAt: String(doc.updated_at),
					tier: before === null ? 2 : section.change === 'edited' ? 0 : 1
				})
			);
		})
	);
	const changes: DriftChange[] = [];
	const perDocumentCount = new Map<string, number>();
	for (const tier of [0, 1, 2]) {
		const queues = perDocument.map((list) => list.filter((change) => change.tier === tier));
		for (let i = 0; changes.length < limits.maxChanges; i++) {
			const layer = queues.map((queue) => queue[i]).filter(Boolean);
			if (!layer.length) break;
			for (const { tier: _tier, ...change } of layer) {
				const count = perDocumentCount.get(change.documentId) ?? 0;
				if (count >= limits.maxChangesPerDocument || changes.length >= limits.maxChanges)
					continue;
				perDocumentCount.set(change.documentId, count + 1);
				changes.push(change);
			}
		}
	}
	return changes;
}

/** The context finder's request: the changes, and what the reviewer needs next to them. */
export function buildDriftFinderRequest(changes: readonly DriftChange[], since: string): string {
	if (!changes.length) {
		return 'Review this project for internal consistency: find the records and document sections that state decisions, open questions, pending items, counts, or the current status of the work.';
	}
	return [
		`These project documents changed since ${since.slice(0, 10)}. Find the other records and document sections that cover the same subjects, so a reviewer can check whether they still agree with these changes:`,
		...changes.map(
			(change) =>
				`- ${change.documentTitle}${change.heading ? ` › ${change.heading}` : ''}: ${clipForPrompt(change.text, DRIFT_EVIDENCE_LIMITS.queryChangeChars)}`
		)
	].join('\n');
}

function fallbackRelated(project: ContextFinderProjectV1): DriftRelatedItem[] {
	const limits = DRIFT_EVIDENCE_LIMITS;
	const items: DriftRelatedItem[] = [];
	const startHere = project.documents.find(
		(doc) => doc.type_key === START_HERE_DOCUMENT_TYPE_KEY
	);
	if (startHere) {
		const sections = readStartHereAuthoredSections(String(startHere.content ?? ''));
		const excerpts = (['Current state', 'Decisions', 'Open questions'] as const)
			.filter((name) => sections[name])
			.map((name) => ({
				heading: name,
				text: clipForPrompt(sections[name], 2_000, { keepLines: true })
			}));
		if (excerpts.length)
			items.push({
				kind: 'document',
				id: String(startHere.id),
				title: String(startHere.title ?? 'START HERE'),
				excerpts
			});
	}
	for (const doc of [...project.documents]
		.filter((doc) => doc !== startHere && typeof doc.content === 'string' && doc.content)
		.sort((a, b) => time(b.updated_at) - time(a.updated_at))
		.slice(0, limits.fallbackDocuments)) {
		items.push({
			kind: 'document',
			id: String(doc.id),
			title: String(doc.title ?? 'Untitled'),
			excerpts: [
				{
					heading: null,
					text: clipForPrompt(
						stripStartHereManagedRegions(String(doc.content)),
						limits.fallbackOpeningChars,
						{ keepLines: true }
					)
				}
			]
		});
	}
	return items;
}

/**
 * Jev's selection, loaded for comparison: each chosen section whole (up to sectionChars,
 * managed regions removed), overlapping sections once, records as text, within the budget.
 */
export function materializeDriftRelated(
	plan: ContextPlanV1,
	entities: readonly ContextFinderEntity[]
): DriftRelatedItem[] {
	const limits = DRIFT_EVIDENCE_LIMITS;
	const byId = new Map(entities.map((entity) => [entity.id, entity]));
	const items: DriftRelatedItem[] = [];
	let used = 0;
	for (const item of plan.items) {
		if (item.tier !== 'full') continue;
		const entity = byId.get(item.id);
		if (!entity || entity.kind !== item.kind) continue;
		let excerpts: DriftRelatedItem['excerpts'] = [];
		if (entity.kind !== 'document') {
			excerpts = [
				{
					heading: null,
					text: clipForPrompt(entity.fullText, limits.recordChars, { keepLines: true })
				}
			];
		} else {
			const ranges: Array<[number, number]> = [];
			for (const wanted of item.sections) {
				const section = entity.sections.find(
					(candidate) =>
						candidate.heading === wanted.heading &&
						!ranges.some(
							([from, to]) => candidate.start >= from && candidate.start < to
						)
				);
				if (!section) continue;
				const end = section.start + section.body.length;
				// A parent and its subsection would load the same text twice.
				if (ranges.some(([from, to]) => section.start < to && from < end)) continue;
				ranges.push([section.start, end]);
				excerpts.push({
					heading: section.heading,
					text: clipForPrompt(
						stripStartHereManagedRegions(section.body),
						limits.sectionChars,
						{
							keepLines: true
						}
					)
				});
			}
			if (!excerpts.length)
				excerpts = [
					{
						heading: null,
						text: clipForPrompt(
							stripStartHereManagedRegions(entity.fullText),
							limits.fallbackOpeningChars,
							{ keepLines: true }
						)
					}
				];
		}
		const size = excerpts.reduce((n, excerpt) => n + excerpt.text.length, 0);
		if (used + size > limits.relatedBudgetChars) continue;
		used += size;
		items.push({ kind: entity.kind, id: entity.id, title: entity.title, excerpts });
	}
	return items;
}

/**
 * Both sides of possible drift for one project. Never throws: any failure returns the
 * fallback evidence (or null when even the project cannot be read) and the run continues.
 */
export async function loadProjectDriftEvidence(input: {
	client: DriftEvidenceClient;
	projectId: string;
	decider: ContextFinderDecider | null;
	signal: AbortSignal;
	now?: Date;
	usage?: { userId?: string };
	/** Preloaded project (tests, replay); otherwise loaded with the service client. */
	project?: ContextFinderProjectV1;
}): Promise<ProjectDriftEvidence | null> {
	const now = input.now ?? new Date();
	const since = new Date(
		now.getTime() - DRIFT_EVIDENCE_LIMITS.lookbackDays * 24 * 60 * 60 * 1000
	).toISOString();
	let project: ContextFinderProjectV1;
	try {
		project =
			input.project ??
			(await loadContextFinderProject(input.client, input.projectId, input.signal));
	} catch {
		input.signal.throwIfAborted();
		return null;
	}
	let changes: DriftChange[] = [];
	try {
		changes = await loadRecentDocumentChanges({
			client: input.client,
			project,
			since,
			signal: input.signal
		});
	} catch {
		input.signal.throwIfAborted();
	}
	const shownDocuments = (related: DriftRelatedItem[]) => {
		const ids = new Set([
			...changes.map((change) => change.documentId),
			...related.filter((item) => item.kind === 'document').map((item) => item.id)
		]);
		const documents: ProjectDriftEvidence['documents'] = {};
		for (const doc of project.documents) {
			const id = String(doc.id);
			if (ids.has(id) && typeof doc.content === 'string')
				documents[id] = { title: String(doc.title ?? 'Untitled'), content: doc.content };
		}
		return documents;
	};
	const fallback = (reason: string): ProjectDriftEvidence => {
		const related = fallbackRelated(project);
		return {
			since,
			changes,
			related,
			source: 'fallback',
			ranker: null,
			fallbackReason: reason,
			documents: shownDocuments(related)
		};
	};
	if (!input.decider) return fallback('no_decider');

	try {
		const entities = buildContextFinderEntities(project);
		const ranking = await rankProjectContext({
			decider: input.decider,
			project: project.project,
			entities,
			message: buildDriftFinderRequest(changes, since),
			signal: input.signal,
			timeoutMs: DRIFT_EVIDENCE_LIMITS.jevTimeoutMs,
			usage: {
				operationType: 'project_loop_drift_finder',
				userId: input.usage?.userId,
				projectId: input.projectId
			}
		});
		if (ranking.status === 'unavailable') return fallback('jev_unavailable');
		// Changed sections stay eligible: when most of a project moved recently, the stale
		// side of the drift is often a changed section itself.
		const plan = selectProjectContext({
			entities,
			scores: ranking.scores,
			checked: ranking.checked,
			unchecked: ranking.unchecked,
			skipIds: new Set(),
			maxSummaries: 0
		});
		const related = materializeDriftRelated(plan, entities);
		if (!related.length) return fallback('jev_empty');
		return {
			since,
			changes,
			related,
			source: 'jev',
			ranker: rankerSummary(ranking),
			fallbackReason: null,
			documents: shownDocuments(related)
		};
	} catch {
		input.signal.throwIfAborted();
		return fallback('jev_error');
	}
}

/** Prompt block for the drift pass. */
export function renderDriftEvidence(evidence: ProjectDriftEvidence): string {
	const lines: string[] = [];
	lines.push(
		`RECENT CHANGES (document sections edited or added since ${evidence.since.slice(0, 10)}):`
	);
	if (!evidence.changes.length) lines.push('(none found)');
	for (const change of evidence.changes) {
		lines.push(
			'',
			`- document ${change.documentId} "${change.documentTitle}"${change.heading ? ` › ${change.heading}` : ''} (${change.change}, ${change.changedAt.slice(0, 10)}):`,
			change.text
		);
	}
	lines.push(
		'',
		evidence.source === 'jev'
			? 'RELATED SECTIONS ELSEWHERE IN THE PROJECT (selected by relevance to those changes; excerpts, not whole documents):'
			: 'PROJECT CONTEXT (START HERE sections and document openings; excerpts, not whole documents):'
	);
	for (const item of evidence.related) {
		lines.push('', `## ${item.kind} ${item.id} — ${item.title}`);
		for (const excerpt of item.excerpts)
			lines.push(...(excerpt.heading ? [`› ${excerpt.heading}`] : []), excerpt.text);
	}
	return lines.join('\n');
}
