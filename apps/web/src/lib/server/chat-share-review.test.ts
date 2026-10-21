import { assert, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('$env/static/private', () => ({ PRIVATE_SUPABASE_SERVICE_KEY: 'test-only-key' }));
vi.mock('$lib/services/smart-llm-service', () => ({
	SmartLLMService: class {
		getJSONResponse = mocks.call;
	}
}));
import {
	chatShareFingerprint,
	reviewChatShare,
	signChatShareReview,
	verifyChatShareReview,
	CHAT_SHARE_REVIEW_UNAVAILABLE
} from './chat-share-review';
const uid = '11111111-1111-4111-8111-111111111111',
	sid = '22222222-2222-4222-8222-222222222222',
	mid = '33333333-3333-4333-8333-333333333333';
const input = (markdown = 'Safe content') => ({
	title: 'Chat',
	authorName: 'DJ',
	messages: [{ id: mid, role: 'user' as const, markdown, at: '2026-10-18T00:00:00Z' }]
});
beforeEach(() => {
	mocks.call.mockReset().mockResolvedValue({ status: 'passed', findings: [] });
});
describe('chat share review', () => {
	it('redacts secrets before the LLM, locking credentials, SSNs and Luhn cards', async () => {
		const flags = await reviewChatShare(
			input('sk-proj-abcdefghijklmnopqrstuvwxyz123456 123-45-6789 4111 1111 1111 1111'),
			{ supabase: {}, userId: uid }
		);
		expect(flags).toEqual([
			{
				messageId: mid,
				locked: true,
				reasons: expect.arrayContaining([
					'Possible API key detected.',
					'Possible Social Security Number detected.',
					'Possible credit card number detected.'
				])
			}
		]);
		const [reviewCall] = mocks.call.mock.calls;
		assert.isDefined(reviewCall);
		const prompt = reviewCall[0].userPrompt;
		expect(prompt).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
		expect(prompt).not.toContain('123-45-6789');
		expect(prompt).not.toContain('4111 1111');
		expect(reviewCall[0].profile).toBe('balanced');
	});
	it('maps structured message numbers, never excerpts, to re-checkable flags', async () => {
		mocks.call.mockResolvedValue({
			status: 'flagged',
			findings: [
				{ message: 1, category: 'personal_data', reason: 'May contain private details.' }
			]
		});
		expect(await reviewChatShare(input(), { supabase: {}, userId: uid })).toEqual([
			{ messageId: mid, locked: false, reasons: ['May contain private details.'] }
		]);
	});
	it.each(['credentials', 'ssn', 'payment_card'])(
		'locks structured %s findings',
		async (category) => {
			mocks.call.mockResolvedValue({
				status: 'flagged',
				findings: [{ message: 1, category, reason: 'Sensitive identifier.' }]
			});
			const [flag] = await reviewChatShare(input(), { supabase: {}, userId: uid });
			assert.isDefined(flag);
			expect(flag.locked).toBe(true);
		}
	);
	it.each([
		{},
		{ status: 'flagged', findings: [] },
		{
			status: 'passed',
			findings: [{ message: 90, category: 'other', reason: 'Invalid index' }]
		}
	])('fails closed on an incomplete or invalid review', async (result) => {
		mocks.call.mockResolvedValue(result);
		await expect(reviewChatShare(input(), { supabase: {}, userId: uid })).rejects.toThrow(
			CHAT_SHARE_REVIEW_UNAVAILABLE
		);
	});
	it('fails closed when any chunk fails and reviews all long-message chunks', async () => {
		mocks.call
			.mockResolvedValueOnce({ status: 'passed', findings: [] })
			.mockRejectedValueOnce(new Error('offline'));
		await expect(
			reviewChatShare(input('word '.repeat(6000)), { supabase: {}, userId: uid })
		).rejects.toThrow(CHAT_SHARE_REVIEW_UNAVAILABLE);
		expect(mocks.call).toHaveBeenCalledTimes(2);
	});
	it('refuses unsafe title/byline rather than publishing outside message review', async () => {
		await expect(
			reviewChatShare({ ...input(), title: '123-45-6789' }, { supabase: {}, userId: uid })
		).rejects.toThrow('Edit the chat title');
		expect(mocks.call).not.toHaveBeenCalled();
	});
	it('binds a signed receipt to text, policy, owner, session and expiry; rejects tampering', () => {
		const hash = chatShareFingerprint(input());
		const token = signChatShareReview({ userId: uid, sessionId: sid, hash, flags: [] }, 1000);
		expect(verifyChatShareReview(token, uid, sid, 1001)?.hash).toBe(hash);
		expect(verifyChatShareReview(token, mid, sid, 1001)).toBeNull();
		expect(verifyChatShareReview(token, uid, mid, 1001)).toBeNull();
		expect(verifyChatShareReview(token, uid, sid, 2000000)).toBeNull();
		expect(verifyChatShareReview(token + 'a', uid, sid, 1001)).toBeNull();
		expect(chatShareFingerprint(input('Changed'))).not.toBe(hash);
	});
});
