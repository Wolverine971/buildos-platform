// apps/worker/src/workers/notification/emailAdapter.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationDelivery } from '@buildos/shared-types';

vi.mock('@buildos/supabase-client', () => ({
	createServiceClient: vi.fn(() => ({}))
}));

vi.mock('./preferenceChecker.js', () => ({
	checkUserPreferences: vi.fn()
}));

import { formatEmailTemplate } from './emailAdapter.js';

function makeDelivery(payload: Record<string, unknown>): NotificationDelivery {
	return {
		id: 'delivery-1',
		event_id: 'event-1',
		recipient_user_id: 'user-1',
		channel: 'email',
		status: 'pending',
		attempts: 0,
		max_attempts: 3,
		created_at: '2026-11-05T12:00:00.000Z',
		updated_at: '2026-11-05T12:00:00.000Z',
		payload
	} as unknown as NotificationDelivery;
}

describe('formatEmailTemplate', () => {
	const originalAppUrl = process.env.PUBLIC_APP_URL;

	beforeEach(() => {
		process.env.PUBLIC_APP_URL = 'https://build-os.com';
	});

	afterEach(() => {
		if (originalAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
		else process.env.PUBLIC_APP_URL = originalAppUrl;
	});

	it('escapes payload title and body instead of rendering them as HTML', () => {
		const { html, text } = formatEmailTemplate(
			makeDelivery({
				event_type: 'task.assigned',
				title: '<script>alert(1)</script>Urgent',
				body: 'Click <a href="https://evil.example">here</a> & "verify"\nSecond line'
			})
		);

		expect(html).not.toContain('<script>');
		expect(html).not.toContain('<a href="https://evil.example">');
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;Urgent');
		expect(html).toContain(
			'Click &lt;a href=&quot;https://evil.example&quot;&gt;here&lt;/a&gt; &amp; &quot;verify&quot;<br>Second line'
		);
		// Plain-text part stays plain.
		expect(text).toContain('<script>alert(1)</script>Urgent');
	});

	it('keeps app-origin action links and drops foreign or script links', () => {
		const appLink = formatEmailTemplate(
			makeDelivery({ title: 'T', body: 'B', action_url: '/projects/p-1?a=1&b=2' })
		);
		expect(appLink.html).toContain('href="https://build-os.com/projects/p-1?a=1&amp;b=2"');
		expect(appLink.text).toContain('View details: https://build-os.com/projects/p-1?a=1&b=2');

		for (const actionUrl of [
			'https://evil.example/login',
			'//evil.example/login',
			'javascript:alert(1)'
		]) {
			const { html, text } = formatEmailTemplate(
				makeDelivery({ title: 'T', body: 'B', action_url: actionUrl })
			);
			expect(html).not.toContain('evil.example');
			expect(html).not.toContain('javascript:');
			expect(html).not.toContain('View Details');
			expect(text).not.toContain('View details:');
		}

		// A quote in a relative path cannot break out of the href attribute.
		const quoted = formatEmailTemplate(
			makeDelivery({ title: 'T', body: 'B', action_url: '/x" onmouseover="alert(1)' })
		);
		expect(quoted.html).not.toContain('" onmouseover="');
	});

	it('only renders http(s) images and escapes the src', () => {
		const ok = formatEmailTemplate(
			makeDelivery({ title: 'T', body: 'B', image_url: 'https://cdn.example/a.png?x="1"' })
		);
		expect(ok.html).toContain('src="https://cdn.example/a.png?x=%221%22"');

		const bad = formatEmailTemplate(
			makeDelivery({ title: 'T', body: 'B', image_url: 'javascript:alert(1)' })
		);
		expect(bad.html).not.toContain('<img src=');
	});

	it('ignores non-string payload values', () => {
		const { html } = formatEmailTemplate(
			makeDelivery({ title: { html: '<b>x</b>' }, body: ['<i>y</i>'] })
		);
		expect(html).toContain('>Notification</h1>');
		expect(html).not.toContain('<b>x</b>');
		expect(html).not.toContain('<i>y</i>');
	});
});
