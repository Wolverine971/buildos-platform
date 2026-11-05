// apps/web/src/lib/server/thread-chat/thread-chat-core.ts
//
// "Chat with threads" lab (DJ, 2026-11-05). One chat message runs three steps:
//   1. Plan: one streamed call splits the message into pieces and routes each to a project
//      (the /lab/sort router, plus the conversation so far so follow-ups land).
//   2. Threads: one per project, in parallel. Each starts from the project's index (records
//      as one line each, documents as cards with headings, never full text), may read a few
//      records or document sections with the real chat read tools, then writes one decision
//      line per piece.
//   3. Answer: one streamed call reads every thread's report and writes the reply: what
//      changed, what needs the person, and the answers.
// Safe changes apply on their own; a change the thread is unsure of, or one that drops or
// renames something the person didn't ask to drop or rename, becomes a question.
//
// This file is pure: prompts, the tool definitions, reading a decision line, the
// apply-or-ask rule, and the compact report each turn keeps for follow-ups. The model decides
// what words mean through structured fields (op, sure, confirmed), never keyword rules.
import type { ContextFinderEntity } from '@buildos/agentic-chat-runtime/context-finder';
import { clip, type DumpItem, type DumpProject } from '../dump-sort/dump-sort-core';
import {
	readThreadLine,
	type ThreadChange,
	type ThreadRecord,
	type ThreadRecordKind
} from '../dump-sort/dump-sort-thread-core';

export const CHAT_PLAN_OPERATION = 'thread_chat_lab_plan';
export const CHAT_THREAD_OPERATION = 'thread_chat_lab_thread';
export const CHAT_FINDER_OPERATION = 'thread_chat_lab_finder';
export const CHAT_ANSWER_OPERATION = 'thread_chat_lab_answer';
export const CHAT_MAX_CHARS = 4000;

/** Reads one thread may make across all its rounds. */
export const THREAD_MAX_READS = 4;
/** Model rounds that may call tools; the round after them must write decisions. */
export const THREAD_TOOL_ROUNDS = 2;

// ---------------------------------------------------------------------------
// Conversation memory
// ---------------------------------------------------------------------------

/** What one thread did, kept short so later turns can refer back to it. */
export type ThreadReport = {
	alias: string;
	projectId: string | null;
	project: string;
	read: string[];
	saved: string[];
	/** Questions for the person, numbered across the turn ("2. Archive …?"). */
	asked: string[];
	answers: string[];
	covered: string[];
	failed: string | null;
};

export type ChatHistoryTurn = { user: string; answer: string; threads: ThreadReport[] };

const HISTORY_TURNS = 3;

/** The last few turns, for the plan step: enough to route "yes, do 2" to the right project. */
export function historyBlock(history: readonly ChatHistoryTurn[]): string {
	const turns = history.slice(-HISTORY_TURNS);
	if (!turns.length) return '';
	const lines = ['Earlier in this chat (oldest first):'];
	for (const turn of turns) {
		lines.push(`Person: ${clip(turn.user, 300)}`);
		for (const report of turn.threads) {
			const parts = [
				report.saved.length ? `saved: ${report.saved.join('; ')}` : '',
				report.asked.length ? `asked: ${report.asked.join(' ')}` : '',
				report.answers.length ? `answered: ${report.answers.join(' ')}` : ''
			].filter(Boolean);
			lines.push(
				`  ${report.alias} ${report.project}: ${clip(parts.join(' | ') || 'no changes', 500)}`
			);
		}
		if (turn.answer) lines.push(`You replied: ${clip(turn.answer, 300)}`);
	}
	return lines.join('\n');
}

/** What this project's thread did on earlier turns, for the thread itself. */
export function projectHistory(
	history: readonly ChatHistoryTurn[],
	projectId: string | null
): string {
	if (!projectId) return '';
	const lines: string[] = [];
	for (const turn of history.slice(-HISTORY_TURNS)) {
		const report = turn.threads.find((entry) => entry.projectId === projectId);
		if (!report) continue;
		lines.push(`Person said: ${clip(turn.user, 240)}`);
		if (report.saved.length) lines.push(`  You saved: ${report.saved.join('; ')}`);
		if (report.asked.length) lines.push(`  You asked: ${report.asked.join(' ')}`);
		if (report.answers.length) lines.push(`  You answered: ${report.answers.join(' ')}`);
	}
	return lines.length ? ['Earlier in this chat, for this project:', ...lines].join('\n') : '';
}

// ---------------------------------------------------------------------------
// Step 1: plan
// ---------------------------------------------------------------------------

