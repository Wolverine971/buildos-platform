// apps/worker/src/workers/chat/checkpoint/capturePrompts.ts
//
// The two model calls behind a chat checkpoint (tasker/95). They run in
// parallel and each gets one job: the thinking log keeps the user's words,
// the START HERE synthesis edits the doc's real sections. Every judgment about
// what the user meant lives in their structured output; code only validates.
export type PromptMessage = {
	id: string;
	role: string;
	content: string;
	created_at: string;
};

export type PromptSection = {
	heading: string;
	/** The section's top-level blocks, each shown to the model with its id. */
	blocks: Array<{ id: string; markdown: string }>;
	editable: boolean;
};

export type PromptEntity = { type: string; id: string; title: string | null };

/** One project record the chat's tools saved in the captured window (a write receipt). */
export type PromptSavedChange = { tool: string; kind: string; title: string | null };

/**
 * The project records one successful tool execution saved, from its
 * affected_entities receipt. Reads carry no affected entities.
 */
export function savedChangesFromExecution(row: Record<string, unknown>): PromptSavedChange[] {
	if (row.success !== true || row.tool_category === 'read') return [];
	const tool = typeof row.tool_name === 'string' ? row.tool_name : null;
	if (!tool || !Array.isArray(row.affected_entities)) return [];
	return row.affected_entities.flatMap((raw) => {
		const entity = asRecord(raw);
		const kind = typeof entity?.kind === 'string' ? entity.kind : null;
		if (!kind) return [];
		const title =
			typeof entity?.title === 'string' && entity.title.trim() ? entity.title : null;
		return [{ tool, kind, title }];
	});
}

/**
 * The newest saved changes, oldest first, from receipts ordered newest first.
 * The prompt cites at most SAVED_CHANGE_PROMPT_LIMIT, and the latest saves are
 * the ones Current state must reflect.
 */
export function latestSavedChanges(
	rowsNewestFirst: Array<Record<string, unknown>>
): PromptSavedChange[] {
	return [...rowsNewestFirst]
		.reverse()
		.flatMap(savedChangesFromExecution)
		.slice(-SAVED_CHANGE_PROMPT_LIMIT);
}

export const THINKING_LOG_SYSTEM_PROMPT =`You keep a project's thinking log: the user's own reasoning in their own words, saved so it can be quoted later, for example while drafting.

You get the new part of a chat. Pick the user messages where the user is thinking: explaining, arguing, deciding, describing what they want, or giving context, stories or examples. Skip user messages that only instruct the assistant, approve or acknowledge ("yes, do it"), or ask a question without adding their own view. Never log assistant text.

For each picked message, return its text with light cleanup only:
- Fix typos and spoken filler ("um", "like", words said twice).
- Keep every idea, sentence and phrase, in the user's wording and order.
- Keep the user's paragraph breaks (a blank line, \\n\\n in JSON).
- You may drop a trailing request to the assistant ("Help me shape this into the theme.").
- Never summarize, paraphrase, merge messages, or add words.

Label each passage with its kind: "thinking" when the message carries the user's own view, reasons, wants or context (even alongside a request), or "instruction" when it only asks the assistant to do something. Instruction passages are not logged.

Give the entry a short topic: 3-10 plain words naming what the user was thinking about.

Return JSON only:
{"topic": "<short topic>", "passages": [{"message_id": "<id of the user message>", "kind": "thinking", "text": "<the user's words>"}]}
Return {"topic": "", "passages": []} when no message qualifies.`;

