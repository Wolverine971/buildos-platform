// packages/shared-agent-ops/src/knowledge/contacts-import.ts
//
// Parsers for contact exports: phone vCards (.vcf, iPhone/Android/iCloud/Google), LinkedIn's
// Connections.csv, and Google Contacts CSV. These are structured file formats; the regex here
// parses syntax, never meaning. planContactImport turns parsed contacts into one
// KnowledgeWriteBatch for KnowledgeStore.record.

import { collapseWhitespace, normalizeEmail, normalizePhone, normalizeUrl } from './normalize';
import type { KnowledgeWriteBatch, KnowledgeWriteEntity, KnowledgeWriteFact } from './types';

export type ContactFileFormat = 'vcard' | 'linkedin_csv' | 'google_csv';

export interface ImportedContactValue {
	value: string;
	label?: string;
}

export interface ImportedContact {
	name: string;
	givenName?: string;
	familyName?: string;
	nickname?: string;
	org?: string;
	title?: string;
	emails: ImportedContactValue[];
	phones: ImportedContactValue[];
	urls: ImportedContactValue[];
	addresses: ImportedContactValue[];
	linkedinUrl?: string;
	birthday?: string;
	note?: string;
	/** ISO date the connection was made (LinkedIn "Connected On"). */
	connectedOn?: string;
}

export interface ParsedContactFile {
	format: ContactFileFormat;
	contacts: ImportedContact[];
	skipped: number;
}

export const MAX_IMPORT_CONTACTS = 10_000;

export function detectContactFileFormat(fileName: string, text: string): ContactFileFormat | null {
	const head = text.slice(0, 4000);
	if (/BEGIN:VCARD/i.test(head) || /\.vcf$/i.test(fileName)) return 'vcard';
	const lines = head
		.split(/\r?\n/)
		.slice(0, 12)
		.map((line) => line.toLowerCase());
	if (lines.some((line) => line.startsWith('first name,last name,url,'))) return 'linkedin_csv';
	if (lines.some((line) => line.includes('connected on') && line.includes('first name'))) {
		return 'linkedin_csv';
	}
	if (
		lines.some(
			(line) =>
				(line.includes('e-mail 1 - value') || line.includes('phone 1 - value')) &&
				line.includes('name')
		)
	) {
		return 'google_csv';
	}
	return null;
}

export function parseContactFile(fileName: string, text: string): ParsedContactFile | null {
	const clean = text.replace(/^﻿/, '');
	const format = detectContactFileFormat(fileName, clean);
	if (!format) return null;
	const parsed =
		format === 'vcard'
			? parseVCards(clean)
			: format === 'linkedin_csv'
				? parseLinkedInConnections(clean)
				: parseGoogleContactsCsv(clean);
	return { format, ...parsed };
}

// ---------------------------------------------------------------------------
// vCard

interface VCardLine {
	group: string | null;
	name: string;
	params: Record<string, string[]>;
	value: string;
}

function unfoldVCard(text: string): string[] {
	const lines = text
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n')
		.replace(/\n[ \t]/g, '')
		.split('\n');
	// vCard 2.1 quoted-printable values continue onto the next line after a trailing "=".
	const out: string[] = [];
	for (const line of lines) {
		const last = out[out.length - 1];
		if (
			last !== undefined &&
			last.endsWith('=') &&
			/ENCODING=QUOTED-PRINTABLE/i.test(last.slice(0, last.indexOf(':') + 1 || undefined))
		) {
			out[out.length - 1] = last + '\n' + line;
		} else {
			out.push(line);
		}
	}
	return out;
}

function decodeQuotedPrintable(value: string): string {
	const bytes: number[] = [];
	const soft = value.replace(/=\n/g, '');
	for (let i = 0; i < soft.length; i++) {
		const ch = soft[i]!;
		if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(soft.slice(i + 1, i + 3))) {
			bytes.push(parseInt(soft.slice(i + 1, i + 3), 16));
			i += 2;
		} else {
			bytes.push(...new TextEncoder().encode(ch));
		}
	}
	return new TextDecoder().decode(new Uint8Array(bytes));
}

