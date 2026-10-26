// apps/web/src/lib/server/email-link-signing.ts
// Click tracking rewrites every link in a sent email through
// /api/email-tracking/<id>/click?url=…. That endpoint only redirects off-site
// when the link carries a signature made at send time, so it can follow DJ's
// real links (Calendly, Loom, …) without becoming an open redirect.

import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '$env/dynamic/private';

function signingKey(): string | null {
	// A dedicated secret wins; otherwise derive one from the server-only service key.
	const base = env.PRIVATE_EMAIL_LINK_SECRET?.trim() || env.PRIVATE_SUPABASE_SERVICE_KEY?.trim();
	return base ? `email-click-v1:${base}` : null;
}

export function signEmailClickUrl(trackingId: string, url: string): string | null {
	const key = signingKey();
	if (!key) return null;
	return createHmac('sha256', key).update(`${trackingId}\n${url}`).digest('hex').slice(0, 32);
}

export function verifyEmailClickUrl(
	trackingId: string,
	url: string,
	signature: string | null | undefined
): boolean {
	if (!signature) return false;
	const expected = signEmailClickUrl(trackingId, url);
	if (!expected || expected.length !== signature.length) return false;
	return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/** Only real web links leave the site; mailto/tel/javascript never do. */
export function isExternalWebUrl(value: string): boolean {
	try {
		const parsed = new URL(value.trim());
		return parsed.protocol === 'https:' || parsed.protocol === 'http:';
	} catch {
		return false;
	}
}