export const CHAT_PLAN_SYSTEM_PROMPT = `You are the planner for a BuildOS chat. The person's new message is split into numbered sentences [1], [2], ... You decide which of their projects each piece belongs to. A separate worker per project then looks inside that project and does the work.

Output JSON Lines only: one JSON object per line. No prose, no code fences, no array.

First line, always: {"focus":["P2"],"new":[]}
- focus: listed projects (P#) the message is about, most important first.
- new: projects the message clearly starts that are not listed, as {"id":"N1","name":"..."}. Usually []. Never a new project for a single loose task; that goes to "W".

Then one line per piece, in message order:
{"s":2,"q":"push the Priya email to Friday","kind":"update","to":"P1","title":"Move the Priya email to Friday","due":"2026-11-06"}
- s: the sentence number.
- q: the person's exact words for this piece, copied character for character from sentence s, usually 2 to 12 words. Never paraphrase q.
- kind, pick one:
  task: a new thing to do. Title starts with a verb.
  update: a change to something that probably exists: progress, done, a new date, dropped, renamed, a detail to add. Also a reply to an earlier question ("yes", "do 2", "no, keep it").
  ask: a question to answer from what the project holds.
  work: a bigger job: research what the project holds, compare, review, or draft a plan or document.
  goal, milestone, doc, risk: a new outcome, checkpoint, idea worth keeping, or worry.
  context: a fact about what the project is.
- to: P#, N#, or "W" (the person's Workspace, for loose items).
- title: the piece written out in full so it reads alone, at most 100 characters. For a reply to an earlier question, say what was agreed, e.g. "Yes: archive Design new channel banner".
- due (optional): "YYYY-MM-DD" only when the message states or clearly implies a date.

Follow-ups: when the message refers to earlier turns ("yes", "the second one", "do the same for the channel", "it"), use the earlier turns below to decide the project, and route it there.
Rules: skip greetings and thanks (no line). One phrase becomes at most one piece. Use only listed aliases or ones you declared in "new". Don't guess what exists inside a project; the worker checks.`;

