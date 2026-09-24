// apps/web/src/lib/utils/analytics-url.test.ts
import { describe, expect, it } from 'vitest';
import { analyticsUrl } from './analytics-url';

describe('analyticsUrl', () => {
	it('keeps origin and path and drops the query string and hash', () => {
		expect(analyticsUrl('https://news.example.com/post/7?email=a@b.com&ref=x#top')).toBe(
			'https://news.example.com/post/7'
		);
		expect(analyticsUrl('/pricing?coupon=SECRET#plans')).toBe('/pricing');
		expect(analyticsUrl('android-app://com.google.android.gm/?q=1')).toBe(
			'android-app://com.google.android.gm/'
		);
	});

	it('returns null for empty values', () => {
		expect(analyticsUrl(null)).toBeNull();
		expect(analyticsUrl('   ')).toBeNull();
		expect(analyticsUrl('?only=query')).toBeNull();
	});
});
