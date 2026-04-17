// apps/web/src/lib/utils/public-page-url.ts
// Shared helpers for building + copying canonical public-page URLs.
// Canonical form is `/p/{slug_prefix}/{slug_base}` when both parts exist,
// falling back to `/p/{slug}` only for legacy rows.

import { browser } from '$app/environment';

export type PublicPageUrlParts = {
	slug?: string | null;
	slug_prefix?: string | null;
	slug_base?: string | null;
	url_path?: string | null;
};

export function buildPublicPageUrlPath(parts: PublicPageUrlParts): string | null {
	if (parts.url_path && parts.url_path.startsWith('/p/')) {
		return parts.url_path;
	}
	if (parts.slug_prefix && parts.slug_base) {
		return `/p/${parts.slug_prefix}/${parts.slug_base}`;
	}
	if (parts.slug) {
		return `/p/${parts.slug}`;
	}
	return null;
}

export function buildAbsolutePublicPageUrl(parts: PublicPageUrlParts): string | null {
	if (!browser) return null;
	const path = buildPublicPageUrlPath(parts);
	if (!path) return null;
	return `${window.location.origin}${path}`;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
	if (!browser) return false;
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.setAttribute('readonly', '');
		textarea.style.position = 'fixed';
		textarea.style.opacity = '0';
		document.body.appendChild(textarea);
		textarea.select();
		const ok = document.execCommand('copy');
		document.body.removeChild(textarea);
		return ok;
	} catch {
		return false;
	}
}
