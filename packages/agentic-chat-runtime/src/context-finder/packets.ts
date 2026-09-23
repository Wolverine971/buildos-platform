// packages/agentic-chat-runtime/src/context-finder/packets.ts
//
// One condensed packet per project entity, plus the section index of every document.
// Ported from the 2026-09-22 jev-context-eval.ts harness so
// production ranks exactly what the eval measured; refs (d0, t3, …) keep its question keys.

export type ContextFinderKind = 'document' | 'task' | 'goal' | 'plan' | 'milestone' | 'risk';

type Row = Record<string, unknown>;

/** Raw rows the host loads with its own access check. Order is preserved in refs. */
export type ContextFinderProjectV1 = {
	project: { id: string; name: string; description?: string | null };
	documents: Row[];
	tasks: Row[];
	goals: Row[];
	plans: Row[];
	milestones: Row[];
	risks: Row[];
};

export type ContextFinderSection = {
	heading: string;
	level: number;
	/** Character offset of the heading line inside the document. */
	start: number;
	/** Heading line plus everything until the next heading at the same or a higher level. */
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
	/** What loading this entity in full injects: the record, or the whole document body. */
	fullText: string;
	sections: ContextFinderSection[];
	/** The headings shown to Jev and asked about; their index is the question index. */
	packetHeadings: ContextFinderSection[];
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
		return {
			heading: head.heading,
			level: head.level,
			start: offsets[head.index]!,
			body: lines.slice(head.index, end).join('\n')
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

export function buildContextFinderEntities(project: ContextFinderProjectV1): ContextFinderEntity[] {
	const limits = CONTEXT_FINDER_PACKET_LIMITS;
	const out: ContextFinderEntity[] = [];
	project.documents.forEach((doc, i) => {
		const title = text(doc.title);
		const sections = parseContextFinderSections(text(doc.content));
		const packetHeadings = pickPacketHeadings(title, sections);
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
			fullText: text(doc.content),
			sections,
			packetHeadings
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
			fullText: `${title}\n${text(task.state_key)} ${day(task.due_at) ?? ''}\n${text(task.description)}`,
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
				fullText: `${title}\n${text(row.state_key)}\n${text(body)}`,
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
