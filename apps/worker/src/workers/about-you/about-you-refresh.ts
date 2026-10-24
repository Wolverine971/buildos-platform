// apps/worker/src/workers/about-you/about-you-refresh.ts
//
// About you refresh (tasker/146). BuildOS infers a short note about the person
// from their own chat messages: only what would change how it should help them
// in chats about other things. Nobody is asked "remember this?"; the note just
// evolves, and the person can edit or delete any line in their Workspace.
//
// Evidence is the person's own messages, never the assistant's replies (an
// assistant claim is not a fact about the person). The model returns its full
// view of the note; mergeAboutYouProposal keeps the person's own edits and
// never brings back a line they deleted. Pure functions plus the one JSON call.

import { createHash } from 'node:crypto';
import type { JSONRequestOptions } from '@buildos/smart-llm';
import { DEEPSEEK_V4_FLASH_MODEL, GPT_6_LUNA_MODEL } from '@buildos/smart-llm';
import {
	ABOUT_YOU_ANSWERS_HEADING,
	ABOUT_YOU_LIMITS,
	ABOUT_YOU_SUGGESTED_HEADINGS,
	type AboutYouProposalLine,
	type AboutYouSection
} from '@buildos/shared-agent-ops/ontology/about-you';

export const ABOUT_YOU_REFRESH_MODELS = [GPT_6_LUNA_MODEL, DEEPSEEK_V4_FLASH_MODEL] as const;
export const ABOUT_YOU_REFRESH_OPERATION = 'about_you_refresh';
export const ABOUT_YOU_REFRESH_PROMPT_VERSION = 1;
/** Hard ceiling per call (SmartLLM reserves it before sending). A full run is ~6-8k tokens in. */
export const ABOUT_YOU_MAX_COST_PER_CALL_USD = 0.01;
const MAX_TOKENS = 1600;

/** Messages read per run, newest kept when there are more. */
export const ABOUT_YOU_MAX_MESSAGES = 60;
export const ABOUT_YOU_MESSAGE_CHARS = 500;
export const ABOUT_YOU_MAX_EVIDENCE_CHARS = 18_000;
/** A routine run waits until the person has said at least this much since the last one. */
export const ABOUT_YOU_MIN_NEW_MESSAGES = 3;

export type AboutYouEvidenceMessage = {
	at: string;
	/** Where it was said: a project name, "Workspace chat", "Daily brief"... */
	where: string;
	text: string;
};

export const ABOUT_YOU_REFRESH_SYSTEM_PROMPT = `You keep a short note about one person for BuildOS, the app where they run their projects. BuildOS reads the note so it can help them better in chats about other things. You never talk to the person; they can read and edit the note.

Keep a line only if it passes all three tests:
1. It is likely still true in three months.
2. It would change how BuildOS should answer, plan or schedule in a chat about a different topic.
3. No project already holds it, and BuildOS can't look it up. Project goals, tasks, plans, clients and the people in a project stay in that project. Connected accounts, calendars and project lists are looked up, not noted.

Write the constraint, not the life story. "New baby at home; keep plans realistic", not "Had a baby in September". "Works late into the night", not "Messaged at 1am on Oct 17".

Never keep:
- Passing moods, one-off states, or anything from a single message unless the person said it is ongoing.
- Guesses about personality or motives.
- Sensitive traits (health, religion, politics, sexuality, finances, weapons, legal matters) unless the person explicitly asked BuildOS to remember them.
- Details about other people's private lives.
- Facts implied by an errand or task ("owns a gun" from a gun-shop errand).

"${ABOUT_YOU_ANSWERS_HEADING}" holds how they want BuildOS to talk and work: how long, how direct, what to lead with, how much to decide on its own. Take it from explicit requests and repeated corrections ("shorter", "just do it", "lead with the outcome"), never from one passing remark.

Evidence is only the person's own messages below. Keep a current line while it still holds, drop one the messages contradict, and drop a dated focus line that no recent message supports. An empty note is fine: most messages are about work and add nothing here.

Use these headings when they fit: ${ABOUT_YOU_SUGGESTED_HEADINGS.map((heading) => `"${heading}"`).join(', ')}. Add a new heading only when none fits. At most ${ABOUT_YOU_LIMITS.maxSections} headings, ${ABOUT_YOU_LIMITS.maxLinesPerSection} lines under each, each line under ${ABOUT_YOU_LIMITS.maxLineChars} characters, plain text.

Return JSON only:
{"lines":[{"heading":"...","text":"...","basis":"the short phrase from their messages or the current note that supports it"}],"changed":"one short sentence on what changed, or \\"nothing\\""}
"lines" is the whole note as it should read now: every line to keep, current ones included.`;

function clip(text: string, max: number): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	return flat.length <= max ? flat : `${flat.slice(0, max - 3).trimEnd()}...`;
}

