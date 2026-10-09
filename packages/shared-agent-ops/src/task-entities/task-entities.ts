// packages/shared-agent-ops/src/task-entities/task-entities.ts
//
// Task entities: the people, places, times, phone numbers, emails and links a task's text
// mentions (docs/research/task-entity-layer-2026-10-07.md). Three lanes feed them:
//   - known: fields BuildOS already stores (start/due, linked events). Not handled here.
//   - detected: fixed formats (phone numbers, emails, URLs, meeting links). Found by
//     detectTaskTextEntities() with certainty, so the strip can show them before a model has
//     read the task. Pattern matching is fine here: these are structured formats, not language.
//   - understood: people, organizations, places, times written in prose, and which number or
//     address the task actually means. Only a model decides those (AGENTS.md: never classify
//     language with regex); normalizeExtractedTaskEntities() checks its structured answer.
//
// planTaskEntityMerge() keeps stored entities correct when the text changes: rows are matched by
// (kind, natural key), the owner's confirmed rows are kept, dismissed rows block the same entity
// from coming back, and only machine suggestions are replaced or removed.
//
// Browser-safe: no Node imports.

export const TASK_ENTITY_KINDS = [
	'person',
	'org',
	'place',
	'time',
	'phone',
	'email',
	'link',
	'meeting_link',
	'reference'
] as const;
export type TaskEntityKind = (typeof TASK_ENTITY_KINDS)[number];

export const TASK_ENTITY_ROLES = [
	'primary',
	'secondary',
	'avoid',
	'hours',
	'log',
	'follow_up',
	'meeting',
	'deadline',
	'owner_self'
] as const;
export type TaskEntityRole = (typeof TASK_ENTITY_ROLES)[number];

export type TaskEntityStatus = 'suggested' | 'confirmed' | 'dismissed';
export type TaskEntityConfidence = 'high' | 'medium' | 'low';
export type TaskEntitySource = 'llm' | 'agent' | 'user' | 'calendar';

/** A stored row of onto_task_entities. */
export type TaskEntityRecord = {
	id: string;
	task_id: string;
	project_id: string;
	kind: TaskEntityKind;
	natural_key: string;
	value: string;
	display: string;
	role: TaskEntityRole;
	about: string | null;
	quote: string | null;
	confidence: TaskEntityConfidence;
	source: TaskEntitySource;
	status: TaskEntityStatus;
	in_text: boolean;
	position: number;
	data: Record<string, unknown>;
	source_hash: string | null;
	extractor_version: number | null;
	status_changed_at: string | null;
	created_at: string;
	updated_at: string;
};

/** One entity read from a task's text, checked and normalized, not yet stored. */
export type ExtractedTaskEntity = {
	kind: TaskEntityKind;
	naturalKey: string;
	value: string;
	display: string;
	role: TaskEntityRole;
	about: string | null;
	quote: string | null;
	confidence: TaskEntityConfidence;
	position: number;
	data: Record<string, unknown>;
};

export const MAX_TASK_ENTITIES = 24;
/** Shown above a task's text: the few details the owner needs at hand (a model's `key` flag). */
export const MAX_KEY_TASK_ENTITIES = 3;
const MAX_DISPLAY = 80;
const MAX_ABOUT = 120;
const MAX_QUOTE = 400;

const isKind = (value: unknown): value is TaskEntityKind =>
	typeof value === 'string' && (TASK_ENTITY_KINDS as readonly string[]).includes(value);
const isRole = (value: unknown): value is TaskEntityRole =>
	typeof value === 'string' && (TASK_ENTITY_ROLES as readonly string[]).includes(value);

