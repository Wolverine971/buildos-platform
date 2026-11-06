// packages/agentic-chat-runtime/src/context-finder/packets.ts
//
// One condensed packet per project entity, plus the section index of every document.
// Production packet shape validated in the 2026-09-22 context evaluation.
// Stable refs (d0, t3, …) identify entities in context-finder questions.
//
// Documents are outline-first (tasker 150): a packet needs only the title, description, type
// and headings, which come from the stored `onto_documents.outline` cache. Document text loads
// later, only for the documents a plan picks (`loadContextFinderPlanText`).
import {
	extractOutline,
	type DocOutlineNode
} from '@buildos/shared-agent-ops/utils/document-outline';
import { flattenOutlineNodes } from '../loop/document-read-budget';
import {
	freshDigestSummary,
	plainOutlineHeading
} from '@buildos/shared-agent-ops/utils/document-card';

export type ContextFinderKind = 'document' | 'task' | 'goal' | 'plan' | 'milestone' | 'risk';

type Row = Record<string, unknown>;

/** One document's text, read after a plan picks it. */
export type ContextFinderDocumentText = { content: string; contentHash: string | null };

/**
 * Reads the text of the given documents, scoped to the same project and authority as the
 * loader that made it. Missing ids are documents deleted or moved since the load.
 */
export type ContextFinderDocumentTextSource = (
	ids: readonly string[],
	signal?: AbortSignal
) => Promise<Map<string, ContextFinderDocumentText>>;

/**
 * Raw rows the host loads with its own access check. Order is preserved in refs.
 * Document rows carry `outline` and `content_hash` (load.ts); `content` only when the stored
 * outline was missing or stale, or when a test or replay supplies it.
 */
export type ContextFinderProjectV1 = {
	project: { id: string; name: string; description?: string | null };
	documents: Row[];
	tasks: Row[];
	goals: Row[];
	plans: Row[];
	milestones: Row[];
	risks: Row[];
	/** Loads picked documents' text; absent when every document row already has `content`. */
	documentText?: ContextFinderDocumentTextSource;
};

export type ContextFinderSection = {
	heading: string;
	level: number;
	/** Heading slug; `read_document_section` takes it. Absent for legacy parsed sections. */
	anchor?: string;
	/** Character offset of the heading line inside the document. */
	start: number;
	/** End offset: the next heading at the same or a higher level, or the end of the text. */
	end: number;
	/** Heading line plus everything until `end`; empty until the document text loads. */
	body: string;
};

export type ContextFinderEntity = {
	/** Compact handle Jev sees, e.g. d3; stable for one project snapshot. */
	ref: string;
	id: string;
	kind: ContextFinderKind;
	title: string;
	/** Record version used for citation (updated_at or created_at). */
	version: string;
	packet: Record<string, unknown>;
	/**
	 * What loading this entity in full injects: the record, or the whole document body.
	 * Documents: empty until `textLoaded`.
	 */
	fullText: string;
	/** Records: always. Documents: once their text is attached (`withContextFinderText`). */
	textLoaded: boolean;
	/** Length of the whole text when known; the outline gives it for a document with headings. */
	textChars: number | null;
	/** Hash of the text `sections` were measured against, when known. */
	textHash: string | null;
	sections: ContextFinderSection[];
	/** The headings shown to Jev and asked about; their index is the question index. */
	packetHeadings: ContextFinderSection[];
	/** Documents: the description, else the fresh AI summary (`digest`), for cards (tasker 152). */
	summary?: string | null;
};

export const CONTEXT_FINDER_PACKET_LIMITS = Object.freeze({
	/** Median real description is 109–133 chars. */
	documentDescriptionChars: 150,
	textChars: 160,
	maxPacketHeadings: 40,
	headingChars: 70
});

