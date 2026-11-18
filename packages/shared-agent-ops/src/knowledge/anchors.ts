// packages/shared-agent-ops/src/knowledge/anchors.ts
//
// Know first, search second (tasker 164, part A). Before any web search for an entry, gather what
// the user's own graph and work already say about it, for free: the entry's facts, its own
// website, links and words next to its name in linked tasks and docs, the people who work at an
// org, the org a person works at and where things are, plus "Not this one" hints from rejected
// research. Research builds its queries from these anchors, the identity check compares pages
// against them, and the extraction prompt sees them as context.
//
// Privacy: emails, phone numbers, street addresses, birthdays, notes and the user's own
// relationships never become anchors, and contact details are blanked out of every snippet
// before it can reach a search provider or a model. Names of people who work at an org are used
// (DJ, 2026-11-17: "people who work there"); only specific full names, never one-word names.
//
// Nothing here decides what text means. URLs and domains are structured formats; whether a
// domain is the entry's own site is a comparison of two identifiers (the domain's labels against
// the entry's name); snippets are literal windows around the entry's name.

import { domainOf, isSpecificPersonName, normalizeKnowledgeName, normalizeUrl } from './normalize';
import type { KnowledgeStore } from './knowledge-store';
import type { KnowledgeDataClient, KnowledgeEntityDetail, KnowledgeRecordKind } from './types';
import type { KnowledgeKind } from './vocabulary';

export type KnowledgeCircle = 'inner' | 'public' | 'unknown';
export type KnowledgeCircleSource = 'signals' | 'model' | 'user';
export const KNOWLEDGE_CIRCLES: readonly KnowledgeCircle[] = ['inner', 'public', 'unknown'];

export function isKnowledgeCircle(value: unknown): value is KnowledgeCircle {
	return typeof value === 'string' && (KNOWLEDGE_CIRCLES as readonly string[]).includes(value);
}

/** What an entry is NOT, from "Not this one" (knowledge_research_hints). */
export interface KnowledgeResearchHint {
	id?: string;
	label: string;
	domains: string[];
	urls: string[];
	run_id?: string | null;
	created_at?: string;
}

export interface KnowledgeAnchorMention {
	record_kind: KnowledgeRecordKind;
	title: string | null;
	/** Words around the entry's name, contact details blanked. */
	text: string;
}

export interface KnowledgeAnchors {
	entityId: string;
	name: string;
	kind: KnowledgeKind;
	circle: KnowledgeCircle;
	/** The user's own entity knows this person. */
	knownByMe: boolean;
	/** The entry's own website(s): homepage facts, or a domain in linked work that matches its name. */
	domains: string[];
	/** Other links that appear next to its name in linked work. */
	urls: string[];
	/** "Works at: LA Industrial Services", "Located in: Cody, WY"... Never contact details. */
	facts: string[];
	/** For a person: the org they work at, and that org's website. */
	employer: string | null;
	employerDomain: string | null;
	/** For an org: specific names of people in the user's graph who work there. */
	people: string[];
	places: string[];
	mentions: KnowledgeAnchorMention[];
	/** What it is not ("not the Cody Shooting Complex in Long Grove, IA"). */
	not: KnowledgeResearchHint[];
}

export const ANCHOR_LIMITS = Object.freeze({
	records: 8,
	mentions: 5,
	mentionChars: 280,
	urls: 4,
	people: 5,
	facts: 10
});

