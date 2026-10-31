// apps/mobile/src/lib/brief.ts
/**
 * The daily brief on the phone. The worker writes one markdown document per day
 * (apps/worker/src/workers/brief/ontologyBriefGenerator.ts, generateMainBriefMarkdown): an H1
 * with the date, "Executive Brief", "Start Here", "Calendar" and the other readouts, then a
 * "Project Details" tail with a section per project that holds most of the bytes. This file
 * splits that document into what the page lays out, maps its links to screens, and steps days.
 * Pure: no React Native imports, so tests can load this file.
 */
import type { DailyBrief } from '@buildos/api-client';

import { type Block, type Inline, inlineText, parseMarkdown } from '@/lib/markdown';

/** The brief page, pushed on Today's stack so the tab bar stays. */
export const BRIEF_PATHNAME = '/(tabs)/(today)/brief';

export type BriefHrefParams = { date?: string | null; autoplay?: boolean };

/** `/brief`, `/brief?date=2026-10-30`, `/brief?autoplay=1`: every state of the page has a link. */
export function briefHref({ date, autoplay }: BriefHrefParams = {}) {
	const params: Record<string, string> = {};
	if (date) params.date = date;
	if (autoplay) params.autoplay = '1';
	return { pathname: BRIEF_PATHNAME, params } as const;
}

const CIVIL_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A `YYYY-MM-DD` route param, or null for anything else. */
export function civilDayParam(value: string | string[] | null | undefined): string | null {
	const text = Array.isArray(value) ? value[0] : value;
	return text && CIVIL_DAY.test(text) ? text : null;
}