function dayLabel(iso: string): string {
	const date = new Date(iso);
	if (!Number.isFinite(date.getTime())) return 'unknown date';
	return date.toISOString().slice(0, 10);
}

/** Newest messages win the budget; they are shown oldest first so the story reads in order. */
export function selectAboutYouEvidence(
	messages: AboutYouEvidenceMessage[]
): AboutYouEvidenceMessage[] {
	const newestFirst = [...messages]
		.filter((message) => message.text.trim())
		.sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
		.slice(0, ABOUT_YOU_MAX_MESSAGES);
	const kept: AboutYouEvidenceMessage[] = [];
	let total = 0;
	for (const message of newestFirst) {
		const text = clip(message.text, ABOUT_YOU_MESSAGE_CHARS);
		if (total + text.length > ABOUT_YOU_MAX_EVIDENCE_CHARS) break;
		total += text.length;
		kept.push({ ...message, text });
	}
	return kept.reverse();
}

export function buildAboutYouRefreshPrompt(input: {
	today: string;
	current: AboutYouSection[];
	suppressedKeys: string[];
	messages: AboutYouEvidenceMessage[];
	projectNames: string[];
}): string {
	const currentNote = input.current.length
		? input.current
				.map((section) =>
					[
						`## ${section.heading}`,
						...section.lines.map(
							(line) => `- ${line.text}${line.noted ? ` (noted ${line.noted})` : ''}`
						)
					].join('\n')
				)
				.join('\n')
		: '(empty)';
	const deleted = input.suppressedKeys.length
		? input.suppressedKeys
				.slice(0, 60)
				.map((key) => `- ${key}`)
				.join('\n')
		: '(none)';
	const projects = input.projectNames.length
		? input.projectNames.slice(0, 40).join('; ')
		: '(none)';
	const messages = input.messages.length
		? input.messages
				.map((message) => `[${dayLabel(message.at)} · ${message.where}] ${message.text}`)
				.join('\n')
		: '(none)';
	return [
		`Today: ${input.today}`,
		'',
		'Current note:',
		currentNote,
		'',
		'Lines the person deleted. Never write these again, reworded or not:',
		deleted,
		'',
		`Their projects (facts about these stay in the projects): ${projects}`,
		'',
		'Their messages since the note was last updated, oldest first:',
		messages
	].join('\n');
}

export type AboutYouRefreshAnswer = {
	lines: AboutYouProposalLine[];
	changed: string;
	notes: string[];
};

/** Shape check only: what the lines mean is the model's job, not ours. */
export function checkAboutYouRefreshAnswer(raw: unknown): AboutYouRefreshAnswer {
	const notes: string[] = [];
	const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
	if (!record || !Array.isArray(record.lines)) {
		return { lines: [], changed: 'nothing', notes: ['answer had no lines array'] };
	}
	const lines: AboutYouProposalLine[] = [];
	for (const entry of record.lines.slice(0, 60)) {
		const line = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null;
		const heading = typeof line?.heading === 'string' ? line.heading.trim() : '';
		const text = typeof line?.text === 'string' ? line.text.trim() : '';
		if (!heading || !text) {
			notes.push('skipped a line without heading or text');
			continue;
		}
		lines.push({ heading, text });
	}
	const changed =
		typeof record.changed === 'string' && record.changed.trim()
			? clip(record.changed, 200)
			: 'nothing';
	return { lines, changed, notes };
}

/** Equal hashes mean the model would read the same thing again: skip the call. */
export function aboutYouInputHash(input: {
	current: AboutYouSection[];
	suppressedKeys: string[];
	messages: AboutYouEvidenceMessage[];
}): string {
	return createHash('sha256')
		.update(
			JSON.stringify({
				v: ABOUT_YOU_REFRESH_PROMPT_VERSION,
				current: input.current,
				suppressed: [...input.suppressedKeys].sort(),
				messages: input.messages.map((message) => [message.at, message.text])
			})
		)
		.digest('hex')
		.slice(0, 16);
}

export type JsonCaller = {
	getJSONResponse<T>(options: JSONRequestOptions): Promise<T>;
};

export function askForAboutYouRefresh(
	llm: JsonCaller,
	prompt: string,
	opts: { userId: string; projectId?: string; signal?: AbortSignal }
): Promise<unknown> {
	return llm.getJSONResponse<unknown>({
		systemPrompt: ABOUT_YOU_REFRESH_SYSTEM_PROMPT,
		userPrompt: prompt,
		userId: opts.userId,
		profile: 'custom',
		models: [...ABOUT_YOU_REFRESH_MODELS],
		maxTokens: MAX_TOKENS,
		operationType: ABOUT_YOU_REFRESH_OPERATION,
		projectId: opts.projectId,
		signal: opts.signal,
		spendLimit: { maxCostUsd: ABOUT_YOU_MAX_COST_PER_CALL_USD }
	});
}
