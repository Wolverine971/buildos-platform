// apps/worker/src/workers/knowledge/socialProfiles.ts
//
// Social profiles for an entry (2026-11-22). A name is not proof: there are many Griffin
// Davises on Instagram. An account is taken as the entry's own only on one of these grounds,
// strongest first:
//   1. declared   – a page that is certainly theirs says so in machine-readable form
//                   (schema.org `sameAs`, or a link marked rel="me").
//   2. linked     – a page that is certainly theirs links to it (the header or footer of their
//                   own website, the bio of a profile already confirmed as theirs).
//   3. is_profile – the profile page itself was checked against what the user knows (employer,
//                   role, city in its bio) and came back "same".
//   4. same_handle – the handle matches one already confirmed on another platform. A hint only:
//                   saved for the user to check, never as confirmed.
// A name match alone is none of these and is not saved.
//
// Everything here reads structured formats (URLs, HTML attributes, JSON-LD). Nothing reads
// meaning out of prose.

import type { KnowledgeKind } from '@buildos/shared-agent-ops/knowledge';

export type SocialPlatform =
	| 'linkedin'
	| 'instagram'
	| 'x'
	| 'youtube'
	| 'facebook'
	| 'tiktok'
	| 'github'
	| 'threads'
	| 'bluesky';

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
	linkedin: 'LinkedIn',
	instagram: 'Instagram',
	x: 'X',
	youtube: 'YouTube',
	facebook: 'Facebook',
	tiktok: 'TikTok',
	github: 'GitHub',
	threads: 'Threads',
	bluesky: 'Bluesky'
};

export interface SocialProfile {
	platform: SocialPlatform;
	/** Lowercased account name, without "@". */
	handle: string;
	/** The profile's address in one standard form. */
	url: string;
	/** What kind of account the address itself says it is (LinkedIn /in/ vs /company/). */
	owner?: 'person' | 'org';
}

const HOSTS: Record<string, SocialPlatform> = {
	'linkedin.com': 'linkedin',
	'instagram.com': 'instagram',
	'x.com': 'x',
	'twitter.com': 'x',
	'youtube.com': 'youtube',
	'facebook.com': 'facebook',
	'fb.com': 'facebook',
	'tiktok.com': 'tiktok',
	'github.com': 'github',
	'threads.net': 'threads',
	'threads.com': 'threads',
	'bsky.app': 'bluesky'
};

/** First path segments that are the platform's own pages, never an account. */
const NOT_AN_ACCOUNT = new Set([
	'p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'direct', 'about', 'legal',
	'intent', 'share', 'sharer', 'sharer.php', 'home', 'search', 'hashtag', 'i', 'login', 'signup',
	'privacy', 'tos', 'terms', 'help', 'settings', 'compose', 'messages', 'notifications',
	'plugins', 'dialog', 'groups', 'events', 'watch', 'marketplace', 'pages', 'policies', 'policy',
	'sharearticle', 'sharing', 'feed', 'posts', 'pulse', 'jobs', 'learning', 'authwall', 'checkpoint',
	'playlist', 'embed', 'results', 'shorts', 'live', 'feeds', 'premium', 'gaming', 'music',
	'discover', 'tag', 'foryou', 'following', 'video', 'features', 'topics', 'collections',
	'marketplace', 'sponsors', 'orgs', 'apps', 'pricing', 'enterprise', 'download', 'business',
	'developers', 'developer', 'ads', 'careers', 'press', 'blog', 'web', 'public', 'profile.php',
	'people', 'pub', 'directory', 'school', 'showcase', 'in', 'company', 'channel', 'c', 'user'
]);

/** Accounts of website builders and link tools that sit in a site's footer. Never the entry's. */
const NOT_THEIRS = new Set([
	'squarespace', 'wix', 'shopify', 'wordpress', 'wordpressdotcom', 'godaddy', 'webflow',
	'linktree', 'linktr.ee', 'weebly', 'mailchimp', 'substack', 'carrd', 'beacons', 'kajabi',
	'google', 'youtube', 'instagram', 'facebook', 'meta', 'twitter', 'x', 'linkedin', 'tiktok', 'github'
]);

const HANDLE = /^[a-z0-9][a-z0-9._-]{1,98}$/;

/** The platform a host belongs to, allowing one subdomain (www., m., uk.). */
function platformOf(url: URL): SocialPlatform | null {
	const host = url.hostname.toLowerCase();
	return HOSTS[host] ?? HOSTS[host.split('.').slice(1).join('.')] ?? null;
}

/**
 * Read a URL as a profile address. Null when it is not one: a post, a share button, a search
 * page, or a site that is not a social platform.
 */
