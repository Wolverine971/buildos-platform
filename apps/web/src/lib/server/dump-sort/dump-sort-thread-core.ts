// apps/web/src/lib/server/dump-sort/dump-sort-thread-core.ts
//
// Stage 2 of the "watch it sort" prototype: one thread per project. The thread reads the
// project, lets Jev pick the records related to the pieces routed there, and then one
// streamed call decides, per piece, whether it updates an existing record, creates a new one,
// answers a question, is already covered, or archives something. One JSON line per decision.
//
// Pure: the prompt, reading a streamed line, and the before/after fields an update card
// shows. The model decides what each piece means (a structured answer, AGENTS.md).
import { clip, type DumpItem } from './dump-sort-core';

export const DUMP_THREAD_OPERATION = 'dump_sort_lab_thread';
export const DUMP_FINDER_OPERATION = 'dump_sort_lab_finder';

export type ThreadRecordKind = 'document' | 'task' | 'goal' | 'plan' | 'milestone' | 'risk';

/** A record the thread looked at. `ref` is the short handle the model uses (t3, g0, d1). */
export type ThreadRecord = {
	ref: string;
	id: string;
	kind: ThreadRecordKind;
	title: string;
	state: string | null;
	due: string | null;
	description: string | null;
	/** Jev's relevance for these pieces; null when picked by recency. */
	p: number | null;
	tier: 'full' | 'summary';
	/** Documents only: the start of the body, for the model to read. */
	body?: string;
};

export type ThreadField = {
	field: 'title' | 'state' | 'due' | 'add';
	before: string | null;
	after: string;
};

export type ThreadChange =
	| { piece: number; op: 'update'; record: ThreadRecord; fields: ThreadField[]; why: string }
	| {
			piece: number;
			op: 'create';
			kind: 'task' | 'goal' | 'milestone' | 'doc' | 'risk' | 'note';
			title: string;
			description: string;
			due: string | null;
			why: string;
	  }
	| { piece: number; op: 'answer'; text: string; records: ThreadRecord[] }
	| { piece: number; op: 'covered'; record: ThreadRecord; why: string }
	| { piece: number; op: 'archive'; record: ThreadRecord; why: string };

export type ThreadLine =
	| { type: 'change'; change: ThreadChange }
	| { type: 'skip'; reason: string };

