// apps/web/src/lib/components/dashboard/dashboard-presentation.test.ts
import { describe, expect, it } from 'vitest';
import { formatActivityDay, getDashboardChatPresentation } from './dashboard-presentation';

describe('dashboard activity days', () => {
	it('groups by calendar day rather than elapsed hours across midnight and year boundaries', () => {
		const now = new Date(2026, 0, 1, 0, 5);
		expect(formatActivityDay(new Date(2026, 0, 1, 0, 1).toISOString(), now)).toBe('Today');
		expect(formatActivityDay(new Date(2025, 11, 31, 23, 59).toISOString(), now)).toBe(
			'Yesterday'
		);
		expect(formatActivityDay(new Date(2025, 11, 30, 12).toISOString(), now)).toContain('2025');
	});

	it('does not label future dates as today and tolerates missing dates', () => {
		const now = new Date(2026, 8, 29, 12);
		expect(formatActivityDay(new Date(2026, 8, 30, 12).toISOString(), now)).not.toBe('Today');
		expect(formatActivityDay('invalid', now)).toBe('Recent');
	});
});

describe('dashboard chat previews', () => {
	const session = {
		title: 'Untitled chat session',
		summary: null,
		project_name: 'BuildOS',
		context_label: 'Project',
		last_activity_at: new Date(2026, 8, 29, 12, 42).toISOString()
	};
	it('preserves real titles, even those containing the legacy fallback text', () => {
		const title = 'Untitled chat session ideas';
		expect(getDashboardChatPresentation({ ...session, title })).toEqual({
			title,
			subtitle: 'BuildOS'
		});
	});
	it('uses the existing summary as a readable label when the server emits its fallback', () => {
		const result = getDashboardChatPresentation({
			...session,
			summary: 'Review [[plan:abc|**Launch plan**]]'
		});
		expect(result.title).toBe('Review Launch plan');
		expect(result.subtitle).toContain('BuildOS');
		expect(result.subtitle).toContain('12:42');
	});
	it('distinguishes otherwise unnamed chats with context and a timestamp', () => {
		const first = getDashboardChatPresentation(session);
		const second = getDashboardChatPresentation({
			...session,
			last_activity_at: new Date(2026, 8, 29, 11, 20).toISOString()
		});
		expect(first.title).toBe('BuildOS chat');
		expect(first.subtitle).not.toBe(second.subtitle);
		expect(
			getDashboardChatPresentation({
				...session,
				title: '',
				project_name: null,
				context_label: 'General chat'
			}).title
		).toBe('General chat');
	});
});
