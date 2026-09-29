// apps/worker/src/workers/project-loop/cleanupPass.ts
//
// Tasker 112: the pieces of a review pass that turn roll-up lineages into what the roll-up
// call reads and what the checks see as "already tracked". Pure; the worker does the I/O.
import type {
	ProjectCleanupCloseReason,
	ProjectCleanupClosedItem,
	ProjectCleanupSection
} from '@buildos/shared-types';
import {
	type CleanupItemFacts,
	cleanupSourceForKind,
	defaultCleanupSection,
	resolveCleanupSection
} from '@buildos/shared-agent-ops/project-cleanup';
import type { CleanupSynthesisItem } from './cleanupSynthesis';
import type { LoopContext, LoopTrackedFinding } from './generators';
import type { RollupEvent, RollupItem, RollupSubjectState } from './reviewRollup';
import { type OpenReviewRow, closeReasonDetail } from './reviewRollupStore';

const SECTIONS: readonly ProjectCleanupSection[] = ['safe_cleanup', 'needs_call', 'note'];

/** Verified facts about one live row, from the integrity check this pass. */
export interface RowVerification {
	headline: string | null;
	cautions: string[];
	/** False when the check could not run (a transient read failure): never "safe". */
	verified: boolean;
}

export interface SubjectLookup {
	titleOf(key: string): string | null;
	describe(key: string): string;
}

/** Titles and one-line current state for `type:id` subject keys, from the pass context. */
export function subjectLookup(
	ctx: LoopContext,
	states: ReadonlyMap<string, RollupSubjectState>,
	extraTitles: ReadonlyMap<string, string> = new Map()
): SubjectLookup {
	const documents = new Map(
		[...ctx.documents, ...(ctx.moreDocuments ?? [])].map((doc) => [`document:${doc.id}`, doc])
	);
	const tasks = new Map(ctx.tasks.map((task) => [`task:${task.id}`, task]));
	const goals = new Map(
		ctx.goals.filter((goal) => goal.id).map((goal) => [`goal:${goal.id}`, goal])
	);
	const titleOf = (key: string): string | null =>
		documents.get(key)?.title ??
		tasks.get(key)?.title ??
		goals.get(key)?.name ??
		extraTitles.get(key) ??
		null;
	return {
		titleOf,
		describe(key: string): string {
			const type = key.slice(0, key.indexOf(':'));
			const title = titleOf(key);
			const name = title ? `${type} "${title}"` : type;
			const state = states.get(key);
			if (state?.archived) return `${name}: archived`;
			if (state?.deleted) return `${name}: deleted`;
			const doc = documents.get(key);
			if (doc) {
				const size =
					typeof doc.content_chars === 'number'
						? doc.content_chars === 0
							? ', empty'
							: `, ${doc.content_chars} chars`
						: '';
				return `${name}: live, updated ${doc.updated_at?.slice(0, 10) ?? 'n/a'}${size}${doc.is_public ? ', has a live public page' : ''}`;
			}
			const task = tasks.get(key);
			if (task)
				return `${name}: ${task.state_key ?? 'open'}, updated ${task.updated_at?.slice(0, 10) ?? 'n/a'}`;
			const goal = goals.get(key);
			if (goal) return `${name}: ${goal.state_key ?? 'live'}`;
			return `${name}: live`;
		}
	};
}

/** Open findings as the checks see them: "already in the cleanup list". */
export function trackedFindings(
	items: readonly RollupItem[],
	lookup: Pick<SubjectLookup, 'titleOf'>
): LoopTrackedFinding[] {
	return items
		.filter((item) => item.status === 'open' && item.kind !== 'audit_recommendation')
		.map((item) => ({
			kind: item.kind,
			title: item.title,
			about: item.subjects
				.map((key) => lookup.titleOf(key))
				.filter((title): title is string => Boolean(title))
		}));
}

/** Document ids above a document, nearest first, from the pass's parent links. */
export function ancestorsFrom(ctx: LoopContext): (documentId: string) => string[] {
	const parentById = new Map(
		[...ctx.documents, ...(ctx.moreDocuments ?? [])].map((doc) => [doc.id, doc.parent_id])
	);
	return (documentId: string) => {
		const ancestors: string[] = [];
		let current = parentById.get(documentId) ?? null;
		while (current && !ancestors.includes(current) && ancestors.length < 20) {
			ancestors.push(current);
			current = parentById.get(current) ?? null;
		}
		return ancestors;
	};
}