const CREATE_KINDS = new Set(['task', 'goal', 'milestone', 'doc', 'risk', 'note']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DUMP_THREAD_SYSTEM_PROMPT = `You update one BuildOS project from pieces of a person's brain dump. You see the numbered pieces routed to this project and the project's records most related to them (refs like t3 = task, g0 = goal, m1 = milestone, d2 = document, r0 = risk, p0 = plan).

Decide what each piece does. Output JSON Lines only: one JSON object per line, no prose, no code fences.

- update: the piece changes or adds to a listed record.
  {"piece":4,"op":"update","ref":"t3","set":{"due":"2026-11-07","add":"Priya prefers a serif title"},"why":"same task, new date"}
  set keys (only the ones that change): title (a clearer name), state (the record's new state, e.g. todo, in_progress, blocked, done for tasks; achieved for goals and milestones), due (YYYY-MM-DD), add (new detail to add to its description or document, in the person's words).
- create: nothing listed covers it.
  {"piece":5,"op":"create","kind":"task","title":"Plan a behind-the-scenes video","description":"","due":null,"why":"new idea"}
  kind: task, goal, milestone, doc, risk, or note.
- answer: the piece asks a question. Answer in one to three sentences using only the listed records; refs = the records you used. If they don't say, answer that the project doesn't say yet.
  {"piece":6,"op":"answer","text":"...","refs":["d1"]}
- covered: a listed record already says this; nothing changes. {"piece":7,"op":"covered","ref":"t2","why":"..."}
- archive: the piece says something listed is dropped or no longer needed. {"piece":8,"op":"archive","ref":"t5","why":"..."}

Rules: prefer update over create when a listed record is about the same thing; a duplicate is worse than an update. One line per piece, in piece order. Only use refs that are listed. why: under 12 words.`;

export function buildThreadPrompt(input: {
	projectName: string;
	projectDescription: string | null;
	today: string;
	pieces: Pick<DumpItem, 'n' | 'kind' | 'quote' | 'title' | 'due'>[];
	records: ThreadRecord[];
	others: ThreadRecord[];
}): string {
	const lines: string[] = [
		`Project: ${input.projectName}${input.projectDescription ? ` (${clip(input.projectDescription, 160)})` : ''}`,
		`Today is ${input.today}.`,
		'',
		'Pieces:'
	];
	for (const piece of input.pieces) {
		const due = piece.due ? ` · date ${piece.due}` : '';
		lines.push(`[${piece.n}] (${piece.kind}) "${piece.quote}" → ${piece.title}${due}`);
	}
	lines.push('', 'Related records:');
	if (input.records.length === 0) lines.push('(none)');
	for (const record of input.records) lines.push(recordLine(record, true));
	if (input.others.length) {
		lines.push('', 'Other records (titles only):');
		for (const record of input.others) lines.push(recordLine(record, false));
	}
	return lines.join('\n');
}

function recordLine(record: ThreadRecord, full: boolean): string {
	const meta = [record.state, record.due ? `due ${record.due}` : null].filter(Boolean).join(', ');
	const head = `${record.ref} · ${record.kind} · ${clip(record.title, 90)}${meta ? ` [${meta}]` : ''}`;
	if (!full) return head;
	const about = record.body
		? clip(record.body, 500)
		: record.description
			? clip(record.description, 240)
			: '';
	return about ? `${head}\n    ${about}` : head;
}

/** Reads one decision line. Unknown refs, kinds, and pieces become skips. */
export function readThreadLine(
	line: string,
	known: { records: Map<string, ThreadRecord>; pieces: Set<number> }
): ThreadLine {
	const trimmed = line.trim().replace(/,$/, '');
	if (!trimmed.startsWith('{')) return { type: 'skip', reason: 'not json' };
	let raw: Record<string, unknown>;
	try {
		raw = JSON.parse(trimmed) as Record<string, unknown>;
	} catch {
		return { type: 'skip', reason: 'bad json' };
	}
	const piece = Number(raw.piece);
	if (!known.pieces.has(piece))
		return { type: 'skip', reason: `unknown piece ${String(raw.piece)}` };
	const why = typeof raw.why === 'string' ? clip(raw.why, 120) : '';
	const record = typeof raw.ref === 'string' ? known.records.get(raw.ref) : undefined;

	switch (raw.op) {
		case 'update': {
			if (!record) return { type: 'skip', reason: `unknown ref ${String(raw.ref)}` };
			const fields = updateFields(record, raw.set);
			if (fields.length === 0) return { type: 'skip', reason: 'update with no changes' };
			return { type: 'change', change: { piece, op: 'update', record, fields, why } };
		}
		case 'create': {
			const kind =
				typeof raw.kind === 'string' && CREATE_KINDS.has(raw.kind) ? raw.kind : 'note';
			const title = typeof raw.title === 'string' ? clip(raw.title, 100) : '';
			if (!title) return { type: 'skip', reason: 'create without a title' };
			return {
				type: 'change',
				change: {
					piece,
					op: 'create',
					kind: kind as 'task',
					title,
					description:
						typeof raw.description === 'string' ? clip(raw.description, 400) : '',
					due: typeof raw.due === 'string' && DATE.test(raw.due) ? raw.due : null,
					why
				}
			};
		}
		case 'answer': {
			const text = typeof raw.text === 'string' ? clip(raw.text, 600) : '';
			if (!text) return { type: 'skip', reason: 'empty answer' };
			const refs = Array.isArray(raw.refs) ? raw.refs : [];
			const records = refs
				.map((ref) => (typeof ref === 'string' ? known.records.get(ref) : undefined))
				.filter((entry): entry is ThreadRecord => !!entry);
			return { type: 'change', change: { piece, op: 'answer', text, records } };
		}
		case 'covered':
		case 'archive':
			if (!record) return { type: 'skip', reason: `unknown ref ${String(raw.ref)}` };
			return { type: 'change', change: { piece, op: raw.op, record, why } };
		default:
			return { type: 'skip', reason: `unknown op ${String(raw.op)}` };
	}
}

/** Before/after pairs for an update card. A field that wouldn't change is dropped. */
export function updateFields(record: ThreadRecord, set: unknown): ThreadField[] {
	if (!set || typeof set !== 'object' || Array.isArray(set)) return [];
	const raw = set as Record<string, unknown>;
	const fields: ThreadField[] = [];
	if (typeof raw.title === 'string' && raw.title.trim() && raw.title.trim() !== record.title) {
		fields.push({ field: 'title', before: record.title, after: clip(raw.title, 100) });
	}
	if (typeof raw.state === 'string' && raw.state.trim() && raw.state.trim() !== record.state) {
		fields.push({ field: 'state', before: record.state, after: clip(raw.state, 24) });
	}
	if (typeof raw.due === 'string' && DATE.test(raw.due) && raw.due !== record.due) {
		fields.push({ field: 'due', before: record.due, after: raw.due });
	}
	if (typeof raw.add === 'string' && raw.add.trim()) {
		fields.push({
			field: 'add',
			before: record.description ? clip(record.description, 160) : null,
			after: clip(raw.add, 400)
		});
	}
	return fields;
}