export function parseSocialProfile(input: string): SocialProfile | null {
	let url: URL;
	try {
		const text = input.trim().replace(/[)\].,;…]+$/, '');
		url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
	} catch {
		return null;
	}
	const platform = platformOf(url);
	if (!platform) return null;
	const parts = url.pathname
		.split('/')
		.map((part) => {
			try {
				return decodeURIComponent(part).trim();
			} catch {
				return part.trim();
			}
		})
		.filter(Boolean);
	if (!parts.length) return null;
	const first = parts[0]!.toLowerCase();
	const clean = (raw: string | undefined) => (raw ?? '').replace(/^@/, '').toLowerCase();
	const ok = (handle: string) => HANDLE.test(handle) && !NOT_THEIRS.has(handle);

	if (platform === 'linkedin') {
		const section = first === 'in' ? 'person' : first === 'company' || first === 'school' || first === 'showcase' ? 'org' : null;
		const handle = clean(parts[1]);
		if (!section || !ok(handle)) return null;
		return {
			platform,
			handle,
			owner: section,
			url: `https://www.linkedin.com/${first}/${handle}`
		};
	}
	if (platform === 'youtube') {
		if (first.startsWith('@')) {
			const handle = clean(first);
			return ok(handle) ? { platform, handle, url: `https://www.youtube.com/@${handle}` } : null;
		}
		if ((first === 'channel' || first === 'c' || first === 'user') && parts[1]) {
			// Channel ids are case-sensitive: keep the address as written.
			const id = parts[1].replace(/^@/, '');
			return /^[A-Za-z0-9_-]{2,100}$/.test(id)
				? { platform, handle: id.toLowerCase(), url: `https://www.youtube.com/${first}/${id}` }
				: null;
		}
		return null;
	}
	if (platform === 'tiktok') {
		const handle = clean(first);
		return first.startsWith('@') && ok(handle)
			? { platform, handle, url: `https://www.tiktok.com/@${handle}` }
			: null;
	}
	if (platform === 'bluesky') {
		const handle = clean(parts[1]);
		return first === 'profile' && ok(handle)
			? { platform, handle, url: `https://bsky.app/profile/${handle}` }
			: null;
	}
	if (platform === 'threads') {
		const handle = clean(first);
		return first.startsWith('@') && ok(handle)
			? { platform, handle, url: `https://www.threads.net/@${handle}` }
			: null;
	}
	// instagram, x, facebook, github: the account is the first path segment.
	const handle = clean(first);
	if (NOT_AN_ACCOUNT.has(handle) || !ok(handle)) return null;
	// A deeper path is a post or a section of the account, except a few profile tabs.
	if (parts.length > 1 && platform !== 'github') {
		const tab = parts[1]!.toLowerCase();
		const profileTab = ['', 'about', 'tagged', 'reels', 'with_replies', 'media', 'photos', 'videos'];
		if (!profileTab.includes(tab)) return null;
	}
	if (platform === 'github' && parts.length > 1) return null; // a repository, not a profile
	const base: Record<string, string> = {
		instagram: 'https://www.instagram.com/',
		x: 'https://x.com/',
		facebook: 'https://www.facebook.com/',
		github: 'https://github.com/'
	};
	return { platform, handle, url: `${base[platform]}${handle}` };
}

/** Whether an account address can belong to an entry of this kind at all. */
export function profileFitsKind(profile: SocialProfile, kind: KnowledgeKind): boolean {
	if (!profile.owner) return true;
	if (kind === 'person') return profile.owner === 'person';
	if (kind === 'org') return profile.owner === 'org';
	return true;
}

export interface HarvestedProfile extends SocialProfile {
	/** declared: schema.org sameAs or rel="me". linked: an ordinary link on the page. */
	via: 'declared' | 'linked';
	/** The address exactly as the page wrote it (the evidence). */
	found: string;
}

function collectSameAs(node: unknown, out: string[], depth = 0): void {
	if (!node || depth > 6) return;
	if (Array.isArray(node)) {
		for (const item of node) collectSameAs(item, out, depth + 1);
		return;
	}
	if (typeof node !== 'object') return;
	for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
		if (key === 'sameAs') {
			for (const item of Array.isArray(value) ? value : [value])
				if (typeof item === 'string') out.push(item);
		} else if (value && typeof value === 'object') {
			collectSameAs(value, out, depth + 1);
		}
	}
}

