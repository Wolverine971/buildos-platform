// apps/web/src/lib/server/builder-profile/builder-profile-visitor.test.ts
import { describe, expect, it } from 'vitest';
import { visitorKey, visitorNetwork } from './builder-profile-visitor';

describe('visitor keys for counting', () => {
	it('keys IPv4 by address and IPv6 by its /64 network', () => {
		expect(visitorNetwork('203.0.113.9')).toBe('203.0.113.9');
		expect(visitorNetwork('::ffff:203.0.113.9')).toBe('203.0.113.9');
		expect(visitorNetwork('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2');
		expect(visitorNetwork('2001:db8:1:2:bbbb:cccc:dddd:eeee')).toBe('2001:db8:1:2');
		expect(visitorNetwork('2001:db8::1')).toBe('2001:db8:0:0');
		expect(visitorNetwork('')).toBeNull();
	});

	it('is stable within a day, different the next day, and never the address', () => {
		const day = new Date('2026-11-15T10:00:00Z');
		const later = new Date('2026-11-15T23:00:00Z');
		const next = new Date('2026-11-16T01:00:00Z');
		const a = visitorKey('203.0.113.9', 'secret', day);
		expect(a).toBe(visitorKey('203.0.113.9', 'secret', later));
		expect(a).not.toBe(visitorKey('203.0.113.9', 'secret', next));
		expect(a).not.toBe(visitorKey('203.0.113.10', 'secret', day));
		expect(a).not.toContain('203');
		expect(a?.length).toBeLessThanOrEqual(32);
		// Rotating the low IPv6 bits doesn't make a new visitor.
		expect(visitorKey('2001:db8:1:2::1', 's', day)).toBe(
			visitorKey('2001:db8:1:2::ffff', 's', day)
		);
		expect(visitorKey(null, 'secret', day)).toBeNull();
		expect(visitorKey('203.0.113.9', '', day)).toBeNull();
	});
});
