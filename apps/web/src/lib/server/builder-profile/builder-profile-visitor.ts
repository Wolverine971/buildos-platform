// apps/web/src/lib/server/builder-profile/builder-profile-visitor.ts
//
// Counting builder page views and link taps without storing who visited. The event route
// turns the visitor's network address into a key that changes every day (a keyed hash of
// the address and the UTC date), so the database can count one view per visitor per page
// per day and cap their taps, and the keys can't be joined across days or turned back
// into an address. IPv6 visitors are keyed by their /64 network, which one device or
// household can't rotate out of.

import { createHmac } from 'node:crypto';

/** The part of an address that identifies one visitor: IPv4 as is, IPv6 by its /64. */
export function visitorNetwork(address: string | null | undefined): string | null {
	const raw = (address ?? '').trim().toLowerCase();
	if (!raw) return null;
	// "::ffff:1.2.3.4" is an IPv4 visitor seen through IPv6.
	const mapped = raw.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
	if (mapped) return mapped[1] ?? null;
	if (!raw.includes(':')) return raw;
	const [head = '', tail = ''] = raw.split('::');
	const left = head ? head.split(':') : [];
	const right = tail ? tail.split(':') : [];
	const missing = raw.includes('::') ? Math.max(0, 8 - left.length - right.length) : 0;
	const groups = [...left, ...Array<string>(missing).fill('0'), ...right];
	return groups
		.slice(0, 4)
		.map((g) => g.replace(/^0+(?=.)/, '') || '0')
		.join(':');
}

/** Today's key for this visitor (null when the address is unknown). */
export function visitorKey(
	address: string | null | undefined,
	secret: string,
	now: Date = new Date()
): string | null {
	const network = visitorNetwork(address);
	if (!network || !secret) return null;
	const day = now.toISOString().slice(0, 10);
	return createHmac('sha256', secret)
		.update(`builder-page:${day}:${network}`)
		.digest('base64url')
		.slice(0, 32);
}
