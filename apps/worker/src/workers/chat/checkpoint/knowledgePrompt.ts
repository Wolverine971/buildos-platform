// apps/worker/src/workers/chat/checkpoint/knowledgePrompt.ts
//
// Chat wrap-up → knowledge graph (tasker 164, "chat is a source"): the pure parts. What the
// cheap gate is asked, what the extraction model is asked, and which of its answers survive.
//
// Meaning is decided by models through structured output: the gate answers a choice question,
// the extractor returns facts with exact quotes. Code only checks evidence: a quote must be
// literally in the message it cites, a named entity must literally appear in the chat, a web
// fact must cite a page the chat's own search or browsing returned. Nothing here classifies
// language.
import {
	type KnowledgeKind,
	getKnowledgePredicate,
	isKnowledgeKind,
	normalizeKnowledgeName
} from '@buildos/shared-agent-ops/knowledge';
import type { PromptMessage } from './capturePrompts';

export const CHAT_KNOWLEDGE_PROMPT_VERSION = 1;

/** A page the chat's web tools returned in this stretch (content is never stored). */
export type ChatWebPage = { url: string; title: string | null };

/** Predicates a chat capture may write. */
export const CHAT_KNOWLEDGE_PREDICATES = [
	'works_at',
	'knows',
	'headline',
	'homepage',
	'profile_url',
	'email',
	'phone',
	'address',
	'birthday',
	'located_in',
	'part_of',
	'owns',
	'industry',
	'founded',
	'description',
	'alias',
	'note'
] as const;

const ALLOWED = new Set<string>(CHAT_KNOWLEDGE_PREDICATES);
/**
 * Only from the user's own words: a person's contact details and private notes, and who the
 * user knows. Web search never fills these for a person (the research worker's rule too).
 */
const USER_ONLY_FOR_PEOPLE = new Set(['email', 'phone', 'address', 'birthday', 'note']);
const USER_ONLY = new Set(['knows', 'note']);

export const MIN_QUOTE_CHARS = 12;
export const MAX_CAPTURE_FACTS = 15;
export const MAX_CAPTURE_ENTITIES = 10;
/** The gate reads at most this much of the stretch. */
const GATE_MESSAGE_CHARS = 1_500;
const GATE_TOTAL_CHARS = 24_000;
/** The extractor reads at most this much per message. */
const EXTRACT_MESSAGE_CHARS = 6_000;
const MAX_WEB_PAGES = 20;

// ---------------------------------------------------------------------------
// Gate: one structured decision before the extraction call

export const CHAT_KNOWLEDGE_GATE_QUESTIONS = {
	entity_knowledge: {
		type: 'choice' as const,
		instructions: {
			question:
				"Do these new chat messages contain specific, lasting facts about a named person or organization that are worth saving to the user's private contact notes?",
			rules: [
				'Count facts the user stated and facts a web search in this chat found and the assistant reported.',
				'A name mentioned in passing, with nothing specific said about it, does not count.',
				'Opinions, plans, tasks and temporary states ("busy this week") do not count.',
				'Facts the assistant stated from its own general knowledge, with no web page in this chat, do not count.'
			]
		},
		criteria: {
			none: 'No such facts: no named people or organizations, or only passing mentions, opinions, tasks or small talk.',
			some: 'At least one specific, lasting fact tied to a named person or organization: role or title, employer, website or profile, how the user knows them, where they are based, contact details the user gave, a decision involving them, or what a web search found about them.'
		}
	}
};

/** Proceed to extraction at or above this probability of "some" (a miss loses knowledge). */
export const CHAT_KNOWLEDGE_GATE_MIN_P = 0.3;

