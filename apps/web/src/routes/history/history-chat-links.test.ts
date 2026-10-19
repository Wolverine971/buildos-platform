import { describe, expect, it } from 'vitest';
import { legacyHistoryChatResumeUrl } from './history-chat-links';

const SESSION = '2490d11a-b340-4239-bb2e-e12a08e51e16';

describe('legacy History chat links', () => {
	it('converts selection to a canonical resume link, preserving filters and hash', () => {
		const url = new URL(
			`https://build-os.com/history?type=chats&id=${SESSION}&itemType=chat_session#recent`
		);
		expect(legacyHistoryChatResumeUrl(url, SESSION, {})?.href).toBe(
			`https://build-os.com/history?type=chats&chat=${SESSION}#recent`
		);
		expect(url.searchParams.get('id')).toBe(SESSION);
	});

	it('leaves canonical chat links to Navigation without opening a second host', () => {
		const url = new URL(
			`https://build-os.com/history?id=${SESSION}&itemType=chat_session&chat=${SESSION}`
		);
		expect(legacyHistoryChatResumeUrl(url, SESSION, {})).toBeNull();
	});

	it('does not reopen a chat when Back returns to its old shallow entry', () => {
		const url = new URL(`https://build-os.com/history?id=${SESSION}&itemType=chat_session`);
		expect(legacyHistoryChatResumeUrl(url, SESSION, { agentChat: 'old-instance' })).toBeNull();
	});

	it.each([
		'/history',
		`/history?id=other&itemType=chat_session`,
		`/history?id=${SESSION}&itemType=braindump`,
		`/projects?id=${SESSION}&itemType=chat_session`
	])('ignores streamed selections that no longer match %s', (path) => {
		expect(
			legacyHistoryChatResumeUrl(new URL(path, 'https://build-os.com'), SESSION, {})
		).toBeNull();
	});
});