function cleanText(value: unknown, max: number): string | null {
	if (typeof value !== 'string') return null;
	const text = value.replace(/\s+/g, ' ').trim();
	if (!text) return null;
	return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// ---------------------------------------------------------------------------
// Fixed formats
// ---------------------------------------------------------------------------

/** E.164 (+15555550144) for a phone-shaped string, or null. North America is the default. */
export function normalizePhone(raw: string | null | undefined): string | null {
	if (typeof raw !== 'string') return null;
	const trimmed = raw.trim();
	if (!trimmed) return null;
	const digits = trimmed.replace(/\D/g, '');
	if (trimmed.startsWith('+')) {
		return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
	}
	if (trimmed.startsWith('00') && digits.length >= 10 && digits.length <= 17) {
		return `+${digits.slice(2)}`;
	}
	if (digits.length === 10) return `+1${digits}`;
	if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
	return null;
}

/** "410-555-0144" for North American numbers, the E.164 form otherwise. */
export function formatPhone(e164: string): string {
	const nanp = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
	return nanp ? `${nanp[1]}-${nanp[2]}-${nanp[3]}` : e164;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
	if (typeof raw !== 'string') return null;
	const email = raw
		.trim()
		.replace(/^mailto:/i, '')
		.toLowerCase();
	return /^[^\s@<>()",;]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(email) ? email : null;
}

/** An http(s) URL in canonical form (scheme added to bare domains, fragment dropped), or null. */
export function normalizeUrl(raw: string | null | undefined): URL | null {
	if (typeof raw !== 'string') return null;
	let text = raw.trim().replace(/[).,;:!?'"\]]+$/, '');
	if (!text) return null;
	if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
	let url: URL;
	try {
		url = new URL(text);
	} catch {
		return null;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
	if (!url.hostname.includes('.')) return null;
	url.hash = '';
	return url;
}

// Extensions of files people name in tasks ("README.md", "robots.txt"). A value ending in one,
// written without a scheme, is a file name: `.md` and the like parse as web addresses but are not.
const FILE_EXTENSIONS = new Set([
	'md',
	'txt',
	'csv',
	'json',
	'ts',
	'js',
	'svelte',
	'py',
	'sql',
	'yaml',
	'yml',
	'log'
]);

/** True for a file name written without a scheme ("notes/email-griffin.md"), not a web address. */
export function looksLikeFileName(raw: string | null | undefined): boolean {
	if (typeof raw !== 'string') return false;
	const text = raw.trim();
	if (!text || /^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return false;
	const last = text.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop() ?? '';
	const dot = last.lastIndexOf('.');
	return dot > 0 && FILE_EXTENSIONS.has(last.slice(dot + 1).toLowerCase());
}

function urlKey(url: URL): string {
	const host = url.hostname.toLowerCase().replace(/^www\./, '');
	const path = url.pathname.replace(/\/+$/, '');
	return `${host}${path}${url.search}`;
}

const MEETING_HOSTS: ReadonlyArray<[host: string, provider: string]> = [
	['zoom.us', 'Zoom'],
	['zoomgov.com', 'Zoom'],
	['meet.google.com', 'Google Meet'],
	['teams.microsoft.com', 'Teams'],
	['teams.live.com', 'Teams'],
	['webex.com', 'Webex'],
	['whereby.com', 'Whereby'],
	['gotomeeting.com', 'GoTo'],
	['meet.jit.si', 'Jitsi'],
	['around.co', 'Around']
];

/** The video-meeting provider a URL belongs to (by host), or null. */
export function meetingProvider(url: URL): string | null {
	const host = url.hostname.toLowerCase().replace(/^www\./, '');
	const match = MEETING_HOSTS.find(([known]) => host === known || host.endsWith(`.${known}`));
	return match ? match[1] : null;
}

function linkDisplay(url: URL): string {
	const host = url.hostname.replace(/^www\./, '');
	const path = url.pathname.replace(/\/+$/, '');
	const short = path && path.length <= 24 ? `${host}${path}` : host;
	return short.length > MAX_DISPLAY ? `${short.slice(0, MAX_DISPLAY - 1)}…` : short;
}

/** Collapsed lowercase text, for matching names, places and references across re-reads. */
export function entityTextKey(raw: string): string {
	return raw
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[‘’]/g, "'")
		.replace(/[^\p{L}\p{N}@+.'#/-]+/gu, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/** An ISO 8601 date or date-time (with offset) the model wrote, checked; or null. */
export function normalizeIsoTime(raw: string | null | undefined): string | null {
	if (typeof raw !== 'string') return null;
	const text = raw.trim();
	if (ISO_DATE.test(text)) {
		const date = new Date(`${text}T00:00:00Z`);
		return Number.isNaN(date.getTime()) ? null : text;
	}
	if (ISO_DATETIME.test(text)) {
		return Number.isNaN(new Date(text).getTime()) ? null : text;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Detected lane
// ---------------------------------------------------------------------------

export type DetectedTaskEntity = {
	kind: 'phone' | 'email' | 'link' | 'meeting_link';
	value: string;
	naturalKey: string;
	display: string;
	quote: string;
	data: Record<string, unknown>;
};

// Structured-format patterns only (see the header comment).
const URL_PATTERN = /\bhttps?:\/\/[^\s<>()"'`]+/gi;
const BARE_DOMAIN_PATTERN =
	/(?<![@\w.-])(?:[a-z0-9-]+\.)+(?:com|org|net|gov|edu|io|co|us|app|dev|ai|info|biz|me|ly|so|link|page|site)(?:\/[^\s<>()"'`]*)?(?![\w@-])/gi;
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const PHONE_PATTERN = /(?:\+\d{1,3}[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/g;

/**
 * Phone numbers, emails, links and meeting links in a task's text, in reading order, one per
 * value. Certain but context-blind: a number the task says not to use is found like any other.
 */
export function detectTaskTextEntities(text: string): DetectedTaskEntity[] {
	if (!text) return [];
	const found: Array<DetectedTaskEntity & { at: number }> = [];
	const seen = new Set<string>();
	const add = (entity: DetectedTaskEntity, at: number) => {
		const key = `${entity.kind}:${entity.naturalKey}`;
		if (seen.has(key)) return;
		seen.add(key);
		found.push({ ...entity, at });
	};

	// Mask matched spans so a URL's digits or an email's domain aren't read twice.
	let masked = text;
	const mask = (start: number, length: number) => {
		masked = masked.slice(0, start) + ' '.repeat(length) + masked.slice(start + length);
	};

	for (const match of text.matchAll(URL_PATTERN)) {
		const url = normalizeUrl(match[0]);
		if (!url) continue;
		const provider = meetingProvider(url);
		const quote = match[0].replace(/[).,;:!?'"\]]+$/, '');
		add(
			{
				kind: provider ? 'meeting_link' : 'link',
				value: url.toString(),
				naturalKey: urlKey(url),
				display: provider ?? linkDisplay(url),
				quote,
				data: provider ? { provider } : {}
			},
			match.index ?? 0
		);
		mask(match.index ?? 0, match[0].length);
	}

	for (const match of masked.matchAll(EMAIL_PATTERN)) {
		const email = normalizeEmail(match[0]);
		if (!email) continue;
		add(
			{
				kind: 'email',
				value: email,
				naturalKey: email,
				display: email,
				quote: match[0],
				data: {}
			},
			match.index ?? 0
		);
		mask(match.index ?? 0, match[0].length);
	}

	for (const match of masked.matchAll(BARE_DOMAIN_PATTERN)) {
		const url = normalizeUrl(match[0]);
		if (!url) continue;
		const provider = meetingProvider(url);
		add(
			{
				kind: provider ? 'meeting_link' : 'link',
				value: url.toString(),
				naturalKey: urlKey(url),
				display: provider ?? linkDisplay(url),
				quote: match[0],
				data: provider ? { provider } : {}
			},
			match.index ?? 0
		);
		mask(match.index ?? 0, match[0].length);
	}

	for (const match of masked.matchAll(PHONE_PATTERN)) {
		const phone = normalizePhone(match[0]);
		if (!phone) continue;
		add(
			{
				kind: 'phone',
				value: phone,
				naturalKey: phone,
				display: formatPhone(phone),
				quote: match[0].trim(),
				data: {}
			},
			match.index ?? 0
		);
	}

	return found.sort((a, b) => a.at - b.at).map(({ at: _at, ...entity }) => entity);
}

// ---------------------------------------------------------------------------
// Understood lane: checking the model's answer
// ---------------------------------------------------------------------------

function compactForSearch(text: string): string {
	return text
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[‘’]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/[–—]/g, '-')
		.replace(/[*_`]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** True when `quote` appears in `text`, ignoring case, spacing and markdown emphasis. */
export function quoteInText(text: string, quote: string | null | undefined): boolean {
	if (!quote) return false;
	const needle = compactForSearch(quote);
	if (needle.length < 2) return false;
	return compactForSearch(text).includes(needle);
}

export type OwnerContact = { emails?: string[]; phones?: string[] };

type RawEntity = Record<string, unknown>;

/**
 * The model's raw answer → entities that may be stored. Drops anything whose quote is not in
 * the task text (invented), whose kind or value does not check out, or that repeats an earlier
 * (kind, key). The owner's own phone numbers and emails are marked `owner_self`. Fixed-format
 * values the detector found but the model left out are added as secondary, so a number or
 * link is never lost to a model omission.
 */
export function normalizeExtractedTaskEntities(
	raw: unknown,
	text: string,
	opts: { owner?: OwnerContact; detected?: DetectedTaskEntity[] } = {}
): { entities: ExtractedTaskEntity[]; dropped: string[] } {
	const list: unknown[] = Array.isArray(raw)
		? raw
		: raw && typeof raw === 'object' && Array.isArray((raw as { entities?: unknown }).entities)
			? (raw as { entities: unknown[] }).entities
			: [];
	const ownerEmails = new Set(
		(opts.owner?.emails ?? []).map((email) => normalizeEmail(email)).filter(Boolean)
	);
	const ownerPhones = new Set(
		(opts.owner?.phones ?? []).map((phone) => normalizePhone(phone)).filter(Boolean)
	);
	const entities: ExtractedTaskEntity[] = [];
	const dropped: string[] = [];
	const seen = new Set<string>();
	let keyCount = 0;
	// A phone number, email or link must be written in the text itself: the quote parses as
	// that value, or the detector found it, or the model's value is literally there. A model
	// that composes "https://tandemcpa.com/contact" from "the contact form on their website"
	// is dropped.
	const detectedInText = new Set(
		detectTaskTextEntities(text).map((found) =>
			found.kind === 'meeting_link'
				? `link:${found.naturalKey}`
				: `${found.kind}:${found.naturalKey}`
		)
	);
	const grounded = (
		family: 'phone' | 'email' | 'link',
		key: string,
		quote: string,
		rawValue: string
	): boolean => {
		if (detectedInText.has(`${family}:${key}`)) return true;
		const fromQuote =
			family === 'phone'
				? normalizePhone(quote)
				: family === 'email'
					? normalizeEmail(quote)
					: (() => {
							const url = normalizeUrl(quote);
							return url ? urlKey(url) : null;
						})();
		if (fromQuote === key) return true;
		return rawValue.length > 3 && quoteInText(text, rawValue);
	};

	const push = (entity: ExtractedTaskEntity) => {
		const key = `${entity.kind}:${entity.naturalKey}`;
		if (seen.has(key)) return false;
		seen.add(key);
		entities.push({ ...entity, position: entities.length });
		return true;
	};

	for (const item of list) {
		if (entities.length >= MAX_TASK_ENTITIES) break;
		if (!item || typeof item !== 'object') continue;
		const entry = item as RawEntity;
		if (!isKind(entry.kind)) {
			dropped.push(`unknown kind ${String(entry.kind).slice(0, 20)}`);
			continue;
		}
		let kind: TaskEntityKind = entry.kind;
		const quote = cleanText(entry.quote, MAX_QUOTE);
		if (!quote || !quoteInText(text, quote)) {
			dropped.push(`${kind}: quote not in the text`);
			continue;
		}
		let role: TaskEntityRole = isRole(entry.role) ? entry.role : 'primary';
		const confidence: TaskEntityConfidence =
			entry.confidence === 'high' || entry.confidence === 'low' ? entry.confidence : 'medium';
		const about = cleanText(entry.about, MAX_ABOUT);
		const rawValue = typeof entry.value === 'string' ? entry.value : '';
		let display = cleanText(entry.display, MAX_DISPLAY);
		let value: string;
		let naturalKey: string;
		const data: Record<string, unknown> = {};

		if (kind === 'phone') {
			const phone = normalizePhone(quote) ?? normalizePhone(rawValue);
			if (!phone) {
				dropped.push('phone: not a phone number');
				continue;
			}
			if (!grounded('phone', phone, quote, rawValue)) {
				dropped.push('phone: number not in the text');
				continue;
			}
			value = phone;
			naturalKey = phone;
			display = formatPhone(phone);
			if (ownerPhones.has(phone)) role = 'owner_self';
		} else if (kind === 'email') {
			const email = normalizeEmail(quote) ?? normalizeEmail(rawValue);
			if (!email) {
				dropped.push('email: not an email address');
				continue;
			}
			if (!grounded('email', email, quote, rawValue)) {
				dropped.push('email: address not in the text');
				continue;
			}
			value = email;
			naturalKey = email;
			display = email;
			if (ownerEmails.has(email)) role = 'owner_self';
		} else if (kind === 'link' || kind === 'meeting_link') {
			if (looksLikeFileName(quote) || looksLikeFileName(rawValue)) {
				dropped.push(`${kind}: a file name, not a web address`);
				continue;
			}
			const url = normalizeUrl(quote) ?? normalizeUrl(rawValue);
			if (!url) {
				dropped.push(`${kind}: not a web address`);
				continue;
			}
			if (!grounded('link', urlKey(url), quote, rawValue)) {
				dropped.push(`${kind}: address not in the text`);
				continue;
			}
			const provider = meetingProvider(url);
			kind = provider ? 'meeting_link' : 'link';
			if (provider) data.provider = provider;
			value = url.toString();
			naturalKey = urlKey(url);
			display =
				kind === 'meeting_link' ? (provider ?? 'Join') : (display ?? linkDisplay(url));
		} else if (kind === 'time') {
			const iso = normalizeIsoTime(rawValue);
			if (!iso) {
				dropped.push('time: value is not an ISO date or date-time');
				continue;
			}
			value = iso;
			naturalKey = `${iso}|${role}`;
			if (!display) display = iso;
			const end = normalizeIsoTime(typeof entry.end === 'string' ? entry.end : null);
			if (end) data.end = end;
		} else {
			const named = cleanText(rawValue, 300) ?? display ?? quote;
			value = named;
			naturalKey = entityTextKey(named);
			if (!naturalKey) {
				dropped.push(`${kind}: empty value`);
				continue;
			}
			if (!display) display = cleanText(named, MAX_DISPLAY) ?? named;
		}

		// The few things the owner needs at hand to do the task (v5 prompt). Not for the owner's
		// own details, things to avoid, or past background.
		if (
			entry.key === true &&
			keyCount < MAX_KEY_TASK_ENTITIES &&
			role !== 'owner_self' &&
			role !== 'avoid' &&
			role !== 'log'
		) {
			data.key = true;
		}

		if (
			push({
				kind,
				naturalKey,
				value,
				display: display ?? value,
				role,
				about,
				quote,
				confidence,
				position: 0,
				data
			}) &&
			data.key
		) {
			keyCount += 1;
		}
	}

	for (const found of opts.detected ?? []) {
		if (entities.length >= MAX_TASK_ENTITIES) break;
		let role: TaskEntityRole = 'secondary';
		if (found.kind === 'phone' && ownerPhones.has(found.value)) role = 'owner_self';
		if (found.kind === 'email' && ownerEmails.has(found.value)) role = 'owner_self';
		push({
			kind: found.kind,
			naturalKey: found.naturalKey,
			value: found.value,
			display: found.display,
			role,
			about: null,
			quote: found.quote,
			confidence: 'medium',
			position: 0,
			data: { ...found.data, detector_only: true }
		});
	}

	return { entities, dropped };
}

// ---------------------------------------------------------------------------
// Keeping stored entities correct
// ---------------------------------------------------------------------------

type ExistingRow = Pick<
	TaskEntityRecord,
	'id' | 'kind' | 'natural_key' | 'status' | 'source' | 'quote' | 'value' | 'in_text'
>;

export type TaskEntityRowPatch = Partial<
	Pick<
		TaskEntityRecord,
		| 'value'
		| 'display'
		| 'role'
		| 'about'
		| 'quote'
		| 'confidence'
		| 'in_text'
		| 'position'
		| 'data'
	>
>;

export type TaskEntityMergePlan = {
	insert: ExtractedTaskEntity[];
	update: Array<{ id: string; patch: TaskEntityRowPatch }>;
	remove: string[];
};

/**
 * What to write after a re-read:
 *   - extracted entity with no stored row → insert as a suggestion;
 *   - stored suggestion re-read → refresh it; not re-read → remove it (its text is gone);
 *   - stored confirmed row → keep it; `in_text` says whether its words are still there;
 *   - stored dismissed row → keep it untouched, and nothing with its (kind, key) is inserted;
 *   - rows another writer made (agent, user, calendar) are never removed by a re-read.
 */
export function planTaskEntityMerge(
	existing: ExistingRow[],
	extracted: ExtractedTaskEntity[],
	text: string
): TaskEntityMergePlan {
	const plan: TaskEntityMergePlan = { insert: [], update: [], remove: [] };
	const byKey = new Map(existing.map((row) => [`${row.kind}:${row.natural_key}`, row]));
	const matched = new Set<string>();

	for (const entity of extracted) {
		const row = byKey.get(`${entity.kind}:${entity.naturalKey}`);
		if (!row) {
			plan.insert.push(entity);
			continue;
		}
		matched.add(row.id);
		if (row.status === 'dismissed') continue;
		if (row.status === 'confirmed') {
			const patch: TaskEntityRowPatch = { quote: entity.quote, position: entity.position };
			if (!row.in_text) patch.in_text = true;
			plan.update.push({ id: row.id, patch });
			continue;
		}
		plan.update.push({
			id: row.id,
			patch: {
				value: entity.value,
				display: entity.display,
				role: entity.role,
				about: entity.about,
				quote: entity.quote,
				confidence: entity.confidence,
				in_text: true,
				position: entity.position,
				data: entity.data
			}
		});
	}

	for (const row of existing) {
		if (matched.has(row.id) || row.status === 'dismissed') continue;
		if (row.status === 'confirmed' || row.source !== 'llm') {
			const stillThere = quoteInText(text, row.quote) || quoteInText(text, row.value);
			if (stillThere !== row.in_text) {
				plan.update.push({ id: row.id, patch: { in_text: stillThere } });
			}
			continue;
		}
		plan.remove.push(row.id);
	}

	return plan;
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

export type TaskEntityChipTone = 'detected' | 'understood' | 'avoid';

export type TaskEntityChip = {
	key: string;
	/** Stored row id; null for detected-only chips shown before a model has read the task. */
	id: string | null;
	kind: TaskEntityKind;
	role: TaskEntityRole;
	/** Short action label: Join, Call, Email, Map, Who, When, Due, Link, … */
	label: string;
	display: string;
	about: string | null;
	quote: string | null;
	href: string | null;
	tone: TaskEntityChipTone;
	status: TaskEntityStatus;
	/** Secondary, low confidence, or no longer in the text: shown faded. */
	faded: boolean;
	/** Whether ✓ means something (people, places, times, orgs). */
	confirmable: boolean;
	/** A detail the owner needs at hand: a model's `key` flag, or any link to join a meeting. */
	isKey: boolean;
};

type ChipSource = Pick<
	TaskEntityRecord,
	| 'id'
	| 'kind'
	| 'natural_key'
	| 'value'
	| 'display'
	| 'role'
	| 'about'
	| 'quote'
	| 'confidence'
	| 'status'
	| 'in_text'
	| 'position'
> & { data?: Record<string, unknown> | null };

const FIXED_FORMAT_KINDS = new Set<TaskEntityKind>(['phone', 'email', 'link', 'meeting_link']);
const HIDDEN_ROLES = new Set<TaskEntityRole>(['owner_self', 'log']);
/** References (RFI numbers, file paths, slugs) have no tap action; agents still get them. */
const HIDDEN_CHIP_KINDS = new Set<TaskEntityKind>(['reference']);

const KIND_ORDER: Record<TaskEntityKind, number> = {
	meeting_link: 0,
	time: 1,
	place: 2,
	person: 3,
	phone: 4,
	email: 5,
	link: 6,
	org: 7,
	reference: 8
};

export function mapsSearchUrl(query: string): string {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function chipLabel(kind: TaskEntityKind, role: TaskEntityRole): string {
	if (role === 'avoid') return 'Not this';
	if (role === 'hours') return 'Hours';
	switch (kind) {
		case 'meeting_link':
			return 'Join';
		case 'phone':
			return 'Call';
		case 'email':
			return 'Email';
		case 'place':
			return 'Map';
		case 'person':
			return 'Who';
		case 'org':
			return 'Org';
		case 'link':
			return 'Link';
		case 'reference':
			return 'Ref';
		case 'time':
			return role === 'deadline' ? 'Due' : role === 'follow_up' ? 'Follow up' : 'When';
	}
}

function chipHref(kind: TaskEntityKind, value: string, role: TaskEntityRole): string | null {
	if (role === 'avoid') return null;
	switch (kind) {
		case 'phone':
			return `tel:${value}`;
		case 'email':
			return `mailto:${value}`;
		case 'link':
		case 'meeting_link':
			return value;
		case 'place':
			return mapsSearchUrl(value);
		default:
			return null;
	}
}

/**
 * The chip row for a task: its stored entities, plus any fixed-format value in the current text
 * that no stored row covers yet (a number typed a moment ago, before the re-read lands; or a
 * task no model has read). Dismissed rows, the owner's own details and log lines are left out;
 * avoid-chips go last. Order: Join, When, Map, Who, Call, Email, Link, Org, Ref.
 */
export function buildTaskEntityChips(input: {
	entities?: ChipSource[] | null;
	detected?: DetectedTaskEntity[] | null;
	limit?: number;
}): TaskEntityChip[] {
	const chips: TaskEntityChip[] = [];
	const stored = new Set((input.entities ?? []).map((row) => `${row.kind}:${row.natural_key}`));
	for (const found of input.detected ?? []) {
		if (stored.has(`${found.kind}:${found.naturalKey}`)) continue;
		chips.push({
			key: `detected:${found.kind}:${found.naturalKey}`,
			id: null,
			kind: found.kind,
			role: 'primary',
			label: chipLabel(found.kind, 'primary'),
			display: found.display,
			about: null,
			quote: found.quote,
			href: chipHref(found.kind, found.value, 'primary'),
			tone: 'detected',
			status: 'suggested',
			faded: false,
			confirmable: false,
			isKey: found.kind === 'meeting_link'
		});
	}
	for (const row of input.entities ?? []) {
		if (
			row.status === 'dismissed' ||
			HIDDEN_ROLES.has(row.role) ||
			HIDDEN_CHIP_KINDS.has(row.kind) ||
			isFileNameLink(row)
		)
			continue;
		const fixed = FIXED_FORMAT_KINDS.has(row.kind);
		chips.push({
			key: row.id,
			id: row.id,
			kind: row.kind,
			role: row.role,
			label: chipLabel(row.kind, row.role),
			display: row.display,
			about: row.about,
			quote: row.quote,
			href: chipHref(row.kind, row.value, row.role),
			tone: row.role === 'avoid' ? 'avoid' : fixed ? 'detected' : 'understood',
			status: row.status,
			faded:
				row.role === 'secondary' ||
				row.confidence === 'low' ||
				(!row.in_text && row.status === 'confirmed'),
			confirmable: !fixed && row.role !== 'avoid',
			isKey: row.role !== 'avoid' && (row.data?.key === true || row.kind === 'meeting_link')
		});
	}
	const rank = (chip: TaskEntityChip, index: number) =>
		(chip.tone === 'avoid' ? 1000 : 0) +
		(chip.faded ? 100 : 0) +
		KIND_ORDER[chip.kind] * 10 +
		Math.min(index, 99) / 100;
	const ranked = chips
		.map((chip, index) => ({ chip, score: rank(chip, index) }))
		.sort((a, b) => a.score - b.score)
		.map(({ chip }) => chip);
	return typeof input.limit === 'number' ? ranked.slice(0, input.limit) : ranked;
}

/** True when a time entity has already ended (a date before today, or a clock time before now). */
export function isPastTaskEntityTime(
	row: Pick<ChipSource, 'kind' | 'value' | 'data'>,
	now: Date = new Date()
): boolean {
	if (row.kind !== 'time') return false;
	const end = typeof row.data?.end === 'string' ? row.data.end : row.value;
	if (ISO_DATE.test(end)) {
		const today = [
			now.getFullYear(),
			String(now.getMonth() + 1).padStart(2, '0'),
			String(now.getDate()).padStart(2, '0')
		].join('-');
		return end < today;
	}
	const at = Date.parse(end);
	return Number.isFinite(at) && at < now.getTime();
}

/**
 * The details shown above a task's text: at most three things the owner needs at hand (the link
 * to join, when the meeting is, where to go, the one number to call). A model marks them `key`
 * (prompt v5); a meeting link always counts. Times already past are left out. Everything else
 * lives in the text itself.
 */
export function pickKeyTaskEntityChips(input: {
	entities?: ChipSource[] | null;
	detected?: DetectedTaskEntity[] | null;
	now?: Date;
}): TaskEntityChip[] {
	const now = input.now ?? new Date();
	return buildTaskEntityChips({
		entities: (input.entities ?? []).filter((row) => !isPastTaskEntityTime(row, now)),
		detected: input.detected
	})
		.filter((chip) => chip.isKey && !chip.faded && chip.tone !== 'avoid')
		.slice(0, MAX_KEY_TASK_ENTITIES);
}

// ---------------------------------------------------------------------------
// Linking: who and what a task's people, organizations and places come with
// ---------------------------------------------------------------------------

export type TaskEntityCardKind = 'person' | 'org' | 'place';

export type TaskEntityContact = {
	id: string;
	kind: 'phone' | 'email' | 'link' | 'meeting_link' | 'place';
	display: string;
	value: string;
	href: string | null;
	role: TaskEntityRole;
};

export type TaskEntityCard = {
	id: string;
	kind: TaskEntityCardKind;
	/** natural_key: the same person or organization in another task has the same one. */
	key: string;
	name: string;
	/** Full value: a place's whole address, a person's name as written. */
	value: string;
	role: TaskEntityRole;
	status: TaskEntityStatus;
	quote: string | null;
	/** Person: the organization they are with. Place: whose place it is. */
	partOf: { id: string | null; name: string } | null;
	/** Numbers, emails, links and addresses the task ties to this entity. */
	contacts: TaskEntityContact[];
	/** Organization: its people. Person: others at the same organization. */
	people: Array<{ id: string; name: string; contact: TaskEntityContact | null }>;
	/** Words to find in the text, in order: the label, the value, then the model's quote. */
	mentions: string[];
};

const CARD_KINDS = new Set<TaskEntityKind>(['person', 'org', 'place']);
const CONTACT_KINDS = new Set<TaskEntityKind>(['phone', 'email', 'link', 'meeting_link', 'place']);
const CONTACT_ORDER: Record<TaskEntityContact['kind'], number> = {
	phone: 0,
	email: 1,
	meeting_link: 2,
	link: 3,
	place: 4
};

function visibleRow(row: ChipSource): boolean {
	return row.status !== 'dismissed' && !HIDDEN_ROLES.has(row.role) && !isFileNameLink(row);
}

/** A link row read before file names were checked (prompt v5 and earlier). */
function isFileNameLink(row: ChipSource): boolean {
	return row.kind === 'link' && looksLikeFileName(row.quote ?? row.display);
}

/**
 * The people, organizations and places a task names, each linked to what the task ties to it
 * through the model's `about` field: Casey Fenske → Dauntless Dogs, 410-360-6761; Dauntless
 * Dogs → Casey, Angela, its email and address. Matching is by the collapsed name only, never by
 * reading the prose.
 */
export function buildTaskEntityCards(entities: ChipSource[] | null | undefined): TaskEntityCard[] {
	const rows = (entities ?? []).filter(visibleRow);
	const named = rows.filter((row) => CARD_KINDS.has(row.kind));
	const byName = new Map<string, ChipSource>();
	for (const row of named) {
		for (const name of [
			row.natural_key,
			entityTextKey(row.display),
			entityTextKey(row.value)
		]) {
			if (name && !byName.has(name)) byName.set(name, row);
		}
	}
	const target = (about: string | null) =>
		about ? (byName.get(entityTextKey(about)) ?? null) : null;

	const contactsFor = (row: ChipSource): TaskEntityContact[] =>
		rows
			.filter(
				(other) =>
					other.id !== row.id &&
					CONTACT_KINDS.has(other.kind) &&
					other.role !== 'avoid' &&
					target(other.about)?.id === row.id
			)
			.map((other) => ({
				id: other.id,
				kind: other.kind as TaskEntityContact['kind'],
				display: other.display,
				value: other.value,
				href: chipHref(other.kind, other.value, other.role),
				role: other.role
			}))
			.sort(
				(a, b) =>
					CONTACT_ORDER[a.kind] - CONTACT_ORDER[b.kind] ||
					Number(a.role === 'secondary') - Number(b.role === 'secondary')
			);

	return named.map((row) => {
		const kind = row.kind as TaskEntityCardKind;
		const owner = target(row.about);
		const partOf =
			kind === 'org'
				? null
				: owner && owner.id !== row.id
					? { id: owner.id, name: owner.display }
					: row.about
						? { id: null, name: row.about }
						: null;
		const group = kind === 'org' ? row : owner?.kind === 'org' ? owner : null;
		const people = group
			? named
					.filter(
						(other) =>
							other.kind === 'person' &&
							other.id !== row.id &&
							target(other.about)?.id === group.id
					)
					.map((other) => ({
						id: other.id,
						name: other.display,
						contact:
							contactsFor(other).find((contact) => contact.kind !== 'place') ?? null
					}))
			: [];
		// The name itself first ("Angela", not "Angela (associate director)"); the quote is the
		// fallback when the label is not written that way ("7609 (or 7601) Energy Pkwy").
		const mentions = [
			...new Set(
				[row.display, row.value, row.quote]
					.map((text) => text?.trim() ?? '')
					.filter((text) => text.length >= 2)
			)
		];
		return {
			id: row.id,
			kind,
			key: row.natural_key,
			name: row.display,
			value: row.value,
			role: row.role,
			status: row.status,
			quote: row.quote,
			partOf,
			contacts: contactsFor(row),
			people,
			mentions
		};
	});
}

/** Compact entity lines for agents (task details): what a person would see on the chips. */
export function summarizeTaskEntitiesForAgent(entities: ChipSource[]): Array<{
	kind: TaskEntityKind;
	value: string;
	display: string;
	role: TaskEntityRole;
	about: string | null;
	status: TaskEntityStatus;
	in_text: boolean;
	key?: true;
}> {
	return entities
		.filter((row) => row.status !== 'dismissed' && row.role !== 'log')
		.sort((a, b) => a.position - b.position)
		.map((row) => ({
			kind: row.kind,
			value: row.value,
			display: row.display,
			role: row.role,
			about: row.about,
			status: row.status,
			in_text: row.in_text,
			...(row.data?.key === true ? { key: true as const } : {})
		}));
}