function unescapeVCardText(value: string): string {
	return value.replace(/\\([\\,;nN])/g, (_, ch: string) =>
		ch === 'n' || ch === 'N' ? '\n' : ch
	);
}

/** Split on separators not escaped with a backslash. */
function splitVCardComponents(value: string, separator: ';' | ','): string[] {
	const parts: string[] = [];
	let current = '';
	for (let i = 0; i < value.length; i++) {
		const ch = value[i]!;
		if (ch === '\\' && i + 1 < value.length) {
			current += ch + value[i + 1];
			i++;
		} else if (ch === separator) {
			parts.push(current);
			current = '';
		} else {
			current += ch;
		}
	}
	parts.push(current);
	return parts.map(unescapeVCardText);
}

function parseVCardLine(line: string): VCardLine | null {
	// The property part ends at the first colon outside a quoted parameter value.
	let inQuote = false;
	let colon = -1;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') inQuote = !inQuote;
		else if (ch === ':' && !inQuote) {
			colon = i;
			break;
		}
	}
	if (colon <= 0) return null;
	const head = line.slice(0, colon);
	let value = line.slice(colon + 1);
	const [nameWithGroup, ...rawParams] = head.split(';');
	if (!nameWithGroup) return null;
	const dot = nameWithGroup.indexOf('.');
	const group = dot > 0 ? nameWithGroup.slice(0, dot).toLowerCase() : null;
	const name = (dot > 0 ? nameWithGroup.slice(dot + 1) : nameWithGroup).toUpperCase();
	const params: Record<string, string[]> = {};
	for (const raw of rawParams) {
		const eq = raw.indexOf('=');
		const key = (eq > 0 ? raw.slice(0, eq) : 'TYPE').toUpperCase();
		const values = (eq > 0 ? raw.slice(eq + 1) : raw)
			.replace(/^"|"$/g, '')
			.split(',')
			.map((v) => v.trim().toLowerCase())
			.filter(Boolean);
		params[key] = [...(params[key] ?? []), ...values];
	}
	if ((params.ENCODING ?? []).includes('quoted-printable')) value = decodeQuotedPrintable(value);
	return { group, name, params, value };
}

const IGNORED_TYPE_LABELS = new Set(['pref', 'voice', 'internet', 'x400', 'msg', 'text']);

function typeLabel(line: VCardLine, groupLabels: Map<string, string>): string | undefined {
	if (line.group && groupLabels.has(line.group)) return groupLabels.get(line.group);
	const types = (line.params.TYPE ?? []).filter((t) => !IGNORED_TYPE_LABELS.has(t));
	return types[0];
}

function cleanAppleLabel(value: string): string {
	// Apple writes custom labels as _$!<Mobile>!$_ for built-in ones.
	return value.replace(/^_\$!<(.+)>!\$_$/, '$1').toLowerCase();
}

function parseVCardBirthday(value: string): string | undefined {
	const v = value.trim();
	// Apple uses 1604 as the year when none was given.
	if (/^1604-?\d{2}-?\d{2}/.test(v))
		return `--${v.replace(/-/g, '').slice(4, 6)}-${v.replace(/-/g, '').slice(6, 8)}`;
	if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
	if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
	if (/^--\d{2}-?\d{2}$/.test(v)) return v.replace(/^--(\d{2})-?(\d{2})$/, '--$1-$2');
	return undefined;
}

export function parseVCards(text: string): { contacts: ImportedContact[]; skipped: number } {
	const lines = unfoldVCard(text);
	const contacts: ImportedContact[] = [];
	let skipped = 0;
	let card: VCardLine[] | null = null;

	for (const rawLine of lines) {
		const line = rawLine.trimEnd();
		if (/^BEGIN:VCARD$/i.test(line)) {
			card = [];
			continue;
		}
		if (/^END:VCARD$/i.test(line)) {
			if (card) {
				const contact = vcardToContact(card);
				if (contact) contacts.push(contact);
				else skipped++;
			}
			card = null;
			if (contacts.length >= MAX_IMPORT_CONTACTS) break;
			continue;
		}
		if (card && line) {
			const parsed = parseVCardLine(line);
			if (parsed) card.push(parsed);
		}
	}
	return { contacts, skipped };
}

