// packages/agentic-chat-runtime/src/working-set/working-set.ts
//
// Carry a turn's context forward (tasker 151, moved here for real chat in tasker 153). A turn
// ends with a small working set per project:
//   carry:   the records and document sections the turn used. The next turn starts with their
//            text already loaded, so it doesn't read them again.
//   scanned: everything else it looked at, shown to the next turn as a short note.
// The working set holds pointers (ids, section anchors, the record version), never text. The
// next turn loads the text again, and only when the record hasn't changed. Ids are checked
// against that turn's project index, so a forged id loads nothing.
//
// Pure: no I/O. Callers run the reads.
import type { ContextFinderEntity } from '../context-finder/packets';

export type WorkingSetKind = 'document' | 'task' | 'goal' | 'plan' | 'milestone' | 'risk';

function clip(text: string, max: number): string {
	const clean = text.replace(/\s+/g, ' ').trim();
	return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Carried text per project, per turn. Over this, the oldest items become a note. */
export const CARRY_MAX_CHARS = 10_000;
/** Turns an item may go unused before it drops from carried text to the note. */
export const CARRY_IDLE_TURNS = 2;
/** A document read whole carries only when it is this short; longer ones carry by section. */
export const CARRY_WHOLE_DOC_MAX_CHARS = 4_000;
/** Scanned items listed by name; the rest are a count. */
export const SCANNED_SHOWN = 12;
/** Size guess for a record that was kept but not read this turn. */
const RECORD_GUESS_CHARS = 1_200;

export type CarryItem = {
	id: string;
	kind: WorkingSetKind;
	title: string;
	/** Document sections, as `read_document_section` anchors. Empty = the whole record or short doc. */
	anchors: string[];
	headings: string[];
	/** The record's version (updated_at) when its text was last loaded. */
	version: string | null;
	/** Size of the carried text. */
	chars: number;
	/** Turns since a decision or keep line last used it; 0 = used this turn. */
	idle: number;
};

export type ScannedItem = { id: string; kind: WorkingSetKind; title: string };

export type WorkingSet = { carry: CarryItem[]; scanned: ScannedItem[]; scannedCount: number };

export const EMPTY_WORKING_SET: WorkingSet = Object.freeze({
	carry: [],
	scanned: [],
	scannedCount: 0
}) as WorkingSet;

/** One read the thread made this turn. */
export type ReadTrace = Omit<CarryItem, 'idle'> & {
	/** A document read without naming sections. */
	whole: boolean;
	/** The document's full length when known. */
	docChars: number | null;
};

export type KeepLine = { items: { ref: string; sections: string[] }[] };

// ---------------------------------------------------------------------------
// Start of a turn: what to load
// ---------------------------------------------------------------------------

export type RehydratePlan = {
	/** Unchanged since last turn: load their text now. */
	load: { item: CarryItem; entity: ContextFinderEntity }[];
	/** Edited since last turn: not loaded; the thread rereads if it needs them. */
	changed: { item: CarryItem; entity: ContextFinderEntity }[];
	/** Kept but past the budget: listed as a note. */
	over: { item: CarryItem; entity: ContextFinderEntity }[];
	/** Archived, deleted, or not in this project (or a forged id): dropped. */
	gone: CarryItem[];
};

export function planRehydrate(
	carry: readonly CarryItem[],
	byId: ReadonlyMap<string, ContextFinderEntity>
): RehydratePlan {
	const plan: RehydratePlan = { load: [], changed: [], over: [], gone: [] };
	let budget = CARRY_MAX_CHARS;
	for (const item of [...carry].sort((a, b) => a.idle - b.idle)) {
		const entity = byId.get(item.id);
		if (!entity || entity.kind !== item.kind) {
			plan.gone.push(item);
			continue;
		}
		if (item.version !== null && entity.version !== item.version) {
			plan.changed.push({ item, entity });
			continue;
		}
		if (item.chars > budget) {
			plan.over.push({ item, entity });
			continue;
		}
		budget -= item.chars;
		plan.load.push({ item, entity });
	}
	return plan;
}

const KIND_WORD: Record<WorkingSetKind, string> = {
	document: 'doc',
	task: 'task',
	goal: 'goal',
	plan: 'plan',
	milestone: 'milestone',
	risk: 'risk'
};

export function carryLabel(item: Pick<CarryItem, 'kind' | 'title' | 'headings'>): string {
	const title = clip(item.title, 50);
	if (item.headings.length)
		return `${title} › ${item.headings.map((h) => clip(h, 30)).join(', ')}`;
	return item.kind === 'document' ? title : `${KIND_WORD[item.kind]} ${title}`;
}

/** The "Carried from last turn" block at the top of the thread prompt. */
export function carriedBlock(input: {
	loaded: { item: CarryItem; ref: string; text: string }[];
	changed: { item: CarryItem; ref: string }[];
	over: { item: CarryItem; ref: string }[];
	scanned: { ref: string; title: string }[];
	scannedCount: number;
}): string {
	if (
		!input.loaded.length &&
		!input.changed.length &&
		!input.over.length &&
		!input.scanned.length
	)
		return '';
	const lines: string[] = [];
	if (input.loaded.length) {
		lines.push(
			"Carried from last turn (already loaded below; don't read these sections again):"
		);
		for (const { item, ref, text } of input.loaded) {
			lines.push(`--- ↺ ${ref} · ${carryLabel(item)}`, text.trim());
		}
		lines.push('--- end of carried text');
	}
	if (input.changed.length) {
		lines.push(
			`Changed since last turn (read again if a piece needs it): ${input.changed
				.map(({ item, ref }) => `${ref} ${carryLabel(item)}`)
				.join(' · ')}`
		);
	}
	const seen = [
		...input.over.map(({ item, ref }) => `${ref} ${carryLabel(item)}`),
		...input.scanned.map(({ ref, title }) => `${ref} ${clip(title, 50)}`)
	];
	if (seen.length) {
		const hidden = Math.max(0, input.scannedCount - input.scanned.length);
		lines.push(
			`Looked at before, not loaded (read one if you need it): ${seen.join(' · ')}${hidden ? ` (+${hidden} more)` : ''}`
		);
	}
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// End of a turn: what to carry
// ---------------------------------------------------------------------------

/** Long documents read whole are too big to carry; the keep line narrows them to sections. */
function carryable(item: Pick<CarryItem, 'kind' | 'anchors' | 'chars'>): boolean {
	return (
		item.kind !== 'document' ||
		item.anchors.length > 0 ||
		item.chars <= CARRY_WHOLE_DOC_MAX_CHARS
	);
}

/** A keep-line item, resolved against this turn's index. */
export type KeptItem = Omit<CarryItem, 'idle' | 'chars'> & { chars: number | null };

export function keptItem(
	entity: ContextFinderEntity,
	resolved: { anchors: string[]; headings: string[] } | null,
	readChars: number | null
): KeptItem {
	let chars = readChars;
	if (resolved?.anchors.length) {
		chars = entity.sections
			.filter((section) => section.anchor && resolved.anchors.includes(section.anchor))
			.reduce((total, section) => total + Math.max(0, section.end - section.start), 0);
	}
	if (!chars) {
		const known = (entity as { textChars?: number | null }).textChars;
		chars =
			entity.kind === 'document'
				? (known ?? (entity.fullText.length || null))
				: entity.fullText.length || RECORD_GUESS_CHARS;
	}
	return {
		id: entity.id,
		kind: entity.kind as WorkingSetKind,
		title: entity.title,
		anchors: resolved?.anchors ?? [],
		headings: resolved?.headings ?? [],
		version: entity.version ?? null,
		chars
	};
}

export function buildWorkingSet(input: {
	/** Last turn's carry that was still valid this turn (loaded, changed or over budget). */
	carriedIn: readonly CarryItem[];
	/** Reads this turn actually ran. */
	reads: readonly ReadTrace[];
	/** Ids the turn's decision lines cite. */
	used: ReadonlySet<string>;
	/** The keep line, resolved; null when the thread didn't write one. */
	keep: readonly KeptItem[] | null;
	/** Records the search picked this turn. */
	related: readonly ScannedItem[];
	previousScanned: readonly ScannedItem[];
}): WorkingSet {
	const next = new Map<string, CarryItem>();
	const put = (item: CarryItem) => {
		if (!carryable(item)) return;
		const existing = next.get(item.id);
		if (!existing) {
			next.set(item.id, { ...item });
			return;
		}
		// Same record twice: union the sections, keep the freshest version.
		if (!existing.anchors.length || !item.anchors.length) {
			next.set(item.id, {
				...existing,
				anchors: [],
				headings: [],
				chars: Math.max(existing.chars, item.chars),
				idle: Math.min(existing.idle, item.idle)
			});
			return;
		}
		const anchors = [...existing.anchors];
		const headings = [...existing.headings];
		item.anchors.forEach((anchor, index) => {
			if (anchors.includes(anchor)) return;
			anchors.push(anchor);
			headings.push(item.headings[index] ?? anchor);
		});
		const added = anchors.length - existing.anchors.length;
		const chars =
			existing.chars + Math.round((item.chars * added) / Math.max(1, item.anchors.length));
		// Too much together: keep what was put first (this turn's reads) rather than lose both.
		if (chars > CARRY_MAX_CHARS) return;
		next.set(item.id, {
			...existing,
			anchors,
			headings,
			chars,
			idle: Math.min(existing.idle, item.idle)
		});
	};

	if (input.keep) {
		const readChars = new Map(input.reads.map((read) => [read.id, read.chars]));
		for (const kept of input.keep) {
			put({
				...kept,
				chars: kept.chars ?? readChars.get(kept.id) ?? RECORD_GUESS_CHARS,
				idle: 0
			});
		}
	} else {
		for (const read of input.reads) {
			if (!input.used.has(read.id)) continue;
			const chars =
				read.whole && read.kind === 'document' ? (read.docChars ?? read.chars) : read.chars;
			put({
				id: read.id,
				kind: read.kind,
				title: read.title,
				anchors: read.anchors,
				headings: read.headings,
				version: read.version,
				chars,
				idle: 0
			});
		}
		for (const item of input.carriedIn) if (input.used.has(item.id)) put({ ...item, idle: 0 });
	}
	// Carried items nobody used this turn fade: still loaded next turn, then a note.
	for (const item of input.carriedIn) {
		if (next.has(item.id)) continue;
		const idle = item.idle + 1;
		if (idle < CARRY_IDLE_TURNS) put({ ...item, idle });
	}

	const carry: CarryItem[] = [];
	const overflow: ScannedItem[] = [];
	let budget = CARRY_MAX_CHARS;
	for (const item of [...next.values()].sort((a, b) => a.idle - b.idle)) {
		if (item.chars > budget) {
			overflow.push(item);
			continue;
		}
		budget -= item.chars;
		carry.push(item);
	}

	const carried = new Set(carry.map((item) => item.id));
	const scanned: ScannedItem[] = [];
	const seen = new Set<string>();
	for (const item of [
		...overflow,
		...input.reads,
		...input.carriedIn,
		...input.related,
		...input.previousScanned
	]) {
		if (carried.has(item.id) || seen.has(item.id)) continue;
		seen.add(item.id);
		scanned.push({ id: item.id, kind: item.kind, title: item.title });
	}
	return { carry, scanned: scanned.slice(0, SCANNED_SHOWN), scannedCount: scanned.length };
}

/** One line for the planner: what this project's thread is working on. */
export function workingOnLine(set: Pick<WorkingSet, 'carry' | 'scannedCount'>): string {
	if (!set.carry.length) return '';
	return `working on: ${set.carry.map((item) => carryLabel(item)).join('; ')}`;
}

// ---------------------------------------------------------------------------
// Real chat (tasker 153, phase B): the working set from a finished turn's tool calls
// ---------------------------------------------------------------------------

/** Stored on the turn's `last_turn_context` as `working_set`: pointers only. */
export type TurnWorkingSetV1 = {
	version: 1;
	project_id: string;
	carry: CarryItem[];
	scanned: ScannedItem[];
	scanned_count: number;
};

/** One finished tool call, as the worker's finalizer holds it. */
export type WorkingSetToolExecution = {
	toolName: string;
	arguments: unknown;
	result: unknown;
	success: boolean;
};

const RECORD_KINDS: readonly WorkingSetKind[] = ['task', 'goal', 'plan', 'milestone', 'risk'];
const MAX_TURN_CARRY_ITEMS = 12;

const asRecord = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;

const text = (value: unknown): string | null =>
	typeof value === 'string' && value.trim() ? value.trim() : null;

function parseArgs(value: unknown): Record<string, unknown> {
	if (typeof value === 'string') {
		try {
			return asRecord(JSON.parse(value)) ?? {};
		} catch {
			return {};
		}
	}
	return asRecord(value) ?? {};
}

/** The tool's own payload: executions wrap it as `{ result }` on some paths. */
function payloadOf(result: unknown): Record<string, unknown> | null {
	const outer = asRecord(result);
	if (!outer) return null;
	return asRecord(outer.result) && !('document_id' in outer) ? asRecord(outer.result) : outer;
}

/** The record a detail read or a write returned: `{ task: {...} }`, `{ document: {...} }`. */
function recordIn(
	payload: Record<string, unknown>
): { kind: WorkingSetKind; row: Record<string, unknown> } | null {
	for (const kind of ['document', ...RECORD_KINDS] as WorkingSetKind[]) {
		const row = asRecord(payload[kind]);
		if (row && text(row.id)) return { kind, row };
	}
	return null;
}

/**
 * What a finished project-chat turn used, as a working set for the next turn:
 *   - document sections it read (`read_document_section` anchors);
 *   - records it opened in detail, and short documents read whole;
 *   - records it created or changed.
 * Search and list results don't count: the model didn't choose to open them. Only records in
 * the chat's own project are kept. Null when the turn used nothing.
 */
export function buildTurnWorkingSetV1(input: {
	projectId: string;
	executions: readonly WorkingSetToolExecution[];
	/** Last turn's carry, for fading items this turn didn't touch. */
	carriedIn?: readonly CarryItem[];
	previousScanned?: readonly ScannedItem[];
}): TurnWorkingSetV1 | null {
	const reads: ReadTrace[] = [];
	const used = new Set<string>();
	const inProject = (row: Record<string, unknown>) =>
		text(row.project_id) === null || text(row.project_id) === input.projectId;

	for (const execution of input.executions) {
		if (!execution.success) continue;
		const payload = payloadOf(execution.result);
		if (!payload) continue;
		const args = parseArgs(execution.arguments);

		if (execution.toolName === 'read_document_section') {
			const id = text(payload.document_id) ?? text(args.document_id);
			if (!id || text(payload.project_id) !== input.projectId || payload.found === false)
				continue;
			// The tool answers in three shapes (`readDocumentSection` in tools/ontology-reads.ts):
			// several sections as `sections[]`, one section as top-level `anchor`/`heading`
			// (also when the other requested anchors sat inside it), or the body with neither.
			const totalChars =
				typeof payload.total_chars === 'number'
					? payload.total_chars
					: typeof payload.content === 'string'
						? payload.content.length
						: 0;
			const single = text(payload.anchor);
			const sections = Array.isArray(payload.sections)
				? payload.sections.flatMap((entry) => {
						const section = asRecord(entry);
						const anchor = section && text(section.anchor);
						return section && anchor
							? [
									{
										anchor,
										heading: text(section.heading) ?? anchor,
										chars: typeof section.chars === 'number' ? section.chars : 0
									}
								]
							: [];
					})
				: single
					? [
							{
								anchor: single,
								heading: text(payload.heading) ?? single,
								chars: totalChars
							}
						]
					: [];
			const bodyChars = totalChars;
			reads.push({
				id,
				kind: 'document',
				title: text(payload.title) ?? 'Document',
				anchors: sections.map((section) => section.anchor),
				headings: sections.map((section) => section.heading),
				version: null,
				chars: sections.length
					? sections.reduce((total, section) => total + section.chars, 0)
					: bodyChars,
				whole: sections.length === 0,
				docChars: sections.length ? null : bodyChars
			});
			used.add(id);
			continue;
		}

		const found = recordIn(payload);
		if (!found || !inProject(found.row)) continue;
		const id = text(found.row.id)!;
		const isDetail = /^get_onto_[a-z]+_details$/.test(execution.toolName);
		const isWrite = /^(create|update)_onto_[a-z]+$/.test(execution.toolName);
		if (!isDetail && !isWrite) continue;
		// A written document's text changed under it; the next turn reads it fresh.
		if (isWrite && found.kind === 'document') continue;
		const content = typeof found.row.content === 'string' ? found.row.content : '';
		const description = typeof found.row.description === 'string' ? found.row.description : '';
		reads.push({
			id,
			kind: found.kind,
			title: text(found.row.title) ?? text(found.row.name) ?? found.kind,
			anchors: [],
			headings: [],
			// Carried text always reloads from the current index, so it is never stale; the
			// version only marks "changed since", which real chat doesn't need yet.
			version: null,
			chars:
				found.kind === 'document'
					? content.length
					: Math.max(200, Math.min(RECORD_GUESS_CHARS, description.length + 200)),
			whole: found.kind === 'document',
			docChars: found.kind === 'document' ? content.length : null
		});
		used.add(id);
	}

	const set = buildWorkingSet({
		carriedIn: input.carriedIn ?? [],
		reads,
		used,
		keep: null,
		related: [],
		previousScanned: input.previousScanned ?? []
	});
	if (!set.carry.length && !set.scanned.length) return null;
	return {
		version: 1,
		project_id: input.projectId,
		carry: set.carry.slice(0, MAX_TURN_CARRY_ITEMS),
		scanned: set.scanned,
		scanned_count: set.scannedCount
	};
}

/** A stored working set, checked; null for anything malformed or for another project. */
export function readTurnWorkingSetV1(value: unknown, projectId: string): TurnWorkingSetV1 | null {
	const raw = asRecord(value);
	if (!raw || raw.version !== 1 || raw.project_id !== projectId) return null;
	const kinds = new Set<string>(['document', ...RECORD_KINDS]);
	const strings = (list: unknown) =>
		Array.isArray(list)
			? list.filter((entry): entry is string => typeof entry === 'string')
			: [];
	const carry: CarryItem[] = (Array.isArray(raw.carry) ? raw.carry : []).flatMap((entry) => {
		const item = asRecord(entry);
		if (!item || !text(item.id) || !kinds.has(String(item.kind))) return [];
		return [
			{
				id: text(item.id)!,
				kind: item.kind as WorkingSetKind,
				title: text(item.title) ?? '',
				anchors: strings(item.anchors).slice(0, 8),
				headings: strings(item.headings).slice(0, 8),
				version: text(item.version),
				chars:
					typeof item.chars === 'number' && item.chars >= 0
						? item.chars
						: RECORD_GUESS_CHARS,
				idle: typeof item.idle === 'number' && item.idle >= 0 ? item.idle : 0
			}
		];
	});
	const scanned: ScannedItem[] = (Array.isArray(raw.scanned) ? raw.scanned : []).flatMap(
		(entry) => {
			const item = asRecord(entry);
			return item && text(item.id) && kinds.has(String(item.kind))
				? [
						{
							id: text(item.id)!,
							kind: item.kind as WorkingSetKind,
							title: text(item.title) ?? ''
						}
					]
				: [];
		}
	);
	return {
		version: 1,
		project_id: projectId,
		carry: carry.slice(0, MAX_TURN_CARRY_ITEMS),
		scanned: scanned.slice(0, SCANNED_SHOWN),
		scanned_count: typeof raw.scanned_count === 'number' ? raw.scanned_count : scanned.length
	};
}

// ---------------------------------------------------------------------------
// Real chat: the next turn reloads what the last one used
// ---------------------------------------------------------------------------

/**
 * Step 1, before any text loads: which carried items still exist in this project (titles and
 * section anchors taken from the current index, never from the stored set), and which documents
 * need their text read.
 */
export function planTurnCarry(input: {
	set: TurnWorkingSetV1;
	entities: readonly ContextFinderEntity[];
}): { plan: RehydratePlan; textIds: string[] } {
	const byId = new Map(input.entities.map((entity) => [entity.id, entity]));
	const plan = planRehydrate(input.set.carry, byId);
	const trust = (entry: { item: CarryItem; entity: ContextFinderEntity }) => {
		const anchors = entry.item.anchors.filter((anchor) =>
			entry.entity.sections.some((section) => section.anchor === anchor)
		);
		return {
			entity: entry.entity,
			item: {
				...entry.item,
				title: entry.entity.title,
				anchors,
				headings: anchors.map(
					(anchor) =>
						entry.entity.sections.find((section) => section.anchor === anchor)
							?.heading ?? anchor
				)
			}
		};
	};
	// A carried section that no longer exists drops the item; it never widens to the whole doc.
	const lost = (entry: { item: CarryItem }) =>
		entry.item.kind === 'document' &&
		entry.item.anchors.length > 0 &&
		!byId
			.get(entry.item.id)
			?.sections.some(
				(section) => section.anchor && entry.item.anchors.includes(section.anchor)
			);
	for (const key of ['load', 'changed', 'over'] as const) {
		plan.gone.push(...plan[key].filter(lost).map((entry) => entry.item));
		plan[key] = plan[key].filter((entry) => !lost(entry)).map(trust);
	}
	return {
		plan,
		textIds: plan.load
			.filter(({ entity }) => entity.kind === 'document' && !entity.textLoaded)
			.map(({ entity }) => entity.id)
	};
}

/** The carried text of one item: its sections, a short document whole, or the record. */
export function carriedText(item: CarryItem, entity: ContextFinderEntity): string {
	if (entity.kind !== 'document') return entity.fullText.trim();
	if (!entity.textLoaded) return '';
	if (!item.anchors.length) return entity.fullText.trim();
	const picked = entity.sections.filter(
		(section) => section.anchor && item.anchors.includes(section.anchor)
	);
	// A section includes its subsections: skip one that sits inside another picked section.
	return picked
		.filter(
			(section) =>
				!picked.some(
					(other) =>
						other !== section &&
						other.start <= section.start &&
						section.end <= other.end &&
						(other.start < section.start || section.end < other.end)
				)
		)
		.map((section) => entity.fullText.slice(section.start, section.end).trim())
		.filter(Boolean)
		.join('\n\n');
}

/**
 * Step 2, once document text is in: the "Carried from last turn" block for the prompt, the
 * items it loaded, and `carryIn` (everything still valid) for the end of the turn to fade.
 * Real chat cites records by id, so the block shows ids where the lab showed refs.
 */
export function renderTurnCarry(input: {
	set: TurnWorkingSetV1;
	plan: RehydratePlan;
	entities: readonly ContextFinderEntity[];
}): { block: string; loaded: CarryItem[]; carryIn: TurnWorkingSetV1 } {
	const byId = new Map(input.entities.map((entity) => [entity.id, entity]));
	const loaded: { item: CarryItem; text: string }[] = [];
	const over = [...input.plan.over];
	let room = CARRY_MAX_CHARS;
	for (const { item, entity: planned } of input.plan.load) {
		const entity = byId.get(item.id) ?? planned;
		const body = carriedText(item, entity);
		if (!body) continue;
		if (body.length > room) {
			over.push({ item, entity });
			continue;
		}
		room -= body.length;
		loaded.push({ item: { ...item, chars: body.length }, text: body });
	}
	const ref = (item: CarryItem) => `${item.kind} ${item.id}`;
	const scanned = input.set.scanned.filter((entry) => byId.has(entry.id));
	const block = carriedBlock({
		loaded: loaded.map(({ item, text: body }) => ({ item, ref: ref(item), text: body })),
		changed: input.plan.changed.map(({ item }) => ({ item, ref: ref(item) })),
		over: over.map(({ item }) => ({ item, ref: ref(item) })),
		scanned: scanned.map((entry) => ({ ref: `${entry.kind} ${entry.id}`, title: entry.title })),
		scannedCount:
			scanned.length + Math.max(0, input.set.scanned_count - input.set.scanned.length)
	});
	return {
		block,
		loaded: loaded.map(({ item }) => item),
		carryIn: {
			version: 1,
			project_id: input.set.project_id,
			carry: [
				...loaded.map(({ item }) => item),
				...over.map(({ item }) => item),
				...input.plan.changed.map(({ item }) => item)
			],
			scanned,
			scanned_count: input.set.scanned_count
		}
	};
}