// ---------------------------------------------------------------------------
// Structured-format helpers

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Phone-shaped digit runs (7+ digits with common separators). Formats, not language.
const PHONE = /(?:\+?\(?\d[\d\s().-]{6,}\d)/g;

/** Blank out emails and phone numbers. Used on every snippet before it leaves for a model. */
export function redactContactDetails(text: string): string {
	return text.replace(EMAIL, '[email]').replace(PHONE, (match) => {
		const digits = match.replace(/\D/g, '');
		// Years, ranges and short numbers are left alone; phone numbers have 7–15 digits.
		return digits.length >= 7 && digits.length <= 15 ? '[phone]' : match;
	});
}

// Full URLs, or bare domains on common TLDs ("codyshootingcomplex.org"). A structured format.
const URL_PATTERN =
	/\bhttps?:\/\/[^\s<>()"'\]]+|(?<![@\w.-])(?:[a-z0-9-]+\.)+(?:com|org|net|io|co|us|ai|app|dev|biz|info|edu|gov|me|tv|uk|ca)\b(?:\/[^\s<>()"'\]]*)?/gi;
// The domain part of an email address ("info@acme.com" → acme.com).
const EMAIL_DOMAIN = /@((?:[a-z0-9-]+\.)+[a-z]{2,})\b/gi;

export interface FoundLink {
	url: string;
	domain: string;
	index: number;
	/** Taken from an email address (only ever used for an org's own domain). */
	fromEmail: boolean;
}

export function findLinks(text: string): FoundLink[] {
	const out: FoundLink[] = [];
	for (const match of text.matchAll(URL_PATTERN)) {
		// Trailing punctuation and markdown (`**site.com**`, `(site.com)`) is not part of a URL.
		const raw = match[0].replace(/[.,;:!?*_)\]}>'"`]+$/, '');
		const url = normalizeUrl(raw);
		const domain = url ? domainOf(url) : null;
		if (url && domain) out.push({ url, domain, index: match.index ?? 0, fromEmail: false });
	}
	for (const match of text.matchAll(EMAIL_DOMAIN)) {
		const domain = domainOf(match[1]!);
		if (domain)
			out.push({
				url: `https://${domain}`,
				domain,
				index: match.index ?? 0,
				fromEmail: true
			});
	}
	return out;
}

/** BuildOS's own links (a task or doc inside the app) say nothing about the entry. */
const APP_HOSTS = ['build-os.com', 'buildos.com'];

/**
 * A link from the user's notes as context: no query string or fragment (they carry account
 * emails, map addresses and tracking), never the app's own pages.
 */
export function contextLink(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (APP_HOSTS.some((h) => hostMatchesDomain(parsed.hostname, h))) return null;
		return `${parsed.protocol}//${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/+$/, '')}`;
	} catch {
		return null;
	}
}

/** The registrable host without "www." (shop.acme.com stays; it is compared label by label). */
export function hostOf(url: string): string | null {
	return domainOf(url);
}

/** True when a page's host is the domain or a subdomain of it. */
export function hostMatchesDomain(host: string, domain: string): boolean {
	const h = host.replace(/^www\./, '').toLowerCase();
	const d = domain.replace(/^www\./, '').toLowerCase();
	return h === d || h.endsWith(`.${d}`);
}

// Legal-form and filler words dropped when comparing a name with a domain ("LA Industrial
// Services LLC" vs laindustrial.com). Comparing identifiers, not reading language; a miss only
// means a domain isn't recognised as the entry's own, which costs one extra search.
const NAME_FILLER = new Set([
	'the',
	'and',
	'of',
	'inc',
	'llc',
	'ltd',
	'co',
	'corp',
	'company',
	'services',
	'group',
	'pllc',
	'lp'
]);

/** "shop.acme.co.uk" → "acme.co.uk"; "codyrange.ezfacility.com" → "ezfacility.com". */
export function registrableDomain(host: string): string {
	const parts = host
		.toLowerCase()
		.replace(/^www\./, '')
		.split('.');
	if (parts.length <= 2) return parts.join('.');
	const secondLevel = ['co', 'com', 'org', 'net', 'ac', 'gov', 'edu'];
	const take = parts.at(-1)!.length === 2 && secondLevel.includes(parts.at(-2)!) ? 3 : 2;
	return parts.slice(-take).join('.');
}

/**
 * Whether a domain looks like this entry's own: its registrable label spells the entry's name.
 * Subdomains don't count ("acme.vendor.com" is the vendor's site, not Acme's).
 */
export function domainMatchesName(domain: string, name: string): boolean {
	const registrable = registrableDomain(domain).split('.');
	if (registrable.length < 2) return false;
	const labels = [registrable[0]!].filter((label) => label.length >= 4);
	const tokens = normalizeKnowledgeName(name)
		.split(/[^\p{L}\p{N}]+/u)
		.filter((t) => t.length >= 2 && !NAME_FILLER.has(t));
	if (!tokens.length || !labels.length) return false;
	const compact = tokens.join('');
	return labels.some((raw) => {
		const label = raw.replace(/-/g, '');
		if (compact.length >= 4 && (label === compact || label.includes(compact))) return true;
		if (label.length >= 5 && compact.startsWith(label) && label.length >= compact.length * 0.6)
			return true;
		const significant = tokens.filter((t) => t.length >= 3);
		return (
			tokens.length >= 2 && significant.length >= 1 && tokens.every((t) => label.includes(t))
		);
	});
}