export const START_HERE_SYNTHESIS_SYSTEM_PROMPT = `You maintain a project's START HERE document: the page a future agent or collaborator reads first to understand the project.

You get the document's current sections and the new part of a chat. Every existing line (a bullet or a paragraph) carries an id like [b7]. Return edits only where the chat changes what the document should say.

Edits, per section:
- "add": new lines, each placed "after" an existing line id (omit "after" to add at the end of the section).
- "remove": ids of lines the chat answered, contradicted or superseded.
- "replace": {"id", "markdown"} when a line stays but must change.
- "rewrite": the complete new body. Use it only for Current state, which is a snapshot of right now, and for a new section.
Prefer "add" over changing existing lines. Leave every line that is still true alone; you never need to copy it. Write markdown without the [bN] ids.
Before adding a line, look for an existing line in any section that already records the same point. Set "restates" to that line's id, or null when none does. A line with "restates" set is not added; to add detail to an existing line, "replace" it instead.

Headings:
- Use the document's own headings exactly as given. Put the project's direction, thesis or "what this is" into whichever existing section already holds it.
- Add a section (with "rewrite") only when no existing section covers the content, and only with one of these names: What this is, Non-goals, Current state, Decisions, Vocabulary and mental model, Open questions.
- Do not edit sections marked editable="false".

Section conventions:
- Decisions: one bullet per decision, "- **Decision** — rationale." Do not write dates; code stamps them. Decisions are a permanent record: never remove one because it was carried out. Change one only when the user reversed it.
- Current state: a short snapshot of right now; rewrite it instead of stacking states. Rewrite it only on evidence, and list that evidence in "evidence": the id of a user message that reports the change, or the [cN] id of a record under "Changes this chat saved". Assistant text is not evidence: its status descriptions read the old record, and work it says it did counts only when listed under "Changes this chat saved". A user's request is not its result either: without a saved change, record what they decided, not that it was done. When that is all the chat has, leave Current state alone. Keep it consistent with Decisions.
- Vocabulary and mental model: one bullet per term, "- **Term** — meaning".
- Open questions: questions about the project itself, not about BuildOS or this document. Remove questions the chat answered or a decision in the document settles; add questions the chat opened.

What counts:
- Record what the user said, decided or explicitly accepted. An assistant suggestion counts only after the user accepted it.
- Keep the user's certainty. An idea the user is unsure about, or a candidate they have not chosen, goes under Open questions, never into Decisions or settled prose.
- Keep the user's wording for their ideas. Skip task chatter, tool output and private reasoning.
- Link only with [[type:id|label]] using an id from the entity list. Never invent ids.
- Text outside the sections is read-only. If the chat contradicts it, say so in one sentence in "outside_note".

Return JSON only:
{"edits": [{"heading": "<exact heading>", "add": [{"after": "b7", "restates": null, "markdown": "<one line>"}], "remove": ["b12"], "replace": [{"id": "b3", "markdown": "<new line>"}], "rewrite": "<complete body, only for Current state or a new section>", "evidence": ["<user message id or cN>"], "rationale": "<what changed and why>"}], "outside_note": "<optional one sentence>"}
Return {"edits": []} when nothing durable changed.`;

const USER_MESSAGE_PROMPT_MAX_CHARS = 6000;
const ASSISTANT_MESSAGE_PROMPT_MAX_CHARS = 1200;
const PRIOR_MESSAGE_PROMPT_MAX_CHARS = 600;
const LOCKED_SECTION_PROMPT_MAX_CHARS = 600;
const OUTSIDE_TEXT_PROMPT_MAX_CHARS = 1500;
const ENTITY_PROMPT_LIMIT = 40;
export const SAVED_CHANGE_PROMPT_LIMIT = 20;