function toolsOf(rows: readonly OpenReviewRow[]): string[] {
	return [...new Set(rows.flatMap((row) => row.operations.map((operation) => operation.tool)))];
}

/** Code's facts for the section floor, over the rows that carry the finding. */
export function cleanupFacts(
	item: RollupItem,
	rows: readonly OpenReviewRow[],
	verification: ReadonlyMap<string, RowVerification>
): CleanupItemFacts {
	const executableRows = rows.filter((row) => row.operations.length > 0);
	const verified = executableRows.every((row) => verification.get(row.id)?.verified ?? false);
	return {
		source: cleanupSourceForKind(item.kind),
		kind: item.kind,
		executable: executableRows.length > 0,
		reversible: rows.some((row) => row.reversible === false) ? false : true,
		tools: toolsOf(executableRows),
		cautions: [
			...rows.flatMap((row) => verification.get(row.id)?.cautions ?? []),
			// An unverified change is never "ready to apply".
			...(executableRows.length && !verified ? ['Not verified this pass.'] : [])
		],
		hasReviewItems: false
	};
}

/** Sections code allows for an item, its default first. */
export function allowedSections(facts: CleanupItemFacts): ProjectCleanupSection[] {
	const fallback = defaultCleanupSection(facts);
	const allowed = SECTIONS.filter((section) => resolveCleanupSection(section, facts) === section);
	return [fallback, ...allowed.filter((section) => section !== fallback)];
}

export function synthesisItems(params: {
	items: readonly RollupItem[];
	rowsById: ReadonlyMap<string, OpenReviewRow>;
	verification: ReadonlyMap<string, RowVerification>;
	openedThisPass: ReadonlySet<string>;
	lookup: SubjectLookup;
}): CleanupSynthesisItem[] {
	const open = params.items.filter((item) => item.status === 'open' && item.rows.length);
	return open.map((item, index) => {
		const rows = item.rows
			.map((row) => params.rowsById.get(row.suggestionId))
			.filter((row): row is OpenReviewRow => Boolean(row));
		const latest = [...rows].sort((a, b) => a.updated_at.localeCompare(b.updated_at)).at(-1);
		const facts = cleanupFacts(item, rows, params.verification);
		const headlines = rows
			.map((row) =>
				row.operations.length
					? (params.verification.get(row.id)?.headline ??
						row.operations
							.map((operation) => operation.label)
							.filter(Boolean)
							.join('; '))
					: null
			)
			.filter((line): line is string => Boolean(line));
		return {
			handle: `i${index + 1}`,
			lineageId: item.lineageId,
			kind: item.kind,
			source: cleanupSourceForKind(item.kind),
			title: item.title,
			summary: clip(latest?.rationale ?? latest?.why_now ?? null, 240),
			change: headlines.length ? clip(headlines.join(' · '), 400) : null,
			executable: facts.executable,
			fresh: params.openedThisPass.has(item.lineageId),
			firstSeenAt: item.firstSeenAt,
			seenCount: item.seenInRuns.length,
			about: item.subjects.slice(0, 6).map((key) => params.lookup.describe(key)),
			cautions: facts.cautions,
			allowedSections: allowedSections(facts),
			judged: item.kind !== 'audit_recommendation'
		};
	});
}

function clip(value: string | null, max: number): string | null {
	if (!value) return null;
	const text = value.trim();
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const CARD_CLOSE_REASONS = new Set<ProjectCleanupCloseReason>([
	'subject_archived',
	'subject_deleted',
	'already_done',
	'no_longer_applies',
	'resolved',
	'aged_out'
]);

/** Findings that left the list this pass, in the card's words. Revisions and merges are not closes. */
export function closedThisPass(
	events: readonly RollupEvent[],
	titleOf: (lineageId: string) => string
): ProjectCleanupClosedItem[] {
	const closed: ProjectCleanupClosedItem[] = [];
	for (const event of events) {
		if (event.type !== 'closed') continue;
		const reason = event.reason as ProjectCleanupCloseReason;
		if (!CARD_CLOSE_REASONS.has(reason)) continue;
		closed.push({
			lineage_id: event.lineageId,
			title: titleOf(event.lineageId),
			reason,
			detail: closeReasonDetail(event.reason, event.detail)
		});
	}
	return closed;
}