function vcardToContact(lines: VCardLine[]): ImportedContact | null {
	const groupLabels = new Map<string, string>();
	for (const line of lines) {
		if (line.name === 'X-ABLABEL' && line.group) {
			groupLabels.set(line.group, cleanAppleLabel(unescapeVCardText(line.value)));
		}
	}

	const contact: ImportedContact = { name: '', emails: [], phones: [], urls: [], addresses: [] };
	let fn = '';
	let structured: string[] = [];
	const notes: string[] = [];

	for (const line of lines) {
		const label = typeLabel(line, groupLabels);
		switch (line.name) {
			case 'FN':
				fn = collapseWhitespace(unescapeVCardText(line.value));
				break;
			case 'N':
				structured = splitVCardComponents(line.value, ';').map((part) =>
					collapseWhitespace(part)
				);
				break;
			case 'NICKNAME': {
				const nick = collapseWhitespace(unescapeVCardText(line.value));
				if (nick) contact.nickname = nick;
				break;
			}
			case 'ORG': {
				const org = splitVCardComponents(line.value, ';')
					.map((part) => collapseWhitespace(part))
					.filter(Boolean)[0];
				if (org) contact.org = org;
				break;
			}
			case 'TITLE': {
				const title = collapseWhitespace(unescapeVCardText(line.value));
				if (title) contact.title = title;
				break;
			}
			case 'TEL': {
				const value = collapseWhitespace(unescapeVCardText(line.value));
				if (value) contact.phones.push({ value, ...(label ? { label } : {}) });
				break;
			}
			case 'EMAIL': {
				const value = collapseWhitespace(unescapeVCardText(line.value));
				if (value) contact.emails.push({ value, ...(label ? { label } : {}) });
				break;
			}
			case 'URL': {
				const value = collapseWhitespace(unescapeVCardText(line.value));
				if (value) contact.urls.push({ value, ...(label ? { label } : {}) });
				break;
			}
			case 'X-SOCIALPROFILE': {
				const value = collapseWhitespace(unescapeVCardText(line.value));
				const platform = (line.params.TYPE ?? [])[0];
				if (value) contact.urls.push({ value, ...(platform ? { label: platform } : {}) });
				break;
			}
			case 'ADR': {
				const parts = splitVCardComponents(line.value, ';')
					.map((part) => collapseWhitespace(part))
					.filter(Boolean);
				if (parts.length)
					contact.addresses.push({
						value: parts.join(', '),
						...(label ? { label } : {})
					});
				break;
			}
			case 'BDAY': {
				const birthday = parseVCardBirthday(line.value);
				if (birthday) contact.birthday = birthday;
				break;
			}
			case 'NOTE': {
				const note = unescapeVCardText(line.value).trim();
				if (note) notes.push(note);
				break;
			}
		}
	}

	const [family = '', given = '', middle = '', prefix = '', suffix = ''] = structured;
	if (given) contact.givenName = given;
	if (family) contact.familyName = family;
	const structuredName = collapseWhitespace([prefix, given, middle, family, suffix].join(' '));
	contact.name =
		fn || structuredName || contact.nickname || contact.org || contact.emails[0]?.value || '';
	if (notes.length) contact.note = notes.join('\n\n').slice(0, 4000);

	for (const url of contact.urls) {
		if (/linkedin\.com\/(in|pub)\//i.test(url.value)) {
			contact.linkedinUrl = url.value;
			break;
		}
	}

	const hasDetail =
		contact.emails.length > 0 ||
		contact.phones.length > 0 ||
		contact.urls.length > 0 ||
		contact.org;
	if (!contact.name || (!hasDetail && !contact.name)) return null;
	return contact;
}

// ---------------------------------------------------------------------------
// CSV