/** Literal windows around the entry's name (case-insensitive), or the start of the text. */
export function mentionWindow(
	text: string,
	name: string,
	chars: number = ANCHOR_LIMITS.mentionChars
): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	if (!flat) return '';
	const at = flat.toLowerCase().indexOf(name.toLowerCase().trim());
	if (at < 0) return redactContactDetails(flat.slice(0, chars));
	const half = Math.floor((chars - name.length) / 2);
	const start = Math.max(0, at - half);
	const end = Math.min(flat.length, at + name.length + half);
	return redactContactDetails(
		`${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
	);
}

export function hasKnowledgeAnchors(anchors: KnowledgeAnchors | null | undefined): boolean {
	if (!anchors) return false;
	return Boolean(
		anchors.domains.length ||
			anchors.urls.length ||
			anchors.facts.length ||
			anchors.employer ||
			anchors.people.length ||
			anchors.places.length ||
			anchors.mentions.length ||
			anchors.not.length
	);
}

/** Every domain research must avoid for this entry. */
export function excludedDomains(anchors: KnowledgeAnchors | null | undefined): string[] {
	if (!anchors) return [];
	const own = new Set(anchors.domains);
	return [...new Set(anchors.not.flatMap((hint) => hint.domains))].filter((d) => !own.has(d));
}

/** Compact, model-facing view of the anchors (no ids). */
export function anchorsForPrompt(anchors: KnowledgeAnchors): Record<string, unknown> {
	return {
		name: anchors.name,
		kind: anchors.kind,
		circle: anchors.circle,
		...(anchors.knownByMe ? { known_personally: true } : {}),
		...(anchors.domains.length ? { own_website: anchors.domains } : {}),
		...(anchors.facts.length ? { known_facts: anchors.facts } : {}),
		...(anchors.employer ? { works_at: anchors.employer } : {}),
		...(anchors.employerDomain ? { employer_website: anchors.employerDomain } : {}),
		...(anchors.people.length ? { people_who_work_there: anchors.people } : {}),
		...(anchors.places.length ? { places: anchors.places } : {}),
		...(anchors.urls.length ? { links_in_user_notes: anchors.urls } : {}),
		...(anchors.mentions.length
			? { how_the_user_mentions_it: anchors.mentions.map((m) => m.text) }
			: {}),
		...(anchors.not.length ? { known_not_to_be: anchors.not.map((h) => h.label) } : {})
	};
}

// ---------------------------------------------------------------------------
// Gathering

/** Facts never used as anchors: contact details, private notes, the user's relationships. */
const PRIVATE_PREDICATES = new Set([
	'email',
	'phone',
	'address',
	'birthday',
	'note',
	'knows',
	'alias',
	'related_to'
]);

function clip(text: string, chars: number): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	return flat.length > chars ? `${flat.slice(0, chars - 1)}…` : flat;
}

function pushUnique<T>(list: T[], value: T, limit: number) {
	if (list.length < limit && !list.includes(value)) list.push(value);
}

/**
 * Collect anchors for one entry from the user's graph and linked work. Reads only; no paid calls.
 * `db` must be able to read the linked tasks/docs (the worker's service client, or the user's).
 */
export async function gatherKnowledgeAnchors(
	store: KnowledgeStore,
	db: KnowledgeDataClient,
	detail: KnowledgeEntityDetail,
	options: { circle?: KnowledgeCircle; signal?: AbortSignal } = {}
): Promise<KnowledgeAnchors> {
	const { entity } = detail;
	const anchors: KnowledgeAnchors = {
		entityId: entity.id,
		name: entity.name,
		kind: entity.kind,
		circle: options.circle ?? 'unknown',
		knownByMe: detail.known_by_me,
		domains: [],
		urls: [],
		facts: [],
		employer: null,
		employerDomain: null,
		people: [],
		places: [],
		mentions: [],
		not: []
	};

	let employerId: string | null = null;
	for (const fact of detail.facts) {
		if (fact.status !== 'active' || PRIVATE_PREDICATES.has(fact.predicate)) continue;
		const value = fact.entity?.name ?? fact.value;
		if (!value) continue;
		if (fact.predicate === 'homepage' || fact.predicate === 'url') {
			const domain = domainOf(value);
			if (domain) pushUnique(anchors.domains, domain, 4);
		}
		if (fact.predicate === 'works_at' && fact.entity && !employerId) {
			employerId = fact.entity.id;
			anchors.employer = fact.entity.name;
		}
		if (fact.predicate === 'located_in') pushUnique(anchors.places, value, 4);
		pushUnique(anchors.facts, `${fact.label}: ${clip(value, 160)}`, ANCHOR_LIMITS.facts);
	}
	for (const fact of detail.incoming) {
		if (fact.status !== 'active' || fact.predicate !== 'works_at') continue;
		const person = fact.entity;
		if (!person || person.is_self || person.kind !== 'person') continue;
		if (isSpecificPersonName(person.name))
			pushUnique(anchors.people, person.name, ANCHOR_LIMITS.people);
	}

	const [employer, hints, records] = await Promise.all([
		employerId ? store.getEntity(employerId).catch(() => null) : Promise.resolve(null),
		store.listResearchHints(entity.id).catch(() => [] as KnowledgeResearchHint[]),
		loadLinkedRecordText(db, detail.links, options.signal)
	]);
	if (employer) {
		for (const fact of employer.facts) {
			if (fact.status !== 'active') continue;
			if (fact.predicate === 'homepage' && fact.value && !anchors.employerDomain)
				anchors.employerDomain = domainOf(fact.value);
			if (fact.predicate === 'located_in' && fact.entity)
				pushUnique(anchors.places, fact.entity.name, 4);
		}
	}
	anchors.not = hints;

	// Words around the name in linked work: the link's own quote first, then the record text.
	for (const link of detail.links) {
		if (anchors.mentions.length >= ANCHOR_LIMITS.mentions) break;
		const record = records.get(link.record_id);
		const text = link.quote?.trim() || record?.text || '';
		const snippet = text ? mentionWindow(text, entity.name) : '';
		if (!snippet && !record?.title) continue;
		anchors.mentions.push({
			record_kind: link.record_kind,
			title: record?.title ? clip(redactContactDetails(record.title), 120) : null,
			text: snippet || clip(redactContactDetails(record!.title!), 120)
		});
	}
	// Links in that work: a domain spelling the entry's name is its own site; other links next to
	// its name are context. Email-derived domains only ever count as an org's own site.
	const notDomains = new Set(hints.flatMap((h) => h.domains));
	for (const record of records.values()) {
		const full = `${record.title ?? ''}\n${record.text}`;
		const nameAt = full.toLowerCase().indexOf(entity.name.toLowerCase());
		for (const link of findLinks(full)) {
			if (notDomains.has(link.domain)) continue;
			const own = domainMatchesName(link.domain, entity.name);
			if (link.fromEmail) {
				if (own && entity.kind === 'org')
					pushUnique(anchors.domains, registrableDomain(link.domain), 4);
				continue;
			}
			if (own && entity.kind !== 'person') {
				pushUnique(anchors.domains, registrableDomain(link.domain), 4);
				continue;
			}
			const context = contextLink(link.url);
			if (!context) continue;
			if (own || (nameAt >= 0 && Math.abs(link.index - nameAt) <= 240))
				pushUnique(anchors.urls, context, ANCHOR_LIMITS.urls);
		}
	}
	return anchors;
}

interface LinkedRecordText {
	title: string | null;
	text: string;
}

/** Title + text of the most recent linked tasks and docs (bounded). */
async function loadLinkedRecordText(
	db: KnowledgeDataClient,
	links: KnowledgeEntityDetail['links'],
	_signal?: AbortSignal
): Promise<Map<string, LinkedRecordText>> {
	const out = new Map<string, LinkedRecordText>();
	const picked = links.slice(0, ANCHOR_LIMITS.records);
	const taskIds = picked.filter((l) => l.record_kind === 'task').map((l) => l.record_id);
	const docIds = picked.filter((l) => l.record_kind === 'document').map((l) => l.record_id);
	const [tasks, docs] = await Promise.all([
		taskIds.length
			? db.from('onto_tasks').select('id, title, description').in('id', taskIds)
			: Promise.resolve({ data: [], error: null }),
		docIds.length
			? db.from('onto_documents').select('id, title, content').in('id', docIds)
			: Promise.resolve({ data: [], error: null })
	]);
	for (const row of (tasks?.data ?? []) as Array<Record<string, unknown>>) {
		out.set(String(row.id), {
			title: typeof row.title === 'string' ? row.title : null,
			text: typeof row.description === 'string' ? row.description.slice(0, 20_000) : ''
		});
	}
	for (const row of (docs?.data ?? []) as Array<Record<string, unknown>>) {
		out.set(String(row.id), {
			title: typeof row.title === 'string' ? row.title : null,
			text: typeof row.content === 'string' ? row.content.slice(0, 60_000) : ''
		});
	}
	return out;
}