/** `day` plus `days`, stepped in UTC so a DST change never repeats or skips a day. */
export function stepDay(day: string, days: number): string {
	const match = CIVIL_DAY.exec(day);
	if (!match) return day;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const date = Number(match[3]);
	return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// Sections

export type BriefSections = {
	/** The holiday line and the Executive Brief: what to read first. */
	lead: string;
	/** Just the Executive Brief, for the card's one line. */
	executive: string | null;
	/** The Start Here list: `priority_actions` again, each linked to its task. */
	startHere: string | null;
	/** Calendar, goals, attention, focus, while you were away: headings kept, in order. */
	body: string;
	/** Every project's own section, after "Project Details". */
	details: string | null;
	/** How many project sections `details` holds. */
	detailCount: number;
};

type Section = { title: string | null; lines: string[] };

// The worker's own section titles, matched exactly: a structured format, not a guess at prose.
// Briefs written before the current generator titled the lead "Executive Summary".
const EXECUTIVE = new Set(['executive brief', 'executive summary']);
const START_HERE = 'start here';
const DETAILS = 'project details';

const sectionText = (section: Section) => section.lines.join('\n').trim();
const withHeading = (section: Section) =>
	[section.title === null ? '' : `## ${section.title}`, sectionText(section)]
		.filter(Boolean)
		.join('\n\n');

export function splitBrief(markdown: string | null | undefined): BriefSections {
	const sections: Section[] = [{ title: null, lines: [] }];
	let fenced = false;
	let seen = false;
	for (const line of (markdown ?? '').replace(/\r\n?/g, '\n').split('\n')) {
		if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
		if (!fenced) {
			// The document opens with the date as an H1; the page title shows the date instead.
			if (!seen && /^#\s/.test(line)) {
				seen = true;
				continue;
			}
			const h2 = /^##\s+(.*?)\s*$/.exec(line);
			if (h2) {
				seen = true;
				sections.push({ title: h2[1] ?? '', lines: [] });
				continue;
			}
		}
		if (line.trim()) seen = true;
		sections[sections.length - 1]!.lines.push(line);
	}

	const lead: string[] = [];
	const body: string[] = [];
	const details: string[] = [];
	let executive: string | null = null;
	let startHere: string | null = null;
	let inDetails = false;
	let detailCount = 0;
	for (const section of sections) {
		if (inDetails) {
			details.push(withHeading(section));
			detailCount += 1;
			continue;
		}
		const key = section.title?.trim().toLowerCase() ?? null;
		const text = sectionText(section);
		if (key === null) {
			if (text) lead.push(text);
		} else if (EXECUTIVE.has(key)) {
			executive = text || null;
			if (text) lead.push(text);
		} else if (key === START_HERE) {
			startHere = text || null;
		} else if (key === DETAILS) {
			inDetails = true;
			if (text) details.push(text);
		} else {
			body.push(withHeading(section));
		}
	}
	return {
		lead: lead.join('\n\n'),
		executive,
		startHere,
		body: body.join('\n\n'),
		details: details.length ? details.join('\n\n') : null,
		detailCount
	};
}

function firstParagraph(source: string | null): string | null {
	if (!source) return null;
	for (const block of parseMarkdown(source)) {
		if (block.kind !== 'paragraph') continue;
		const text = inlineText(block.inline).replace(/\s+/g, ' ').trim();
		if (text) return text;
	}
	return null;
}

/** The first line of the executive brief, for the Today card. */
export function briefLead(markdown: string | null | undefined, max = 200): string | null {
	const { executive, lead, body } = splitBrief(markdown);
	const line = firstParagraph(executive) ?? firstParagraph(lead) ?? firstParagraph(body);
	if (!line) return null;
	return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

// ---------------------------------------------------------------------------------------------
// Priority actions

export type BriefAction = { text: string; href: string | null };

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

function firstLink(inline: Inline[]): { href: string; label: string } | null {
	for (const node of inline) {
		if (node.kind === 'link') return { href: node.href, label: inlineText(node.children) };
		if ('children' in node) {
			const found = firstLink(node.children);
			if (found) return found;
		}
	}
	return null;
}

function collectLinks(blocks: Block[], out: Map<string, string>): void {
	for (const block of blocks) {
		if (block.kind === 'list') {
			for (const item of block.items) collectLinks(item.blocks, out);
		} else if (block.kind === 'paragraph' || block.kind === 'heading') {
			const link = firstLink(block.inline);
			if (link && !out.has(normalize(link.label))) out.set(normalize(link.label), link.href);
		}
	}
}

/**
 * `priority_actions` as rows. The array carries no ids, but the Start Here list is the same
 * text written as a link to each task, so an action whose text appears there gets that link.
 */
export function briefActions(
	actions: readonly string[] | null | undefined,
	startHere: string | null
): BriefAction[] {
	const links = new Map<string, string>();
	if (startHere) collectLinks(parseMarkdown(startHere), links);
	return (actions ?? [])
		.map((text) => text.trim())
		.filter(Boolean)
		.map((text) => ({ text, href: links.get(normalize(text)) ?? null }));
}

// ---------------------------------------------------------------------------------------------
// Links

export type BriefLinkTarget =
	| { kind: 'workspace' }
	| { kind: 'project'; id: string }
	| { kind: 'task'; id: string }
	| { kind: 'document'; id: string }
	| { kind: 'web'; url: string };

const BUILDOS_HOSTS = new Set(['build-os.com', 'www.build-os.com']);

function hostOf(url: string): string | null {
	const match = /^https?:\/\/([^/?#]+)/i.exec(url);
	return match ? match[1]!.toLowerCase() : null;
}

/**
 * Where a link in the brief goes. The worker writes site-relative links (`/projects/<id>`,
 * `/projects/<id>/tasks/<id>`, `/projects` for the Workspace), and those open in the app.
 * Anything else opens in the browser; a relative path on the BuildOS the app talks to.
 */
export function briefLinkTarget(href: string, baseUrl: string): BriefLinkTarget | null {
	const link = href.trim();
	if (!link) return null;
	if (/^(mailto|tel):/i.test(link)) return { kind: 'web', url: link };

	let path: string;
	let absolute: string;
	if (/^https?:\/\//i.test(link)) {
		const host = hostOf(link);
		if (!host || !(BUILDOS_HOSTS.has(host) || host === hostOf(baseUrl))) {
			return { kind: 'web', url: link };
		}
		path = link.replace(/^https?:\/\/[^/?#]+/i, '') || '/';
		absolute = link;
	} else if (link.startsWith('/')) {
		path = link;
		absolute = `${baseUrl.replace(/\/+$/, '')}${link}`;
	} else {
		return null;
	}

	const parts = (path.split(/[?#]/)[0] ?? '')
		.split('/')
		.filter(Boolean)
		.map((part) => {
			try {
				return decodeURIComponent(part);
			} catch {
				return part;
			}
		});
	if (parts[0] === 'projects') {
		if (parts.length === 1) return { kind: 'workspace' };
		if (parts.length === 2) return { kind: 'project', id: parts[1]! };
		if (parts.length === 4 && parts[2] === 'tasks') return { kind: 'task', id: parts[3]! };
		if (parts.length === 4 && parts[2] === 'documents') {
			return { kind: 'document', id: parts[3]! };
		}
	}
	return { kind: 'web', url: absolute };
}

// ---------------------------------------------------------------------------------------------
// Status, clocks and copy

export function isWriting(status: DailyBrief['generation_status'] | null | undefined): boolean {
	return status === 'pending' || status === 'processing';
}

/** `0:21`, `4:12`, `1:02:03`. */
export function formatElapsed(seconds: number): string {
	const total = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const rest = String(total % 60).padStart(2, '0');
	return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** "Listen · 0:21", or "Listen" when the length is unknown. */
export function listenLabel(durationMs: number | null | undefined): string {
	return durationMs && durationMs > 0 ? `Listen · ${formatElapsed(durationMs / 1000)}` : 'Listen';
}

export type BriefStatus = {
	tone: 'muted' | 'accent' | 'destructive';
	text: string;
	writing: boolean;
};

type StatusLike = Pick<DailyBrief, 'generation_status'> &
	Partial<Pick<DailyBrief, 'generation_completed_at' | 'generation_error'>>;

function clockTime(iso: string): string {
	const date = new Date(iso);
	return Number.isNaN(date.getTime())
		? ''
		: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** The one-line status under the title: when it was written, that it is being written, or why not. */
export function briefStatus(
	brief: StatusLike | null | undefined,
	formatTime: (iso: string) => string = clockTime
): BriefStatus | null {
	if (!brief) return null;
	if (isWriting(brief.generation_status)) {
		return { tone: 'accent', text: 'Being written now…', writing: true };
	}
	if (brief.generation_status === 'failed') {
		const reason = brief.generation_error?.trim();
		return {
			tone: 'destructive',
			text: reason ? `Couldn't be written · ${reason}` : "Couldn't be written",
			writing: false
		};
	}
	const at = brief.generation_completed_at ? formatTime(brief.generation_completed_at) : '';
	return { tone: 'muted', text: at ? `Generated ${at}` : 'Generated', writing: false };
}

/** "Thu, Oct 30" from a civil day. */
export function shortDay(day: string): string {
	const match = CIVIL_DAY.exec(day);
	if (!match) return day;
	return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString(
		undefined,
		{ weekday: 'short', month: 'short', day: 'numeric' }
	);
}

/** The Today card's label: today's brief, or the last one with its day. */
export function briefCardLabel(briefDate: string, today: string): { title: string; aside: string } {
	return briefDate === today
		? { title: 'Your brief', aside: 'Today' }
		: { title: 'Your last brief', aside: shortDay(briefDate) };
}