function truncate(value: string, maxChars: number): string {
	const trimmed = value.trim();
	return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars).trimEnd()}...`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function renderMessages(
	messages: PromptMessage[],
	stamp: (message: PromptMessage) => string | null,
	limits: { user: number; assistant: number }
): string[] {
	return messages.map((message) => {
		const limit = message.role === 'user' ? limits.user : limits.assistant;
		const at = stamp(message);
		const attrs = [
			`role="${message.role}"`,
			message.role === 'user' ? `id="${message.id}"` : null,
			at ? `at="${at}"` : null
		]
			.filter(Boolean)
			.join(' ');
		return `<message ${attrs}>\n${truncate(message.content, limit)}\n</message>`;
	});
}

export function buildThinkingLogPrompt(params: {
	projectName: string | null;
	recentEntryHeadings: string[];
	newMessages: PromptMessage[];
	stamp: (message: PromptMessage) => string | null;
}): string {
	return [
		`Project: ${params.projectName ?? 'Unknown project'}`,
		params.recentEntryHeadings.length > 0
			? `Recent thinking log entries (already saved):\n${params.recentEntryHeadings.map((heading) => `- ${heading}`).join('\n')}`
			: null,
		'',
		'New chat messages, oldest first:',
		...renderMessages(params.newMessages, params.stamp, {
			user: USER_MESSAGE_PROMPT_MAX_CHARS,
			assistant: ASSISTANT_MESSAGE_PROMPT_MAX_CHARS
		})
	]
		.filter((line): line is string => line !== null)
		.join('\n');
}

export function buildStartHereSynthesisPrompt(params: {
	projectName: string | null;
	today: string;
	projectCreated: string | null;
	sections: PromptSection[];
	missingStandardSections: string[];
	outsideText: string;
	entities: PromptEntity[];
	priorMessages: PromptMessage[];
	newMessages: PromptMessage[];
	savedChanges: PromptSavedChange[];
	stamp: (message: PromptMessage) => string | null;
}): string {
	// Tasker 96 Finding 10: capture copied a chat's stale status read ("Blueprint:
	// not started") into Current state over a correct line. Write receipts are
	// the chat's evidence of work done; the prompt states "none" outright so a
	// read-only chat has nothing to mistake for news.
	const savedChanges = params.savedChanges
		.slice(0, SAVED_CHANGE_PROMPT_LIMIT)
		.map(
			(change, index) =>
				`- [${savedChangeId(index)}] ${change.tool}: ${change.kind} "${change.title ?? '(untitled)'}"`
		);
	const sectionBlocks = params.sections.map((section) => {
		if (!section.editable) {
			const body = section.blocks.map((block) => block.markdown).join('\n');
			return `<section heading="${section.heading}" editable="false">\n${truncate(body, LOCKED_SECTION_PROMPT_MAX_CHARS)}\n</section>`;
		}
		const body =
			section.blocks.map((block) => `[${block.id}] ${block.markdown}`).join('\n') ||
			'(empty)';
		return `<section heading="${section.heading}">\n${body}\n</section>`;
	});
	const entities = params.entities
		.slice(0, ENTITY_PROMPT_LIMIT)
		.map((entity) => `- ${entity.type} ${entity.id} — ${entity.title ?? '(untitled)'}`);
	return [
		`Project: ${params.projectName ?? 'Unknown project'}`,
		`Today's date: ${params.today}`,
		params.projectCreated ? `Project created: ${params.projectCreated}` : null,
		'',
		'Current START HERE sections:',
		...(sectionBlocks.length > 0 ? sectionBlocks : ['(no sections yet)']),
		params.missingStandardSections.length > 0
			? `\nStandard sections this document does not have: ${params.missingStandardSections.join(', ')}`
			: null,
		params.outsideText
			? `\nText outside the sections (read-only):\n<outside>\n${truncate(params.outsideText, OUTSIDE_TEXT_PROMPT_MAX_CHARS)}\n</outside>`
			: null,
		entities.length > 0 ? `\nProject entities you may link:\n${entities.join('\n')}` : null,
		params.priorMessages.length > 0
			? [
					'',
					'Earlier messages (already captured; context only):',
					...renderMessages(params.priorMessages, params.stamp, {
						user: PRIOR_MESSAGE_PROMPT_MAX_CHARS,
						assistant: PRIOR_MESSAGE_PROMPT_MAX_CHARS
					})
				].join('\n')
			: null,
		'',
		'New chat messages, oldest first:',
		...renderMessages(params.newMessages, params.stamp, {
			user: USER_MESSAGE_PROMPT_MAX_CHARS,
			assistant: ASSISTANT_MESSAGE_PROMPT_MAX_CHARS
		}),
		'',
		savedChanges.length > 0
			? `Changes this chat saved (tool receipts for the new messages):\n${savedChanges.join('\n')}`
			: 'Changes this chat saved: none. These messages changed no project records.'
	]
		.filter((line): line is string => line !== null)
		.join('\n');
}

/** The id a saved change carries in the prompt, so an edit can cite it as evidence. */
export function savedChangeId(index: number): string {
	return `c${index + 1}`;
}

export type ThinkingLogReply = {
	topic: string | null;
	passages: Array<{ messageId: string; text: string }>;
};

export function normalizeThinkingLogReply(reply: unknown): ThinkingLogReply {
	const record = asRecord(reply);
	const passages: ThinkingLogReply['passages'] = [];
	const seen = new Set<string>();
	for (const raw of Array.isArray(record?.passages) ? record.passages : []) {
		const passage = asRecord(raw);
		const messageId = typeof passage?.message_id === 'string' ? passage.message_id.trim() : '';
		const text = typeof passage?.text === 'string' ? passage.text : '';
		if (!messageId || seen.has(messageId)) continue;
		seen.add(messageId);
		// The model's own label: a message that only instructs the assistant is not thinking.
		if (passage?.kind === 'instruction') continue;
		passages.push({ messageId, text });
	}
	return {
		topic:
			typeof record?.topic === 'string' && record.topic.trim() ? record.topic.trim() : null,
		passages
	};
}