/** RFC 4180 CSV: quoted fields may contain commas, quotes ("") and newlines. */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i]!;
		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += ch;
			}
			continue;
		}
		if (ch === '"') inQuotes = true;
		else if (ch === ',') {
			row.push(field);
			field = '';
		} else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && text[i + 1] === '\n') i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else {
			field += ch;
		}
	}
	if (field || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

const MONTHS: Record<string, string> = {
	jan: '01',
	feb: '02',
	mar: '03',
	apr: '04',
	may: '05',
	jun: '06',
	jul: '07',
	aug: '08',
	sep: '09',
	oct: '10',
	nov: '11',
	dec: '12'
};

/** LinkedIn writes "16 Nov 2026" (older exports: "11/16/26"). */
export function parseLinkedInDate(value: string): string | undefined {
	const v = value.trim();
	const dmy = v.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
	if (dmy) {
		const month = MONTHS[dmy[2]!.toLowerCase()];
		if (month) return `${dmy[3]}-${month}-${dmy[1]!.padStart(2, '0')}`;
	}
	const mdy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
	if (mdy) {
		const year = mdy[3]!.length === 2 ? `20${mdy[3]}` : mdy[3];
		return `${year}-${mdy[1]!.padStart(2, '0')}-${mdy[2]!.padStart(2, '0')}`;
	}
	return undefined;
}

function headerIndex(rows: string[][], required: string[]): number {
	return rows.findIndex((row) => {
		const cells = row.map((cell) => cell.trim().toLowerCase());
		return required.every((name) => cells.includes(name));
	});
}

export function parseLinkedInConnections(text: string): {
	contacts: ImportedContact[];
	skipped: number;
} {
	const rows = parseCsv(text);
	const at = headerIndex(rows, ['first name', 'last name']);
	if (at < 0) return { contacts: [], skipped: 0 };
	const header = rows[at]!.map((cell) => cell.trim().toLowerCase());
	const col = (name: string) => header.indexOf(name);
	const iFirst = col('first name');
	const iLast = col('last name');
	const iUrl = col('url');
	const iEmail = col('email address');
	const iCompany = col('company');
	const iPosition = col('position');
	const iConnected = col('connected on');

	const contacts: ImportedContact[] = [];
	let skipped = 0;
	for (const row of rows.slice(at + 1)) {
		if (row.every((cell) => !cell.trim())) continue;
		const cell = (i: number) => (i >= 0 ? collapseWhitespace(row[i] ?? '') : '');
		const given = cell(iFirst);
		const family = cell(iLast);
		const name = collapseWhitespace(`${given} ${family}`);
		if (!name) {
			skipped++;
			continue;
		}
		const url = cell(iUrl);
		const email = cell(iEmail);
		const contact: ImportedContact = {
			name,
			...(given ? { givenName: given } : {}),
			...(family ? { familyName: family } : {}),
			emails: email ? [{ value: email }] : [],
			phones: [],
			urls: [],
			addresses: []
		};
		if (url) contact.linkedinUrl = url;
		const company = cell(iCompany);
		if (company) contact.org = company;
		const position = cell(iPosition);
		if (position) contact.title = position;
		const connected = parseLinkedInDate(cell(iConnected));
		if (connected) contact.connectedOn = connected;
		contacts.push(contact);
		if (contacts.length >= MAX_IMPORT_CONTACTS) break;
	}
	return { contacts, skipped };
}

export function parseGoogleContactsCsv(text: string): {
	contacts: ImportedContact[];
	skipped: number;
} {
	const rows = parseCsv(text);
	const at = rows.findIndex((row) =>
		row.some((cell) => /^(e-mail 1 - value|phone 1 - value)$/i.test(cell.trim()))
	);
	if (at < 0) return { contacts: [], skipped: 0 };
	const header = rows[at]!.map((cell) => cell.trim().toLowerCase());
	const find = (...names: string[]) => header.findIndex((h) => names.includes(h));
	const iName = find('name');
	const iFirst = find('first name', 'given name');
	const iMiddle = find('middle name', 'additional name');
	const iLast = find('last name', 'family name');
	const iNick = find('nickname');
	const iOrg = find('organization name', 'organization 1 - name');
	const iTitle = find('organization title', 'organization 1 - title');
	const iBirthday = find('birthday');
	const iNotes = find('notes');

	const contacts: ImportedContact[] = [];
	let skipped = 0;
	for (const row of rows.slice(at + 1)) {
		if (row.every((cell) => !cell.trim())) continue;
		const cell = (i: number) => (i >= 0 ? collapseWhitespace(row[i] ?? '') : '');
		const given = cell(iFirst);
		const family = cell(iLast);
		const name =
			cell(iName) ||
			collapseWhitespace([given, cell(iMiddle), family].join(' ')) ||
			cell(iNick);
		const contact: ImportedContact = {
			name: name || cell(iOrg),
			...(given ? { givenName: given } : {}),
			...(family ? { familyName: family } : {}),
			emails: [],
			phones: [],
			urls: [],
			addresses: []
		};
		if (!contact.name) {
			skipped++;
			continue;
		}
		const nick = cell(iNick);
		if (nick) contact.nickname = nick;
		const org = cell(iOrg);
		if (org) contact.org = org;
		const title = cell(iTitle);
		if (title) contact.title = title;
		const birthday = cell(iBirthday);
		if (/^\d{4}-\d{2}-\d{2}$/.test(birthday)) contact.birthday = birthday;
		else if (/^--\d{2}-\d{2}$/.test(birthday)) contact.birthday = birthday;
		const notes = cell(iNotes);
		if (notes) contact.note = notes.slice(0, 4000);

		// Repeating groups: "E-mail 1 - Type" / "E-mail 1 - Value", "Phone 2 - Value", ...
		header.forEach((h, i) => {
			const m = h.match(/^(e-mail|phone|website|address) (\d+) - (value|formatted)$/);
			if (!m) return;
			const raw = row[i] ?? '';
			// Newer exports say "- Label", older ones "- Type".
			const labelIndex =
				[`${m[1]} ${m[2]} - label`, `${m[1]} ${m[2]} - type`]
					.map((name) => header.indexOf(name))
					.find((i) => i >= 0) ?? -1;
			const label =
				labelIndex >= 0
					? collapseWhitespace(row[labelIndex] ?? '')
							.replace(/^\* /, '')
							.toLowerCase()
					: '';
			// Google joins several values in one cell with " ::: ".
			for (const part of raw.split(' ::: ')) {
				const value = collapseWhitespace(part);
				if (!value) continue;
				const entry = { value, ...(label ? { label } : {}) };
				if (m[1] === 'e-mail') contact.emails.push(entry);
				else if (m[1] === 'phone') contact.phones.push(entry);
				else if (m[1] === 'website') contact.urls.push(entry);
				else if (m[3] === 'formatted') contact.addresses.push(entry);
			}
		});
		const li = contact.urls.find((u) => /linkedin\.com\/(in|pub)\//i.test(u.value));
		if (li) contact.linkedinUrl = li.value;
		contacts.push(contact);
		if (contacts.length >= MAX_IMPORT_CONTACTS) break;
	}
	return { contacts, skipped };
}

// ---------------------------------------------------------------------------
// Plan

/**
 * Turn parsed contacts into one write batch. Each contact becomes a private person the user
 * knows (from their own entity, via the import's channel); a company becomes an org they work
 * at. Identity keys (email, phone, LinkedIn) let a re-import or a later chat mention land on the
 * same person.
 */
export function planContactImport(
	contacts: ImportedContact[],
	options: { format: ContactFileFormat; sourceRef?: string }
): KnowledgeWriteBatch {
	const via = options.format === 'linkedin_csv' ? 'linkedin' : 'phone';
	const sourceRef = options.sourceRef ?? 'import';
	const entities: KnowledgeWriteEntity[] = [
		{ ref: 'self', self: true, kind: 'person', name: 'Me' }
	];
	const facts: KnowledgeWriteFact[] = [];
	const orgRefs = new Map<string, string>();
	const sources = [sourceRef];

	contacts.forEach((contact, index) => {
		const ref = `c${index}`;
		const keys: KnowledgeWriteEntity['keys'] = [];
		for (const email of contact.emails) {
			const v = normalizeEmail(email.value);
			if (v) keys.push({ type: 'email', value: v });
		}
		for (const phone of contact.phones) {
			const v = normalizePhone(phone.value);
			if (v && v.startsWith('+')) keys.push({ type: 'phone', value: v });
		}
		if (contact.linkedinUrl) keys.push({ type: 'linkedin', value: contact.linkedinUrl });

		const summary =
			contact.title && contact.org
				? `${contact.title} at ${contact.org}`
				: (contact.title ?? contact.org ?? undefined);
		entities.push({
			ref,
			kind: 'person',
			name: contact.name,
			...(summary ? { summary } : {}),
			...(keys.length ? { keys } : {})
		});

		facts.push({
			subject: 'self',
			predicate: 'knows',
			object: ref,
			qualifiers: {
				via,
				...(contact.connectedOn ? { since: contact.connectedOn } : {})
			},
			sources
		});
		if (contact.nickname && contact.nickname !== contact.name) {
			facts.push({ subject: ref, predicate: 'alias', value: contact.nickname, sources });
		}
		for (const email of contact.emails) {
			facts.push({
				subject: ref,
				predicate: 'email',
				value: email.value,
				...(email.label ? { qualifiers: { label: email.label } } : {}),
				sources
			});
		}
		for (const phone of contact.phones) {
			facts.push({
				subject: ref,
				predicate: 'phone',
				value: phone.value,
				...(phone.label ? { qualifiers: { label: phone.label } } : {}),
				sources
			});
		}
		for (const address of contact.addresses) {
			facts.push({
				subject: ref,
				predicate: 'address',
				value: address.value,
				...(address.label ? { qualifiers: { label: address.label } } : {}),
				sources
			});
		}
		if (contact.linkedinUrl) {
			facts.push({
				subject: ref,
				predicate: 'profile_url',
				value: contact.linkedinUrl,
				qualifiers: { platform: 'linkedin' },
				sources
			});
		}
		for (const url of contact.urls) {
			if (url.value === contact.linkedinUrl) continue;
			const normalized = normalizeUrl(url.value);
			if (!normalized) continue;
			const label = url.label?.toLowerCase();
			const isProfile =
				label &&
				[
					'linkedin',
					'twitter',
					'x',
					'instagram',
					'facebook',
					'github',
					'youtube',
					'tiktok'
				].includes(label);
			facts.push({
				subject: ref,
				predicate: isProfile ? 'profile_url' : 'homepage',
				value: url.value,
				...(isProfile ? { qualifiers: { platform: label } } : {}),
				sources
			});
		}
		if (contact.title && !contact.org) {
			facts.push({ subject: ref, predicate: 'headline', value: contact.title, sources });
		}
		if (contact.birthday) {
			facts.push({ subject: ref, predicate: 'birthday', value: contact.birthday, sources });
		}
		if (contact.note) {
			facts.push({ subject: ref, predicate: 'note', value: contact.note, sources });
		}
		if (contact.org) {
			const orgKey = contact.org.toLowerCase();
			let orgRef = orgRefs.get(orgKey);
			if (!orgRef) {
				orgRef = `o${orgRefs.size}`;
				orgRefs.set(orgKey, orgRef);
				entities.push({ ref: orgRef, kind: 'org', name: contact.org });
			}
			facts.push({
				subject: ref,
				predicate: 'works_at',
				object: orgRef,
				qualifiers: {
					...(contact.title ? { title: contact.title } : {}),
					current: true
				},
				sources
			});
			if (contact.title) {
				facts.push({
					subject: ref,
					predicate: 'headline',
					value: `${contact.title} at ${contact.org}`,
					sources
				});
			}
		}
	});

	return { entities, facts };
}
