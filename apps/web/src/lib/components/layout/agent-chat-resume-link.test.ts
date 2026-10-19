import { describe, expect, it, vi } from 'vitest';
import { createChatResumeLinkHandler } from './agent-chat-resume-link';
import { readChatResumeSessionId } from '$lib/utils/agent-chat-resume';

const id = '12345678-1234-4321-9876-123456789abc';
const url = new URL(`https://build-os.com/today?view=all&chat=${id}#work`);
function fixture() {
	const deps = {
		isSignedIn: vi.fn(() => true),
		visibleSession: vi.fn<() => string | null>(() => null),
		suspendUrl: vi.fn(() => vi.fn()),
		cleanUrl: vi.fn(async (_url: URL) => {}),
		open: vi.fn(async (_id: string) => false),
		close: vi.fn(),
		notFound: vi.fn(),
		restoreHistoryUrl: vi.fn(),
		record: vi.fn()
	};
	return { deps, handler: createChatResumeLinkHandler(deps) };
}

describe('chat resume links', () => {
	it.each(['bad', '../sessions/1', '', '12345678-1234-4321-9876-123456789ab'])(
		'ignores malformed ID %s',
		(value) => {
			expect(
				readChatResumeSessionId(new URL(`https://build-os.com/?chat=${value}`))
			).toBeNull();
		}
	);
	it('accepts UUIDs without restricting their version', () => {
		expect(readChatResumeSessionId(url)).toBe(id);
	});
	it('awaits cleanup before opening and preserves the rest of the URL', async () => {
		const { deps, handler } = fixture();
		let cleaned!: () => void;
		deps.cleanUrl.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					cleaned = resolve;
				})
		);
		const opening = handler.handle(url);
		await Promise.resolve();
		expect(deps.open).not.toHaveBeenCalled();
		expect(deps.cleanUrl.mock.calls[0][0].href).toBe(
			'https://build-os.com/today?view=all#work'
		);
		cleaned();
		await opening;
		expect(deps.open).toHaveBeenCalledExactlyOnceWith(id);
		expect(deps.suspendUrl.mock.results[0].value).toHaveBeenCalledOnce();
		expect(deps.record).not.toHaveBeenCalled();
		handler.complete(id, 'ok');
		expect(deps.record).toHaveBeenCalledWith('ok', false);
	});
	it('ignores signed-out links and the URL already owned by a visible chat', async () => {
		const { deps, handler } = fixture();
		deps.isSignedIn.mockReturnValue(false);
		await handler.handle(url);
		deps.isSignedIn.mockReturnValue(true);
		deps.visibleSession.mockReturnValue(id);
		await handler.handle(url);
		expect(deps.cleanUrl).not.toHaveBeenCalled();
		expect(deps.open).not.toHaveBeenCalled();
	});
	it('deduplicates cleanup replays and records reused parked chats immediately', async () => {
		const { deps, handler } = fixture();
		deps.open.mockResolvedValue(true);
		await Promise.all([handler.handle(url), handler.handle(url)]);
		expect(deps.open).toHaveBeenCalledOnce();
		expect(deps.record).toHaveBeenCalledExactlyOnceWith('ok', false);
	});
	it('shows the missing-chat toast and closes only the requested missing session', async () => {
		const { deps, handler } = fixture();
		await handler.handle(url);
		handler.complete('other-session', 'not_found');
		expect(deps.close).not.toHaveBeenCalled();
		handler.complete(id, 'not_found');
		expect(deps.notFound).toHaveBeenCalledOnce();
		expect(deps.close).toHaveBeenCalledOnce();
		expect(deps.record).toHaveBeenCalledWith('not_found', false);
	});
	it('leaves transport failures in the modal for retry', async () => {
		const { deps, handler } = fixture();
		await handler.handle(url);
		handler.complete(id, 'error');
		expect(deps.close).not.toHaveBeenCalled();
		expect(deps.notFound).not.toHaveBeenCalled();
		expect(deps.record).toHaveBeenCalledWith('error', false);
	});
	it.each(['password', 'oauth'])('records returning through %s login', async (kind) => {
		const { deps, handler } = fixture();
		const target = new URL(url);
		if (kind === 'oauth') target.searchParams.set('auth_success', 'true');
		await handler.handle(
			target,
			kind === 'password' ? new URL('https://build-os.com/auth/login') : null
		);
		handler.complete(id, 'ok');
		expect(deps.record).toHaveBeenCalledWith('ok', true);
	});
	it('allows the same link again after dismissing an unfinished load', async () => {
		const { deps, handler } = fixture();
		await handler.handle(url);
		handler.cancel(id);
		await handler.handle(url);
		expect(deps.open).toHaveBeenCalledTimes(2);
	});

	it('serializes cleanup and opens only the latest of rapidly arriving links', async () => {
		const { deps, handler } = fixture();
		let finish!: () => void;
		deps.cleanUrl.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		const first = handler.handle(url);
		await Promise.resolve();
		const secondId = '12345678-1234-4321-9876-123456789abd';
		const thirdId = '12345678-1234-4321-9876-123456789abe';
		const second = handler.handle(new URL(`https://build-os.com/today?chat=${secondId}`));
		const third = handler.handle(new URL(`https://build-os.com/today?chat=${thirdId}`));
		expect(deps.cleanUrl).toHaveBeenCalledOnce();
		finish();
		await Promise.all([first, second, third]);
		expect(deps.cleanUrl).toHaveBeenCalledTimes(2);
		expect(deps.open).toHaveBeenCalledExactlyOnceWith(thirdId);
	});
	it('does not reopen a closed chat when Back reaches an old chat-owned entry', async () => {
		const { deps, handler } = fixture();
		await handler.handle(url, null, true);
		expect(deps.restoreHistoryUrl).toHaveBeenCalledOnce();
		expect(deps.cleanUrl).not.toHaveBeenCalled();
		expect(deps.open).not.toHaveBeenCalled();
	});
	it('removes the duplicate legacy History selection while opening a canonical chat link', async () => {
		const { deps, handler } = fixture();
		await handler.handle(
			new URL(
				`https://build-os.com/history?filter=all&id=${id}&itemType=chat_session&chat=${id}#recent`
			)
		);
		expect(deps.cleanUrl.mock.calls[0][0].href).toBe(
			'https://build-os.com/history?filter=all#recent'
		);
		expect(deps.open).toHaveBeenCalledExactlyOnceWith(id);
	});
});
