// apps/web/src/lib/builder-profile/links.ts
//
// Link helpers for builder profiles: validate and normalize URLs the owner pastes,
// and recognize the platform from the URL's host (a structured format, not prose) so
// socials get the right icon and label.

export type SocialPlatform =
	| 'x'
	| 'linkedin'
	| 'instagram'
	| 'tiktok'
	| 'youtube'
	| 'github'
	| 'substack'
	| 'threads'
	| 'bluesky'
	| 'facebook'
	| 'medium'
	| 'website';

const PLATFORM_HOSTS: { platform: SocialPlatform; hosts: string[]; suffix?: string }[] = [
	{ platform: 'x', hosts: ['x.com', 'twitter.com'] },
	{ platform: 'linkedin', hosts: ['linkedin.com'] },
	{ platform: 'instagram', hosts: ['instagram.com'] },
	{ platform: 'tiktok', hosts: ['tiktok.com'] },
	{ platform: 'youtube', hosts: ['youtube.com', 'youtu.be'] },
	{ platform: 'github', hosts: ['github.com'] },
	{ platform: 'threads', hosts: ['threads.net', 'threads.com'] },
	{ platform: 'bluesky', hosts: ['bsky.app'] },
	{ platform: 'facebook', hosts: ['facebook.com', 'fb.com'] },
	{ platform: 'medium', hosts: ['medium.com'] },
	{ platform: 'substack', hosts: ['substack.com'], suffix: '.substack.com' }
];

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
	x: 'X',
	linkedin: 'LinkedIn',
	instagram: 'Instagram',
	tiktok: 'TikTok',
	youtube: 'YouTube',
	github: 'GitHub',
	substack: 'Substack',
	threads: 'Threads',
	bluesky: 'Bluesky',
	facebook: 'Facebook',
	medium: 'Medium',
	website: 'Website'
};

export const MAX_LINK_URL_LENGTH = 600;

/**
 * Turns what someone pasted ("x.com/djwayne3", "https://…") into an http(s) URL, or
 * null when it can't be one. Never returns other schemes (javascript:, data:, mailto:).
 */
export function normalizeLinkUrl(raw: string | null | undefined): string | null {
	const trimmed = (raw ?? '').trim();
	if (!trimmed || trimmed.length > MAX_LINK_URL_LENGTH) return null;
	if (/\s/.test(trimmed)) return null;
	const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
	if (hasScheme && !/^https?:\/\//i.test(trimmed)) return null;
	const candidate = hasScheme ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`;
	try {
		const url = new URL(candidate);
		if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
		if (!url.hostname.includes('.') || url.username || url.password) return null;
		return url.toString();
	} catch {
		return null;
	}
}

function hostOf(url: string): string | null {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, '');
	} catch {
		return null;
	}
}

export function detectPlatform(url: string): SocialPlatform {
	const host = hostOf(url);
	if (!host) return 'website';
	for (const entry of PLATFORM_HOSTS) {
		if (entry.hosts.includes(host)) return entry.platform;
		if (entry.suffix && host.endsWith(entry.suffix)) return entry.platform;
	}
	return 'website';
}

/** "x.com/djwayne3" style text for showing a link without the scheme. */
export function displayUrl(url: string): string {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname.replace(/^www\./, '');
		const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
		return `${host}${path}${parsed.search}`;
	} catch {
		return url;
	}
}

/** The handle-ish tail of a social URL ("@djwayne3", "in/djwayne"), for labels. */
export function socialHandle(url: string): string | null {
	try {
		const parsed = new URL(url);
		const parts = parsed.pathname.split('/').filter(Boolean);
		if (parts.length === 0) return null;
		const platform = detectPlatform(url);
		if (platform === 'linkedin') return parts.slice(0, 2).join('/');
		if (platform === 'substack') return parsed.hostname.replace(/\.substack\.com$/, '');
		const first = parts[0] ?? '';
		return first.startsWith('@') ? first : `@${first}`;
	} catch {
		return null;
	}
}
