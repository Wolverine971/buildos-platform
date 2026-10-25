// apps/web/src/lib/builder-profile/project-pages.ts
//
// Project pages: each Live project on a builder page has its own address,
// build-os.com/@handle/<slug>. The slug is the project's public name in lowercase with
// runs of other characters turned into "-" (public.get_builder_project matches the same
// way), or the project id when the name can't make a clean, unique slug.

import { normalizeLinkUrl } from './links';
import type { BuilderProfileProjectCard } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Wayne Strategies" → "wayne-strategies". Mirrors the SQL in get_builder_project. */
export function projectSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** True for a slug or project id a project page route can be asked for. */
export function isProjectPageSlug(value: string): boolean {
	return UUID.test(value) || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

/**
 * The page address for every Live project, keyed by project id, in page order. The
 * first project to claim a slug gets it; a later one with the same slug, or a name
 * outside plain ASCII (where database and browser lowercasing can differ), uses its id.
 */
export function projectPaths(
	handle: string,
	projects: Pick<BuilderProfileProjectCard, 'id' | 'name' | 'level'>[]
): Map<string, string> {
	const paths = new Map<string, string>();
	const taken = new Set<string>();
	for (const project of projects) {
		if (project.level !== 'live') continue;
		const slug = /^[\x20-\x7e]*$/.test(project.name) ? projectSlug(project.name) : '';
		const usable = slug && !taken.has(slug) && !UUID.test(slug);
		if (usable) taken.add(slug);
		paths.set(project.id, `/@${handle}/${usable ? slug : project.id}`);
	}
	return paths;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Where "I'm interested" goes: a web address, or an email address as a mailto: link.
 * Null when it's neither. Never returns other schemes.
 */
export function normalizeReplyUrl(raw: string | null | undefined): string | null {
	const trimmed = (raw ?? '').trim();
	if (!trimmed || trimmed.length > 590) return null;
	const email = trimmed.replace(/^mailto:/i, '');
	if (EMAIL.test(email) && !email.includes('/')) return `mailto:${email}`;
	if (/^mailto:/i.test(trimmed)) return null;
	return normalizeLinkUrl(trimmed);
}

/** How a reply address reads in the editor: the bare email, or the link without https://. */
export function replyDisplay(url: string | null | undefined): string {
	if (!url) return '';
	if (/^mailto:/i.test(url)) return url.slice('mailto:'.length);
	return url.replace(/^https:\/\//i, '');
}

export function isEmailReply(url: string | null | undefined): boolean {
	return !!url && /^mailto:/i.test(url);
}