export function buildKnowledgeGateState(params: {
	newMessages: readonly PromptMessage[];
	webPages: readonly ChatWebPage[];
}): {
	messages: Array<{ role: string; text: string }>;
	web_pages: Array<{ title: string | null; url: string }>;
} {
	let budget = GATE_TOTAL_CHARS;
	const messages: Array<{ role: string; text: string }> = [];
	// Newest last; when over budget, the newest messages are kept.
	for (const message of [...params.newMessages].reverse()) {
		const text = message.content.trim().slice(0, GATE_MESSAGE_CHARS);
		if (!text) continue;
		if (budget - text.length < 0) break;
		budget -= text.length;
		messages.unshift({ role: message.role, text });
	}
	return {
		messages,
		web_pages: params.webPages
			.slice(0, MAX_WEB_PAGES)
			.map((page) => ({ title: page.title, url: page.url }))
	};
}

// ---------------------------------------------------------------------------
// Extraction prompt

function predicateLines(): string {
	return CHAT_KNOWLEDGE_PREDICATES.map((key) => getKnowledgePredicate(key))
		.filter((def): def is NonNullable<typeof def> => Boolean(def))
		.map((def) => {
			const subjects = def.subjectKinds.length ? def.subjectKinds.join('/') : 'any';
			const target =
				def.valueType === 'entity'
					? `object: ${def.objectKinds.length ? def.objectKinds.join('/') : 'any'}`
					: `value: ${def.valueType}`;
			const qualifiers = def.qualifierKeys.length
				? `; qualifiers: ${def.qualifierKeys.join(', ')}`
				: '';
			return `- ${def.key} (${subjects} → ${target}${qualifiers}): ${def.description}`;
		})
		.join('\n');
}

export const CHAT_KNOWLEDGE_SYSTEM_PROMPT = `You pick out what is worth remembering about people and organizations from a stretch of the user's chat with their assistant. What you return is saved to the user's PRIVATE contact notes (their personal knowledge graph).

Save only important, lasting facts tied to a NAMED person or organization:
- what the user said: someone's role or title, employer, how the user knows them (friend, client, met at…), where they are based, their website or profile, contact details the user gave, a decision or arrangement involving them;
- what a web search or page visit in this chat found about a named person or organization, as the assistant reported it.
Focus on people the user knows and works with, and their organizations. Public facts about well-known companies or people only when they came up in this chat.

Skip:
- names mentioned in passing with nothing specific said about them;
- opinions, feelings, plans, tasks and anything temporary ("Sam is busy this week");
- facts the assistant stated from its own knowledge, without a web page listed below;
- facts about the user themselves, except who they know (subject "me" with predicate "knows").

Evidence rules:
- Every fact cites one new message ("message": "m3") and copies "quote": exact words from that message (12 to 300 characters) that state the fact. Never cite context messages (c1, c2…).
- "from": "user" for the user's own words (cite a user message). "from": "web" for what a search found (cite the assistant message that reported it and give "web": the page id, e.g. "w2").
- A person's email, phone, address, birthday and notes come only from the user's own words.
- Use names exactly as written in the chat (full names when given). Don't invent entities.
- For a relationship, give "object": an entity ref. For a property, give "value".

Predicates (use only these):
${predicateLines()}

Kinds: person, org, website, product, place, event, channel, video, topic.

Return JSON only:
{"entities":[{"ref":"e1","kind":"person","name":"Sam Lee"},{"ref":"e2","kind":"org","name":"Acme Robotics"}],
 "facts":[{"subject":"e1","predicate":"works_at","object":"e2","qualifiers":{"title":"CTO"},"message":"m2","quote":"Sam Lee just became CTO at Acme Robotics","from":"user"},
  {"subject":"me","predicate":"knows","object":"e1","qualifiers":{"via":"friend"},"message":"m2","quote":"my friend Sam Lee","from":"user"},
  {"subject":"e2","predicate":"homepage","value":"https://acmerobotics.com","message":"m3","quote":"Acme Robotics' site is acmerobotics.com","from":"web","web":"w1"}]}
Return {"entities":[],"facts":[]} when nothing qualifies.`;

