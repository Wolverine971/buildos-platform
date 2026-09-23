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

export const THINKING_LOG_SYSTEM_PROMPT = `You keep a project's thinking log: the user's own reasoning in their own words, saved so it can be quoted later, for example while drafting.

You get the new part of a chat. Pick the user messages where the user is thinking: explaining, arguing, deciding, describing what they want, or giving context, stories or examples. Skip user messages that only instruct the assistant, approve or acknowledge ("yes, do it"), or ask a question without adding their own view. Never log assistant text.

For each picked message, return its text with light cleanup only:
- Fix typos and spoken filler ("um", "like", words said twice).
- Keep every idea, sentence and phrase, in the user's wording and order.
- You may drop a trailing request to the assistant ("Help me shape this into the theme.").
- Never summarize, paraphrase, merge messages, or add words.

Give the entry a short topic: 3-10 plain words naming what the user was thinking about.

Return JSON only:
{"topic": "<short topic>", "passages": [{"message_id": "<id of the user message>", "text": "<the user's words>"}]}
Return {"topic": "", "passages": []} when no message qualifies.`;

export const START_HERE_SYNTHESIS_SYSTEM_PROMPT = `You maintain a project's START HERE document: the page a future agent or collaborator reads first to understand the project.

You get the document's current sections and the new part of a chat. Every existing line (a bullet or a paragraph) carries an id like [b7]. Return edits only where the chat changes what the document should say.

Edits, per section:
- "add": new lines, each placed "after" an existing line id (omit "after" to add at the end of the section).
- "remove": ids of lines the chat answered, contradicted or superseded.
- "replace": {"id", "markdown"} when a line stays but must change.
- "rewrite": the complete new body. Use it only for Current state, which is a snapshot of right now, and for a new section.
Prefer "add" over changing existing lines. Leave every line that is still true alone; you never need to copy it. Never add a line whose meaning an existing line already records. Write markdown without the [bN] ids.

Headings:
- Use the document's own headings exactly as given. Put the project's direction, thesis or "what this is" into whichever existing section already holds it.
- Add a section (with "rewrite") only when no existing section covers the content, and only with one of these names: What this is, Non-goals, Current state, Decisions, Vocabulary and mental model, Open questions.
- Do not edit sections marked editable="false".

Section conventions:
- Decisions: one bullet per decision, "- **Decision** — rationale." Do not write dates; code stamps them. Decisions are a permanent record: never remove one because it was carried out. Change one only when the user reversed it.
- Current state: a short snapshot of right now; rewrite it instead of stacking states.
- Vocabulary and mental model: one bullet per term, "- **Term** — meaning".
- Open questions: remove questions the chat answered; add questions it opened.

What counts:
- Record what the user said, decided or explicitly accepted. An assistant suggestion counts only after the user accepted it.
- Keep the user's wording for their ideas. Skip task chatter, tool output and private reasoning.
- Link only with [[type:id|label]] using an id from the entity list. Never invent ids.
- Text outside the sections is read-only. If the chat contradicts it, say so in one sentence in "outside_note".

Return JSON only:
{"edits": [{"heading": "<exact heading>", "add": [{"after": "b7", "markdown": "<one line>"}], "remove": ["b12"], "replace": [{"id": "b3", "markdown": "<new line>"}], "rewrite": "<complete body, only for Current state or a new section>", "rationale": "<what changed and why>"}], "outside_note": "<optional one sentence>"}
Return {"edits": []} when nothing durable changed.`;

const USER_MESSAGE_PROMPT_MAX_CHARS = 6000;
const ASSISTANT_MESSAGE_PROMPT_MAX_CHARS = 1200;
const PRIOR_MESSAGE_PROMPT_MAX_CHARS = 600;
const LOCKED_SECTION_PROMPT_MAX_CHARS = 600;
const OUTSIDE_TEXT_PROMPT_MAX_CHARS = 1500;
const ENTITY_PROMPT_LIMIT = 40;

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
	stamp: (message: PromptMessage) => string | null;
}): string {
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
		})
	]
		.filter((line): line is string => line !== null)
		.join('\n');
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
	add: Array<{ after: string | null; markdown: string }>;
	remove: string[];
	replace: Array<{ id: string; markdown: string }>;
	rewrite: string | null;
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
				{ after: typeof entry?.after === 'string' ? entry.after.trim() : null, markdown }
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
export function applySectionEdit(
	blocks: Array<{ id: string; markdown: string }>,
	edit: SectionEdit
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