export type SectionEdit = {
	heading: string;
	/** `restates`: the model's own pointer to an existing line that already says this. */
	add: Array<{ after: string | null; restates: string | null; markdown: string }>;
	remove: string[];
	replace: Array<{ id: string; markdown: string }>;
	rewrite: string | null;
	/** What the model cites for the edit: user message ids or saved-change ids (cN). */
	evidence: string[];
	rationale: string;
};

export type SynthesisReply = { edits: SectionEdit[]; outsideNote: string | null };

function strings(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
		: [];
}

export function normalizeSynthesisReply(reply: unknown): SynthesisReply {
	const record = asRecord(reply);
	const edits: SectionEdit[] = [];
	for (const raw of Array.isArray(record?.edits) ? record.edits : []) {
		const edit = asRecord(raw);
		const heading = typeof edit?.heading === 'string' ? edit.heading.trim() : '';
		if (!edit || !heading) continue;
		const add = (Array.isArray(edit.add) ? edit.add : []).flatMap((item) => {
			const entry = asRecord(item);
			const markdown = typeof entry?.markdown === 'string' ? entry.markdown.trim() : '';
			if (!markdown) return [];
			return [
				{
					after: typeof entry?.after === 'string' ? entry.after.trim() : null,
					restates:
						typeof entry?.restates === 'string' && entry.restates.trim()
							? entry.restates.trim()
							: null,
					markdown
				}
			];
		});
		const replace = (Array.isArray(edit.replace) ? edit.replace : []).flatMap((item) => {
			const entry = asRecord(item);
			const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
			const markdown = typeof entry?.markdown === 'string' ? entry.markdown.trim() : '';
			return id && markdown ? [{ id, markdown }] : [];
		});
		const rewrite =
			typeof edit.rewrite === 'string' && edit.rewrite.trim() ? edit.rewrite : null;
		if (
			add.length === 0 &&
			replace.length === 0 &&
			!rewrite &&
			strings(edit.remove).length === 0
		) {
			continue;
		}
		edits.push({
			heading,
			add,
			remove: strings(edit.remove).map((id) => id.trim()),
			replace,
			rewrite,
			evidence: strings(edit.evidence).map((id) => id.trim()),
			rationale:
				typeof edit.rationale === 'string' && edit.rationale.trim()
					? truncate(edit.rationale, 300)
					: 'Captured from chat.'
		});
	}
	return {
		edits,
		outsideNote:
			typeof record?.outside_note === 'string' && record.outside_note.trim()
				? truncate(record.outside_note, 300)
				: null
	};
}

// The model sometimes echoes the [bN] ids the prompt shows. They are our own
// structured tags, never content, so they are stripped from every line.
const ECHOED_BLOCK_ID = /^([ \t]*)\[b\d+\][ \t]*/gm;

function stripEchoedBlockIds(markdown: string): string {
	return markdown.replace(ECHOED_BLOCK_ID, '$1');
}

/**
 * Turn one section's edits into its complete new body. Ids that belong to
 * another section are ignored; an addition with an unknown anchor goes last.
 */
/** Additions the model itself marked as restating an existing line of the document. */
export function restatedAdditions(edit: SectionEdit, documentIds: ReadonlySet<string>): number {
	return edit.add.filter((addition) => addition.restates && documentIds.has(addition.restates))
		.length;
}

export function applySectionEdit(
	blocks: Array<{ id: string; markdown: string }>,
	edit: SectionEdit,
	documentIds: ReadonlySet<string> = new Set(blocks.map((block) => block.id))
): string[] {
	if (edit.rewrite !== null) return [stripEchoedBlockIds(edit.rewrite)];
	const removed = new Set(edit.remove);
	const replaced = new Map(
		edit.replace.map((entry) => [entry.id, stripEchoedBlockIds(entry.markdown)])
	);
	const ids = new Set(blocks.map((block) => block.id));
	const after = new Map<string, string[]>();
	const trailing: string[] = [];
	for (const addition of edit.add) {
		if (addition.restates && documentIds.has(addition.restates)) continue;
		const markdown = stripEchoedBlockIds(addition.markdown);
		if (addition.after && ids.has(addition.after)) {
			after.set(addition.after, [...(after.get(addition.after) ?? []), markdown]);
		} else {
			trailing.push(markdown);
		}
	}
	return [
		...blocks.flatMap((block) => [
			...(removed.has(block.id) ? [] : [replaced.get(block.id) ?? block.markdown]),
			...(after.get(block.id) ?? [])
		]),
		...trailing
	];
}