export type LabeledMessage = PromptMessage & { label: string };

export function labelMessages(
	messages: readonly PromptMessage[],
	prefix: string
): LabeledMessage[] {
	return messages.map((message, index) => ({ ...message, label: `${prefix}${index + 1}` }));
}

export function buildKnowledgeUserPrompt(params: {
	chatTitle: string | null;
	newMessages: readonly LabeledMessage[];
	priorMessages: readonly LabeledMessage[];
	webPages: readonly ChatWebPage[];
}): string {
	const block = (message: LabeledMessage) =>
		`[${message.label}] ${message.role}:\n${message.content.trim().slice(0, EXTRACT_MESSAGE_CHARS)}`;
	return [
		params.chatTitle ? `Chat: ${params.chatTitle}` : '',
		params.priorMessages.length
			? `Context (earlier, already processed; do not cite):\n\n${params.priorMessages.map(block).join('\n\n')}`
			: '',
		params.webPages.length
			? `Web pages the chat's search or browsing returned (content not available; the assistant's messages report what they said):\n${params.webPages
					.slice(0, MAX_WEB_PAGES)
					.map(
						(page, index) =>
							`[w${index + 1}] ${page.title ?? '(untitled)'} — ${page.url}`
					)
					.join('\n')}`
			: 'Web pages: none in this stretch.',
		`New messages:\n\n${params.newMessages.map(block).join('\n\n')}`
	]
		.filter(Boolean)
		.join('\n\n');
}

// ---------------------------------------------------------------------------
// Validation

export type ChatKnowledgeEntity = {
	ref: string;
	kind: KnowledgeKind;
	name: string;
	/** The quotes that mention it, for the identity check. */
	evidence: string[];
};

export type ChatKnowledgeFact = {
	/** An entity ref, or 'me' (the user's own entity; only for "knows"). */
	subject: string;
	predicate: string;
	object?: string;
	value?: string;
	qualifiers?: Record<string, unknown>;
	quote: string;
	from: 'user' | 'web';
	messageId: string;
	web?: ChatWebPage;
	confidence: number;
	status: 'active' | 'suggested';
};

export type ChatKnowledgeDrop = { predicate: string; name?: string; reason: string };

export type ValidatedChatKnowledge = {
	entities: ChatKnowledgeEntity[];
	facts: ChatKnowledgeFact[];
	dropped: ChatKnowledgeDrop[];
};