export function buildPlanPrompt(input: {
	message: string;
	sentences: { n: number; start: number; end: number }[];
	projects: DumpProject[];
	today: string;
	history: readonly ChatHistoryTurn[];
}): string {
	const lines: string[] = [`Today is ${input.today}.`, '', 'Projects:'];
	for (const project of input.projects) {
		const about = project.description ? ` (${clip(project.description, 90)})` : '';
		lines.push(`${project.alias} · ${project.name}${about}`);
	}
	const history = historyBlock(input.history);
	if (history) lines.push('', history);
	lines.push('', 'New message:');
	for (const sentence of input.sentences) {
		lines.push(`[${sentence.n}] ${input.message.slice(sentence.start, sentence.end)}`);
	}
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Step 2: threads
// ---------------------------------------------------------------------------

export const CHAT_THREAD_SYSTEM_PROMPT = `You are one worker thread in a BuildOS chat. You handle one project. The chat routed you the numbered pieces of the person's message that belong to this project.

You start with the project's index: each task, goal, milestone, risk and plan as one line, and each document as a card (title, description, size, and its headings). Refs name records: t3 = task, g0 = goal, m1 = milestone, d2 = document, r0 = risk, p0 = plan. ★ marks the records most related to these pieces.

Tools, only when the index is not enough:
- read_doc(ref, sections): the text under the named headings of a document. Name sections exactly as the card shows them. Leave sections out only for a short document.
- read_record(ref): one task, goal, milestone, risk or plan in full.
Most pieces need no reads. Read before you answer a question the index can't answer, before you add to a document, and for "work" pieces. At most ${THREAD_MAX_READS} reads; read several at once when you can.

When you know enough, stop calling tools and write your decisions as JSON Lines: one object per line, no prose, no code fences. One line per piece, in piece order.
- update: {"piece":4,"op":"update","ref":"t3","set":{"due":"2026-11-07"},"why":"same task, new date","sure":true}
  set keys, only the ones that change: title (a new name), state (todo, in_progress, blocked, done for tasks; achieved for goals and milestones), due (YYYY-MM-DD), add (new detail for its description or document, in the person's words).
- create: {"piece":5,"op":"create","kind":"task","title":"Plan a behind-the-scenes series","description":"","due":null,"why":"new idea","sure":true}
  kind: task, goal, milestone, doc, risk, or note. For a doc you drafted, put the markdown in "body" (under 350 words).
- answer: {"piece":6,"op":"answer","text":"Every other Tuesday at 9 AM.","refs":["d0"]} Answer from what you read, one to four sentences; refs = records you used. If the project doesn't say, answer that it doesn't say yet.
- covered: {"piece":7,"op":"covered","ref":"t2","why":"already on the list"}
- archive: {"piece":8,"op":"archive","ref":"t5","why":"the person says it's dropped","sure":true}

sure: false when you are guessing: the piece is vague, two records could match, or the change would overwrite what the person wrote. Then add "ask": one short yes/no question for the person.
confirmed: true only when the person plainly asked for this exact change, or said yes to it earlier. Archives and renames are saved only when confirmed; otherwise the person is asked.
Prefer update over create when a record is about the same thing; a duplicate is worse than an update. Only use refs from the index. why: under 12 words.`;

/** The two tools a thread may call. Refs keep ids out of the prompt; the host resolves them. */
export const THREAD_TOOLS = [
	{
		type: 'function',
		function: {
			name: 'read_doc',
			description:
				"Read a document's text: the named sections, or the whole document if it is short.",
			parameters: {
				type: 'object',
				properties: {
					ref: { type: 'string', description: 'Document ref from the index, e.g. d2' },
					sections: {
						type: 'array',
						items: { type: 'string' },
						description: 'Headings to read, exactly as the card shows them'
					}
				},
				required: ['ref']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'read_record',
			description:
				'Read one task, goal, milestone, risk or plan in full: description, dates, links.',
			parameters: {
				type: 'object',
				properties: { ref: { type: 'string', description: 'Record ref, e.g. t3' } },
				required: ['ref']
			}
		}
	}
] as const;

const KIND_WORD: Record<ThreadRecordKind, string> = {
	document: 'doc',
	task: 'task',
	goal: 'goal',
	plan: 'plan',
	milestone: 'milestone',
	risk: 'risk'
};

/** Records past this many (after the related ones) stay out of the index. */
const INDEX_MAX_RECORDS = 140;
const CARD_HEADINGS = 6;
const RELATED_CARD_HEADINGS = 12;

function day(value: unknown): string | null {
	return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : null;
}

/** The thread's view of one entity; documents keep their headings, never their text. */
export function entityRecord(entity: ContextFinderEntity, p: number | null): ThreadRecord {
	const packet = entity.packet as Record<string, unknown>;
	return {
		ref: entity.ref,
		id: entity.id,
		kind: entity.kind as ThreadRecordKind,
		title: entity.title,
		state: typeof packet.state === 'string' ? packet.state : null,
		due: day(packet.due ?? packet.date),
		description: typeof packet.description === 'string' ? packet.description : null,
		p,
		tier: p === null ? 'summary' : 'full'
	};
}

export function documentChars(entity: ContextFinderEntity): number | null {
	const known = (entity as { textChars?: number | null }).textChars;
	if (typeof known === 'number') return known;
	return entity.fullText ? entity.fullText.length : null;
}

function size(chars: number | null): string {
	if (chars === null) return '';
	return chars >= 1000 ? `${(chars / 1000).toFixed(1)}k chars` : `${chars} chars`;
}

/**
 * The project index a thread starts from: one line per record, a card per document.
 * Related records (Jev's picks) come first with their descriptions.
 */
export function buildProjectIndex(
	entities: readonly ContextFinderEntity[],
	related: ReadonlyMap<string, number>
): { text: string; shown: number; hidden: number } {
	const ordered = [
		...entities
			.filter((entity) => related.has(entity.id))
			.sort((a, b) => related.get(b.id)! - related.get(a.id)!),
		...entities
			.filter((entity) => !related.has(entity.id))
			.sort((a, b) => b.version.localeCompare(a.version))
	];
	const shown = ordered.slice(0, Math.max(INDEX_MAX_RECORDS, related.size));
	const lines = shown.map((entity) => indexLine(entity, related.has(entity.id)));
	return { text: lines.join('\n'), shown: shown.length, hidden: ordered.length - shown.length };
}

function indexLine(entity: ContextFinderEntity, isRelated: boolean): string {
	const record = entityRecord(entity, null);
	const meta = [record.state, record.due ? `due ${record.due}` : null].filter(Boolean).join(', ');
	const star = isRelated ? '★ ' : '';
	let line = `${star}${entity.ref} · ${KIND_WORD[record.kind]} · ${clip(entity.title, 90)}${meta ? ` [${meta}]` : ''}`;
	const about = record.description ? clip(record.description, isRelated ? 200 : 90) : '';
	if (entity.kind === 'document') {
		const chars = size(documentChars(entity));
		if (about || chars) line += ` — ${[about, chars].filter(Boolean).join(' · ')}`;
		const headings = entity.sections
			.filter((section) => section.level <= 2)
			.slice(0, isRelated ? RELATED_CARD_HEADINGS : CARD_HEADINGS)
			.map((section) => clip(section.heading, 60));
		const more = entity.sections.filter((section) => section.level <= 2).length;
		if (headings.length) {
			line += `\n    § ${headings.join(' · ')}${more > headings.length ? ` (+${more - headings.length})` : ''}`;
		}
	} else if (isRelated && about) {
		line += ` — ${about}`;
	}
	return line;
}

export function buildThreadPrompt(input: {
	projectName: string;
	projectDescription: string | null;
	today: string;
	pieces: Pick<DumpItem, 'n' | 'kind' | 'quote' | 'title' | 'due'>[];
	index: string;
	hidden: number;
	history: string;
}): string {
	const lines: string[] = [
		`Project: ${input.projectName}${input.projectDescription ? ` (${clip(input.projectDescription, 200)})` : ''}`,
		`Today is ${input.today}.`
	];
	if (input.history) lines.push('', input.history);
	lines.push('', 'Pieces:');
	for (const piece of input.pieces) {
		const due = piece.due ? ` · date ${piece.due}` : '';
		lines.push(`[${piece.n}] (${piece.kind}) "${piece.quote}" → ${piece.title}${due}`);
	}
	lines.push('', 'Project index:', input.index || '(empty project)');
	if (input.hidden > 0) lines.push(`(${input.hidden} older records not shown)`);
	return lines.join('\n');
}

/** Matches the headings a thread asked for against the document's outline. */
export function resolveSections(
	entity: ContextFinderEntity,
	requested: readonly string[]
): { anchors: string[]; headings: string[]; missing: string[] } {
	const norm = (value: string) =>
		value
			.toLowerCase()
			.replace(/[#*_`]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	const anchors: string[] = [];
	const headings: string[] = [];
	const missing: string[] = [];
	for (const want of requested) {
		const key = norm(want);
		if (!key) continue;
		const section =
			entity.sections.find((entry) => norm(entry.heading) === key) ??
			entity.sections.find((entry) => entry.anchor && norm(entry.anchor) === key) ??
			entity.sections.find((entry) => norm(entry.heading).includes(key));
		if (section?.anchor) {
			if (!anchors.includes(section.anchor)) {
				anchors.push(section.anchor);
				headings.push(section.heading);
			}
		} else if (section) {
			headings.push(section.heading);
		} else missing.push(want);
	}
	return { anchors, headings, missing };
}

// ---------------------------------------------------------------------------
// Decisions: apply or ask
// ---------------------------------------------------------------------------

export type ChatChangeStatus = 'applied' | 'ask' | 'info';

export type ChatChange = ThreadChange & {
	status: ChatChangeStatus;
	/** The yes/no question, when status is "ask". */
	question: string | null;
	/** Turn-wide question number, set by the service. */
	qn?: number;
	/** A drafted document's text (create, kind doc). */
	body?: string;
};

export type ChatThreadLine =
	| { type: 'change'; change: ChatChange }
	| { type: 'skip'; reason: string };

/**
 * Safe changes save on their own. A change is asked about when the thread says it is
 * guessing (`sure: false`), or when it drops or renames something the person did not plainly
 * ask to drop or rename (`confirmed`). Answers and "already there" change nothing.
 */
export function changeStatus(
	change: ThreadChange,
	flags: { sure?: unknown; confirmed?: unknown }
): ChatChangeStatus {
	if (change.op === 'answer' || change.op === 'covered') return 'info';
	const destructive =
		change.op === 'archive' ||
		(change.op === 'update' && change.fields.some((field) => field.field === 'title'));
	if (destructive && flags.confirmed !== true) return 'ask';
	if (flags.sure === false) return 'ask';
	return 'applied';
}

function defaultQuestion(change: ThreadChange): string {
	switch (change.op) {
		case 'archive':
			return `Archive "${clip(change.record.title, 60)}"?`;
		case 'update': {
			const rename = change.fields.find((field) => field.field === 'title');
			if (rename) return `Rename "${clip(rename.before ?? '', 50)}" to "${rename.after}"?`;
			return `Update "${clip(change.record.title, 60)}"?`;
		}
		case 'create':
			return `Add ${change.kind} "${clip(change.title, 60)}"?`;
		default:
			return 'Go ahead?';
	}
}

export function readChatThreadLine(
	line: string,
	known: { records: Map<string, ThreadRecord>; pieces: Set<number> }
): ChatThreadLine {
	const read = readThreadLine(line, known);
	if (read.type === 'skip') return read;
	let raw: Record<string, unknown> = {};
	try {
		raw = JSON.parse(line.trim().replace(/,$/, '')) as Record<string, unknown>;
	} catch {
		// readThreadLine already parsed it; unreachable.
	}
	const status = changeStatus(read.change, raw);
	const asked = typeof raw.ask === 'string' && raw.ask.trim() ? clip(raw.ask, 160) : null;
	const body =
		read.change.op === 'create' && typeof raw.body === 'string' && raw.body.trim()
			? raw.body.trim().slice(0, 4000)
			: undefined;
	return {
		type: 'change',
		change: {
			...read.change,
			status,
			question: status === 'ask' ? (asked ?? defaultQuestion(read.change)) : null,
			...(body ? { body } : {})
		}
	};
}

/** One line per change, as the report and the answer step see it. */
export function describeChange(change: ChatChange): string {
	switch (change.op) {
		case 'update': {
			const fields = change.fields
				.map((field) =>
					field.field === 'add'
						? `added "${clip(field.after, 80)}"`
						: `${field.field} ${field.before ?? '(none)'} → ${field.after}`
				)
				.join(', ');
			return `${KIND_WORD[change.record.kind]} "${clip(change.record.title, 60)}": ${fields}`;
		}
		case 'create':
			return `new ${change.kind} "${clip(change.title, 70)}"${change.due ? ` due ${change.due}` : ''}${change.body ? ` (${change.body.length} chars drafted)` : ''}`;
		case 'archive':
			return `archive ${KIND_WORD[change.record.kind]} "${clip(change.record.title, 60)}"`;
		case 'covered':
			return `"${clip(change.record.title, 60)}" already covers it`;
		case 'answer':
			return change.text;
	}
}

export function buildReport(input: {
	alias: string;
	projectId: string | null;
	project: string;
	read: string[];
	changes: ChatChange[];
	failed: string | null;
}): ThreadReport {
	const report: ThreadReport = {
		alias: input.alias,
		projectId: input.projectId,
		project: input.project,
		read: input.read,
		saved: [],
		asked: [],
		answers: [],
		covered: [],
		failed: input.failed
	};
	for (const change of input.changes) {
		if (change.op === 'answer') report.answers.push(clip(change.text, 400));
		else if (change.op === 'covered') report.covered.push(describeChange(change));
		else if (change.status === 'ask') {
			report.asked.push(
				`${change.qn ?? '?'}. ${change.question} (${describeChange(change)})`
			);
		} else report.saved.push(describeChange(change));
	}
	return report;
}

// ---------------------------------------------------------------------------
// Step 3: answer
// ---------------------------------------------------------------------------

export const CHAT_ANSWER_SYSTEM_PROMPT = `You are BuildOS chat, replying to the person. Their message was split into worker threads, one per project. The threads have finished; their reports are below. "Saved" changes are done. "Needs the person" items are questions, numbered.

Write the reply:
- First, the answers to anything they asked, in plain words.
- Then what changed, one short line per project ("YouTube channel: marked the sampler video done.").
- Then the numbered questions, keeping their numbers, so they can reply "yes to 1".
- If two threads touched related things or disagree, say so in one line.
Rules: under 140 words. No headings, no tables, no bold. Never claim a change or a fact that is not in a report. If a thread failed, say that project couldn't be checked. If there were no threads, just reply briefly.`;

export function buildAnswerPrompt(input: {
	message: string;
	history: readonly ChatHistoryTurn[];
	reports: ThreadReport[];
	newProjects: string[];
}): string {
	const lines: string[] = [];
	const last = input.history.at(-1);
	if (last) lines.push(`Your previous reply: ${clip(last.answer, 300)}`, '');
	lines.push(`Message: ${input.message}`, '');
	if (!input.reports.length) lines.push('No threads ran.');
	for (const report of input.reports) {
		lines.push(`Thread: ${report.project}`);
		if (report.failed) lines.push(`  Failed: ${report.failed}`);
		if (report.read.length) lines.push(`  Read: ${report.read.join('; ')}`);
		if (report.saved.length) lines.push(`  Saved: ${report.saved.join('; ')}`);
		if (report.asked.length) lines.push(`  Needs the person: ${report.asked.join(' ')}`);
		if (report.answers.length) lines.push(`  Answers: ${report.answers.join(' ')}`);
		if (report.covered.length) lines.push(`  Already there: ${report.covered.join('; ')}`);
	}
	if (input.newProjects.length)
		lines.push('', `New projects started: ${input.newProjects.join(', ')}`);
	return lines.join('\n');
}