// Markdown headings are a structured format, so parsing them lexically is fine.
export function parseContextFinderSections(markdown: string): ContextFinderSection[] {
	const lines = (markdown ?? '').split('\n');
	const offsets: number[] = [];
	let position = 0;
	for (const line of lines) {
		offsets.push(position);
		position += line.length + 1;
	}
	const heads: { index: number; level: number; heading: string }[] = [];
	let fenced = false;
	lines.forEach((line, index) => {
		if (/^\s*```/.test(line)) fenced = !fenced;
		if (fenced) return;
		const match = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
		if (match) heads.push({ index, level: match[1]!.length, heading: match[2]! });
	});
	return heads.map((head, i) => {
		let end = lines.length;
		for (let j = i + 1; j < heads.length; j++) {
			if (heads[j]!.level <= head.level) {
				end = heads[j]!.index;
				break;
			}
		}
		const body = lines.slice(head.index, end).join('\n');
		return {
			heading: head.heading,
			level: head.level,
			start: offsets[head.index]!,
			end: offsets[head.index]! + body.length,
			body
		};
	});
}

export const clipContextText = (value: unknown, max: number): string => {
	const text = String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

export const clipContextWords = (value: unknown, max: number): string => {
	const text = clipContextText(value, 10_000);
	if (text.length <= max) return text;
	const cut = text.slice(0, max - 1);
	const space = cut.lastIndexOf(' ');
	return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
};

/** Headings deeper than H3 stay out of packets and excerpts, as with the markdown parser. */
const MAX_SECTION_LEVEL = 3;

// Heading HTML → plain words; shared with the document cards (tasker 152).
export { plainOutlineHeading };

type StoredOutline = { content_hash: string; nodes: DocOutlineNode[] };

function storedOutline(value: unknown): StoredOutline | null {
	if (!value || typeof value !== 'object') return null;
	const outline = value as Record<string, unknown>;
	return typeof outline.content_hash === 'string' && Array.isArray(outline.nodes)
		? (outline as unknown as StoredOutline)
		: null;
}

function outlineSections(
	nodes: readonly DocOutlineNode[],
	content: string | null
): ContextFinderSection[] {
	return flattenOutlineNodes(nodes)
		.filter((node) => node.level <= MAX_SECTION_LEVEL)
		.map((node) => ({
			heading: plainOutlineHeading(node.text),
			level: node.level,
			anchor: node.anchor,
			start: node.char_start,
			end: node.char_end,
			body: content === null ? '' : content.slice(node.char_start, node.char_end).trimEnd()
		}))
		.filter((section) => section.heading.length > 0);
}

type DocumentTextFields = Pick<
	ContextFinderEntity,
	'fullText' | 'textLoaded' | 'textChars' | 'textHash' | 'sections'
>;

/**
 * A document's sections from its stored outline when that outline matches the text
 * (`content_hash`), otherwise from the text itself. Without text, the sections carry offsets
 * and anchors but no bodies.
 */
function documentTextFields(doc: Row): DocumentTextFields {
	const content = typeof doc.content === 'string' ? doc.content : null;
	const hash = typeof doc.content_hash === 'string' ? doc.content_hash : null;
	const stored = storedOutline(doc.outline);
	if (content === null) {
		// The loader reads `content` for every document whose outline is missing or stale, so
		// an outline here matches its text; a host that sends no hash is trusted the same way.
		const outline = stored && (hash === null || stored.content_hash === hash) ? stored : null;
		const sections = outline ? outlineSections(outline.nodes, null) : [];
		const ends = outline ? flattenOutlineNodes(outline.nodes).map((node) => node.char_end) : [];
		return {
			fullText: '',
			textLoaded: false,
			// A section runs to the next heading or the end, so the last end is the length.
			textChars: ends.length ? Math.max(...ends) : null,
			textHash: outline?.content_hash ?? hash,
			sections
		};
	}
	const outline = stored && hash !== null && stored.content_hash === hash ? stored : null;
	const nodes = outline?.nodes ?? extractOutline(content).nodes;
	return {
		fullText: content,
		textLoaded: true,
		textChars: content.length,
		textHash: hash,
		sections: outlineSections(nodes, content)
	};
}

/**
 * The entity with its document text attached: section bodies sliced from the stored offsets
 * when the text is the one they were measured on, otherwise re-measured from the text.
 */
export function withContextFinderText(
	entity: ContextFinderEntity,
	text: ContextFinderDocumentText
): ContextFinderEntity {
	if (entity.kind !== 'document') return entity;
	const content = text.content;
	const base = {
		...entity,
		fullText: content,
		textLoaded: true,
		textChars: content.length,
		textHash: text.contentHash
	};
	// A table's generated body has no headings; its packet lists columns instead.
	if (entity.packet.table) return base;
	const same = text.contentHash !== null && text.contentHash === entity.textHash;
	if (!same)
		return { ...base, sections: outlineSections(extractOutline(content).nodes, content) };
	const fill = (section: ContextFinderSection) => ({
		...section,
		body: content.slice(section.start, section.end).trimEnd()
	});
	return {
		...base,
		sections: entity.sections.map(fill),
		packetHeadings: entity.packetHeadings.map(fill)
	};
}

const day = (value: unknown) => (typeof value === 'string' ? value.slice(0, 10) : undefined);
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));

function pickPacketHeadings(title: string, sections: ContextFinderSection[]) {
	// The H1 usually repeats the title; it adds nothing to a packet.
	const pool = sections.filter(
		(section, i) =>
			!(
				i === 0 &&
				section.level === 1 &&
				clipContextText(section.heading, 200) === clipContextText(title, 200)
			)
	);
	const max = CONTEXT_FINDER_PACKET_LIMITS.maxPacketHeadings;
	if (pool.length <= max) return pool;
	// Over the cap: keep every H1/H2 so no whole part of the document vanishes, then fill
	// the remaining slots with H3s in document order.
	const keep = new Set(pool.filter((section) => section.level <= 2).slice(0, max));
	for (const section of pool) {
		if (keep.size >= max) break;
		keep.add(section);
	}
	return pool.filter((section) => keep.has(section));
}

function version(row: Row): string {
	return text(row.updated_at || row.created_at || 'unknown').slice(0, 128);
}

/** Structured type_key check (mirrors `isTableTypeKey` in shared-agent-ops/tables). */
function isTableDocument(doc: Row): boolean {
	const typeKey = doc.type_key;
	return (
		typeof typeKey === 'string' &&
		(typeKey === 'document.table' || typeKey.startsWith('document.table.'))
	);
}

const TABLE_PACKET_COLUMNS = 12;

/**
 * A table document's packet (BuildOS Tables, 2026-10-04): row count and column
 * names from `props.table`, in place of headings its generated body never has.
 */
function tablePacketFields(doc: Row): { rows: number; columns: string[] } | null {
	if (!isTableDocument(doc)) return null;
	const schema = doc.table && typeof doc.table === 'object' ? (doc.table as Row) : {};
	const rows = typeof schema.row_count === 'number' ? schema.row_count : 0;
	const columns = (Array.isArray(schema.columns) ? schema.columns : [])
		.map((column) => (column && typeof column === 'object' ? (column as Row).name : undefined))
		.filter((name): name is string => typeof name === 'string' && name.length > 0)
		.slice(0, TABLE_PACKET_COLUMNS)
		.map((name) => clipContextText(name, CONTEXT_FINDER_PACKET_LIMITS.headingChars));
	return { rows, columns };
}

const loadedRecordText = (fullText: string) => ({
	fullText,
	textLoaded: true,
	textChars: fullText.length,
	textHash: null
});

/** What a document card says it is: its own description, else the AI summary while it matches
 * the text. Jev's packet keeps the plain description. */
function documentSummary(doc: Record<string, unknown>): string | null {
	const description = typeof doc.description === 'string' ? doc.description.trim() : '';
	if (description) return description;
	return freshDigestSummary(
		doc.digest,
		typeof doc.content_hash === 'string' ? doc.content_hash : null
	);
}

export function buildContextFinderEntities(project: ContextFinderProjectV1): ContextFinderEntity[] {
	const limits = CONTEXT_FINDER_PACKET_LIMITS;
	const out: ContextFinderEntity[] = [];
	project.documents.forEach((doc, i) => {
		const title = text(doc.title);
		const table = tablePacketFields(doc);
		if (table) {
			out.push({
				ref: `d${i}`,
				id: text(doc.id),
				kind: 'document',
				title,
				version: version(doc),
				packet: {
					kind: 'document',
					title,
					description:
						clipContextWords(doc.description, limits.documentDescriptionChars) ||
						undefined,
					type: doc.type_key ?? undefined,
					table
				},
				// The body is the row projection (a markdown table); loading it in
				// full brings in its header and first rows.
				...documentTextFields(doc),
				sections: [],
				packetHeadings: [],
				summary: documentSummary(doc)
			});
			return;
		}
		const fields = documentTextFields(doc);
		const packetHeadings = pickPacketHeadings(title, fields.sections);
		out.push({
			ref: `d${i}`,
			id: text(doc.id),
			kind: 'document',
			title,
			version: version(doc),
			packet: {
				kind: 'document',
				title,
				description:
					clipContextWords(doc.description, limits.documentDescriptionChars) || undefined,
				type: doc.type_key ?? undefined,
				headings: packetHeadings.map((section) =>
					clipContextText(section.heading, limits.headingChars)
				)
			},
			...fields,
			packetHeadings,
			summary: documentSummary(doc)
		});
	});
	project.tasks.forEach((task, i) => {
		const title = text(task.title);
		out.push({
			ref: `t${i}`,
			id: text(task.id),
			kind: 'task',
			title,
			version: version(task),
			packet: {
				kind: 'task',
				title,
				state: task.state_key,
				priority: task.priority ?? undefined,
				due: day(task.due_at),
				description: clipContextText(task.description, limits.textChars) || undefined
			},
			...loadedRecordText(
				`${title}\n${text(task.state_key)} ${day(task.due_at) ?? ''}\n${text(task.description)}`
			),
			sections: [],
			packetHeadings: []
		});
	});
	const simple = (
		rows: Row[],
		kind: ContextFinderKind,
		prefix: string,
		nameKey: string,
		dateKey?: string
	) =>
		rows.forEach((row, i) => {
			const title = text(row[nameKey]);
			const body = row.description ?? row.content;
			out.push({
				ref: `${prefix}${i}`,
				id: text(row.id),
				kind,
				title,
				version: version(row),
				packet: {
					kind,
					title,
					state: row.state_key,
					date: dateKey ? day(row[dateKey]) : undefined,
					description: clipContextText(body, limits.textChars) || undefined,
					...(kind === 'risk' ? { impact: row.impact, probability: row.probability } : {})
				},
				...loadedRecordText(`${title}\n${text(row.state_key)}\n${text(body)}`),
				sections: [],
				packetHeadings: []
			});
		});
	simple(project.goals, 'goal', 'g', 'name', 'target_date');
	simple(project.plans, 'plan', 'p', 'name');
	simple(project.milestones, 'milestone', 'm', 'title', 'due_at');
	simple(project.risks, 'risk', 'r', 'title');
	return out;
}

/** One-line summary for the summary tier: no heading lists, no JSON. */
export function contextFinderSummaryLine(entity: ContextFinderEntity): string {
	const packet = entity.packet;
	const meta = [packet.state, packet.due ?? packet.date].filter(Boolean).join(', ');
	const description = clipContextWords(packet.description, 100);
	return `${entity.kind}: ${entity.title}${meta ? ` [${meta}]` : ''}${description ? ` — ${description}` : ''}`;
}