/** Lowercase, straight quotes, single spaces: how quotes and names are compared. */
export function squashText(text: string): string {
	return text
		.replace(/[‘’ʼ]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/[–—]/g, '-')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function text(value: unknown, max = 300): string {
	return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Keep only facts that are allowed, cite a real new message, quote it exactly, and name
 * entities that really appear in the chat. Entities survive only through a surviving fact:
 * a name mentioned with nothing kept about it is never written.
 */
export function validateChatKnowledge(
	raw: unknown,
	input: {
		newMessages: readonly LabeledMessage[];
		priorMessages: readonly LabeledMessage[];
		webPages: readonly ChatWebPage[];
	}
): ValidatedChatKnowledge {
	const answer = asRecord(raw);
	const dropped: ChatKnowledgeDrop[] = [];
	const byLabel = new Map(input.newMessages.map((message) => [message.label, message]));
	const squashedByLabel = new Map(
		input.newMessages.map((message) => [message.label, squashText(message.content)])
	);
	const chatText = [...input.priorMessages, ...input.newMessages]
		.map((message) => squashText(message.content))
		.join('\n');

	// Entities the model named; a name that isn't in the chat is invented.
	const entities = new Map<string, ChatKnowledgeEntity>();
	const refByName = new Map<string, string>();
	for (const item of Array.isArray(answer.entities) ? answer.entities.slice(0, 40) : []) {
		const entity = asRecord(item);
		const ref = text(entity.ref, 40);
		const name = text(entity.name);
		const kind = entity.kind;
		if (!ref || ref === 'me' || entities.has(ref)) continue;
		if (!name || !isKnowledgeKind(kind)) {
			dropped.push({ predicate: '-', name: name || undefined, reason: 'bad entity' });
			continue;
		}
		if (!chatText.includes(squashText(name))) {
			dropped.push({ predicate: '-', name, reason: 'name not in the chat' });
			continue;
		}
		// The same entity under two refs collapses to the first.
		const nameKey = `${kind}|${normalizeKnowledgeName(name)}`;
		const first = refByName.get(nameKey);
		if (first) {
			entities.set(ref, entities.get(first)!);
			continue;
		}
		refByName.set(nameKey, ref);
		entities.set(ref, { ref, kind, name, evidence: [] });
	}

	const facts: ChatKnowledgeFact[] = [];
	const seen = new Set<string>();
	for (const item of Array.isArray(answer.facts) ? answer.facts.slice(0, 60) : []) {
		const fact = asRecord(item);
		const predicate = text(fact.predicate, 60);
		const def = getKnowledgePredicate(predicate);
		const subjectRef = text(fact.subject, 40);
		const subject = subjectRef === 'me' ? null : entities.get(subjectRef);
		const drop = (reason: string) =>
			dropped.push({ predicate: predicate || '?', name: subject?.name, reason });

		if (!def || !ALLOWED.has(predicate)) {
			drop('predicate not allowed');
			continue;
		}
		if (subjectRef === 'me' ? predicate !== 'knows' : !subject) {
			drop('unknown subject');
			continue;
		}
		const from = fact.from === 'web' ? 'web' : fact.from === 'user' ? 'user' : null;
		if (!from) {
			drop('no origin');
			continue;
		}
		const label = text(fact.message, 20);
		const message = byLabel.get(label);
		if (!message) {
			drop('cites no new message');
			continue;
		}
		if (from === 'user' ? message.role !== 'user' : message.role !== 'assistant') {
			drop(
				from === 'user'
					? 'user fact cites a non-user message'
					: 'web fact cites a non-assistant message'
			);
			continue;
		}
		let web: ChatWebPage | undefined;
		if (from === 'web') {
			const index = Number(text(fact.web, 10).replace(/^w/i, '')) - 1;
			web = Number.isInteger(index) ? input.webPages[index] : undefined;
			if (!web) {
				drop('web fact cites no page from this chat');
				continue;
			}
		}
		if (
			(USER_ONLY.has(predicate) ||
				(subject?.kind === 'person' && USER_ONLY_FOR_PEOPLE.has(predicate))) &&
			from !== 'user'
		) {
			drop('only from the user');
			continue;
		}
		const quote = text(fact.quote, 1000);
		if (
			quote.length < MIN_QUOTE_CHARS ||
			!squashedByLabel.get(label)!.includes(squashText(quote))
		) {
			drop('quote not in the message');
			continue;
		}

		let objectRef: string | undefined;
		let value: string | undefined;
		if (def.valueType === 'entity') {
			const object = entities.get(text(fact.object, 40));
			if (!object || (def.objectKinds.length && !def.objectKinds.includes(object.kind))) {
				drop('bad related entity');
				continue;
			}
			if (subject && object.ref === subject.ref) {
				drop('self loop');
				continue;
			}
			objectRef = object.ref;
		} else {
			value =
				typeof fact.value === 'string' || typeof fact.value === 'number'
					? String(fact.value).trim().slice(0, 1000)
					: '';
			if (!value) {
				drop('no value');
				continue;
			}
		}
		if (subject && def.subjectKinds.length && !def.subjectKinds.includes(subject.kind)) {
			drop(`${predicate} does not apply to a ${subject.kind}`);
			continue;
		}
		const identity = `${subjectRef}|${predicate}|${objectRef ?? squashText(value ?? '')}`;
		if (seen.has(identity)) continue;
		seen.add(identity);

		// A value (or related name) the quote doesn't contain is the model's paraphrase: keep it
		// only as a suggestion for the user to check.
		let claimed = squashText(objectRef ? (entities.get(objectRef)?.name ?? '') : (value ?? ''));
		// A URL is often said without its scheme ("their site is acme.com"): compare the address.
		if (def.valueType === 'url')
			claimed = claimed.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
		const supported = claimed.length > 0 && squashText(quote).includes(claimed);
		const qualifiers = asRecord(fact.qualifiers);
		facts.push({
			subject: subject ? subject.ref : 'me',
			predicate,
			...(objectRef ? { object: objectRef } : {}),
			...(value !== undefined ? { value } : {}),
			...(Object.keys(qualifiers).length ? { qualifiers } : {}),
			quote,
			from,
			messageId: message.id,
			...(web ? { web } : {}),
			// The user's own words outrank a search result the assistant passed on.
			confidence: from === 'user' ? 0.9 : 0.7,
			status: supported ? 'active' : 'suggested'
		});
		if (facts.length >= MAX_CAPTURE_FACTS) break;
	}

	// Only entities a kept fact touches, capped; facts touching a capped-out entity go too.
	const used = new Set<string>();
	for (const fact of facts) {
		if (fact.subject !== 'me') used.add(fact.subject);
		if (fact.object) used.add(fact.object);
	}
	const kept = [...used].slice(0, MAX_CAPTURE_ENTITIES);
	const keptSet = new Set(kept);
	const finalFacts = facts.filter(
		(fact) =>
			(fact.subject === 'me' || keptSet.has(fact.subject)) &&
			(!fact.object || keptSet.has(fact.object))
	);
	for (const fact of finalFacts) {
		for (const ref of [fact.subject, fact.object]) {
			const entity = ref && ref !== 'me' ? entities.get(ref) : undefined;
			if (entity && entity.evidence.length < 4) entity.evidence.push(fact.quote);
		}
	}
	for (const [ref, entity] of entities) {
		if (ref === entity.ref && !keptSet.has(ref))
			dropped.push({ predicate: '-', name: entity.name, reason: 'nothing kept about it' });
	}
	return {
		entities: kept.map((ref) => entities.get(ref)!),
		facts: finalFacts,
		dropped
	};
}

/** URLs and titles from the stored result of one web tool call (web_search, web_visit, web_navigate). */
export function webPagesFromToolResult(result: unknown): ChatWebPage[] {
	const out: ChatWebPage[] = [];
	const visit = (value: unknown, depth: number) => {
		if (depth > 4 || out.length >= MAX_WEB_PAGES) return;
		if (Array.isArray(value)) {
			for (const item of value) visit(item, depth + 1);
			return;
		}
		const record = asRecord(value);
		const url =
			typeof record.final_url === 'string'
				? record.final_url
				: typeof record.url === 'string'
					? record.url
					: null;
		if (url && /^https?:\/\//i.test(url)) {
			out.push({
				url: url.slice(0, 2000),
				title: typeof record.title === 'string' ? record.title.slice(0, 500) : null
			});
		}
		for (const [key, child] of Object.entries(record)) {
			if (key === 'url' || key === 'final_url' || key === 'title') continue;
			if (child && typeof child === 'object') visit(child, depth + 1);
		}
	};
	visit(result, 0);
	return out;
}

/** Unique pages in first-seen order. */
export function uniqueWebPages(pages: readonly ChatWebPage[]): ChatWebPage[] {
	const byUrl = new Map<string, ChatWebPage>();
	for (const page of pages) {
		const existing = byUrl.get(page.url);
		if (!existing) byUrl.set(page.url, page);
		else if (!existing.title && page.title) existing.title = page.title;
	}
	return [...byUrl.values()].slice(0, MAX_WEB_PAGES);
}