const decodeEntities = (text: string) =>
	text.replace(/&amp;/g, '&').replace(/&#x2F;/gi, '/').replace(/&#47;/g, '/').replace(/&quot;/g, '"');

/**
 * Every social account a page's HTML points at, with how it points at it. The caller decides
 * whose page it is; this only reads links.
 */
export function harvestSocialLinks(html: string): HarvestedProfile[] {
	const found = new Map<string, HarvestedProfile>();
	const add = (raw: string, via: HarvestedProfile['via']) => {
		const profile = parseSocialProfile(decodeEntities(raw));
		if (!profile) return;
		const existing = found.get(profile.url);
		if (existing && (existing.via === 'declared' || via === 'linked')) return;
		found.set(profile.url, { ...profile, via, found: raw.slice(0, 300) });
	};
	// schema.org: {"@type":"Organization","sameAs":["https://instagram.com/…"]}
	for (const match of html.matchAll(
		/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
	)) {
		try {
			const urls: string[] = [];
			collectSameAs(JSON.parse(match[1]!.trim()), urls);
			for (const url of urls) add(url, 'declared');
		} catch {
			// malformed JSON-LD: the ordinary links below still count
		}
	}
	for (const match of html.matchAll(/<(?:a|link)\b[^>]*>/gi)) {
		const tag = match[0];
		const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
		const url = href?.[1] ?? href?.[2] ?? href?.[3];
		if (!url) continue;
		const rel = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
		const relTokens = (rel?.[1] ?? rel?.[2] ?? rel?.[3] ?? '').toLowerCase().split(/\s+/);
		add(url, relTokens.includes('me') ? 'declared' : 'linked');
	}
	return [...found.values()];
}

/** Account addresses written out in a page's text (a profile's bio: "instagram.com/name"). */
export function harvestSocialLinksFromText(text: string): HarvestedProfile[] {
	const found = new Map<string, HarvestedProfile>();
	const hosts = Object.keys(HOSTS).map((host) => host.replace('.', '\\.')).join('|');
	const pattern = new RegExp(`(?:https?://)?(?:www\\.)?(?:${hosts})/[^\\s"'<>)\\]]{2,120}`, 'gi');
	for (const match of text.matchAll(pattern)) {
		const profile = parseSocialProfile(match[0]);
		if (profile && !found.has(profile.url))
			found.set(profile.url, { ...profile, via: 'linked', found: match[0].slice(0, 300) });
	}
	return [...found.values()];
}

/**
 * From the links on several pages of one site, the accounts that are the site owner's.
 * A declared account always counts. A plain link counts when it is the only account for its
 * platform, or when it is on more pages than any other (the footer repeats on every page; a
 * team page lists each person's own account once). Two accounts tied on one platform are
 * ambiguous and neither is taken.
 */
export function ownAccounts(pages: HarvestedProfile[][]): HarvestedProfile[] {
	const byPlatform = new Map<SocialPlatform, Map<string, { profile: HarvestedProfile; pages: number }>>();
	for (const page of pages) {
		const seen = new Set<string>();
		for (const profile of page) {
			if (seen.has(profile.url)) continue;
			seen.add(profile.url);
			const platform = byPlatform.get(profile.platform) ?? new Map();
			byPlatform.set(profile.platform, platform);
			const entry = platform.get(profile.url);
			if (entry) {
				entry.pages++;
				if (profile.via === 'declared') entry.profile = profile;
			} else platform.set(profile.url, { profile, pages: 1 });
		}
	}
	const out: HarvestedProfile[] = [];
	for (const accounts of byPlatform.values()) {
		const list = [...accounts.values()];
		const declared = list.filter((a) => a.profile.via === 'declared');
		if (declared.length) {
			out.push(...declared.map((a) => a.profile));
			continue;
		}
		if (list.length === 1) {
			out.push(list[0]!.profile);
			continue;
		}
		list.sort((a, b) => b.pages - a.pages);
		if (list[0]!.pages > list[1]!.pages) out.push(list[0]!.profile);
	}
	return out;
}

/** The platforms worth having for each kind, most wanted first. */
export const WANTED_PLATFORMS: Partial<Record<KnowledgeKind, SocialPlatform[]>> = {
	person: ['linkedin', 'instagram', 'x'],
	org: ['linkedin', 'instagram', 'youtube', 'x', 'facebook']
};

/** Platforms already on the entry and those still worth finding, from its saved profile links. */
export function platformStatus(
	kind: KnowledgeKind,
	profileUrls: readonly string[]
): { have: SocialProfile[]; want: SocialPlatform[] } {
	const have = profileUrls
		.map((url) => parseSocialProfile(url))
		.filter((p): p is SocialProfile => Boolean(p));
	const got = new Set(have.map((p) => p.platform));
	return { have, want: (WANTED_PLATFORMS[kind] ?? []).filter((p) => !got.has(p)) };
}

/** True for any address on a social platform, whether or not it is an account. */
export function isSocialUrl(input: string): boolean {
	try {
		const text = input.trim();
		return platformOf(new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)) !== null;
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// Deciding which accounts are the entry's own, from the pages a research round read.

export interface SocialPage {
	url: string;
	title: string | null;
	/** The page's text as read (for a profile: its bio comes first). */
	text: string;
	/** What the "same one?" check said. A page it could not confirm is 'ask'. */
	verdict: 'same' | 'ask';
	/** On the entry's own website (its known or just-confirmed domain). */
	ownSite: boolean;
	/** Raw HTML, when it could be fetched: the only place footer icons' links exist. */
	html?: string | null;
}

export type SocialGround = 'declared' | 'linked' | 'is_profile' | 'same_handle';

export interface SocialFinding {
	profile: SocialProfile;
	ground: SocialGround;
	/** Confirmed accounts are saved as facts; a same-handle hint is saved for the user to check. */
	confirmed: boolean;
	pageUrl: string;
	pageTitle: string | null;
	/** What on that page points at the account. */
	evidence: string;
}

const GROUND_RANK: Record<SocialGround, number> = {
	declared: 4,
	linked: 3,
	is_profile: 2,
	same_handle: 1
};
/** How much of a profile page counts as its bio (links further down are other people's posts). */
const BIO_CHARS = 900;
const handleKey = (handle: string) => handle.replace(/[^a-z0-9]/g, '');

export function findSocialProfiles(input: {
	kind: KnowledgeKind;
	pages: SocialPage[];
	/** Profile addresses already saved on the entry. */
	known: readonly string[];
}): { findings: SocialFinding[]; nameOnly: string[] } {
	const known = input.known
		.map((url) => parseSocialProfile(url))
		.filter((p): p is SocialProfile => Boolean(p));
	const knownUrls = new Set(known.map((p) => p.url));
	const best = new Map<string, SocialFinding>();
	const add = (finding: SocialFinding) => {
		if (!profileFitsKind(finding.profile, input.kind)) return;
		const current = best.get(finding.profile.url);
		if (!current || GROUND_RANK[finding.ground] > GROUND_RANK[current.ground])
			best.set(finding.profile.url, finding);
	};

	// 1 + 2. The entry's own website: what it declares and what its header and footer link to.
	const sitePages = input.pages.filter((page) => page.ownSite);
	const perPage = sitePages.map((page) =>
		page.html ? harvestSocialLinks(page.html) : harvestSocialLinksFromText(page.text)
	);
	for (const account of ownAccounts(perPage)) {
		const at = perPage.findIndex((links) => links.some((l) => l.url === account.url));
		const page = sitePages[at]!;
		add({
			profile: account,
			ground: account.via,
			confirmed: true,
			pageUrl: page.url,
			pageTitle: page.title,
			evidence: account.found
		});
	}

	// 3. A profile page that was itself checked and confirmed, plus the accounts its bio links.
	const unsure: Array<{ profile: SocialProfile; page: SocialPage }> = [];
	for (const page of input.pages) {
		const profile = parseSocialProfile(page.url);
		if (!profile || !profileFitsKind(profile, input.kind)) continue;
		if (page.verdict !== 'same') {
			unsure.push({ profile, page });
			continue;
		}
		add({
			profile,
			ground: 'is_profile',
			confirmed: true,
			pageUrl: page.url,
			pageTitle: page.title,
			evidence: (page.title ?? page.url).slice(0, 200)
		});
		const bio = harvestSocialLinksFromText(page.text.slice(0, BIO_CHARS)).filter(
			(link) => link.platform !== profile.platform
		);
		const perPlatform = new Map<SocialPlatform, HarvestedProfile[]>();
		for (const link of bio)
			perPlatform.set(link.platform, [...(perPlatform.get(link.platform) ?? []), link]);
		for (const links of perPlatform.values()) {
			if (links.length !== 1) continue; // two accounts on one platform: cannot tell whose
			add({
				profile: links[0]!,
				ground: 'linked',
				confirmed: true,
				pageUrl: page.url,
				pageTitle: page.title,
				evidence: links[0]!.found
			});
		}
	}

	// 4. A profile the check could not confirm. The same account name as a confirmed one is a
	// hint worth showing; a name match alone is nothing.
	const confirmedHandles = new Map<string, SocialProfile>();
	for (const profile of [...known, ...[...best.values()].map((f) => f.profile)])
		confirmedHandles.set(handleKey(profile.handle), profile);
	const nameOnly: string[] = [];
	for (const { profile, page } of unsure) {
		if (best.has(profile.url) || knownUrls.has(profile.url)) continue;
		const twin = confirmedHandles.get(handleKey(profile.handle));
		if (twin && twin.platform !== profile.platform && handleKey(profile.handle).length >= 5) {
			add({
				profile,
				ground: 'same_handle',
				confirmed: false,
				pageUrl: page.url,
				pageTitle: page.title,
				evidence: `Same account name as their ${SOCIAL_PLATFORM_LABELS[twin.platform]} (@${twin.handle})`
			});
		} else nameOnly.push(profile.url);
	}

	return {
		findings: [...best.values()].filter((f) => !knownUrls.has(f.profile.url)),
		nameOnly
	};
}
