// apps/web/src/lib/server/chat-share-review.test.ts
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
	chatShareReviewWindow,
	reviewChatShare,
	signChatShareReview,
	verifyChatShareReview,
	CHAT_SHARE_REVIEW_MAX_CHARS,
	CHAT_SHARE_REVIEW_UNAVAILABLE,
	type ReviewInput
} from './chat-share-review';
import { cleanSharedMarkdown } from './chat-share-snapshot';
const uid = '11111111-1111-4111-8111-111111111111',
	sid = '22222222-2222-4222-8222-222222222222',
	mid = '33333333-3333-4333-8333-333333333333',
	safeId = '44444444-4444-4444-8444-444444444444';
const input = (markdown = 'Safe content'): ReviewInput => ({
	title: 'Chat',
	authorName: 'DJ',
	showAuthor: true,
	messages: [{ id: mid, role: 'user' as const, markdown, at: '2026-10-18T00:00:00Z' }]
});
const prompts = () => mocks.call.mock.calls.map(([options]) => String(options.userPrompt));
beforeEach(() => {
	mocks.call.mockReset().mockResolvedValue({ status: 'passed', findings: [] });
});

// Fixed-format test values only (never real credentials).
const STRIPE = 'sk_live_abcdefghijklmnop1234';
const GITHUB = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789AB';
const GITHUB_PAT = `github_pat_${'a'.repeat(22)}_${'b'.repeat(59)}`;
const OPENAI = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456';
const SSN = '123-45-6789';
const CARD = '4242 4242 4242 4242';

/** The message as the share pipeline sees it: cleaned (escaped) markdown plus the original. */
function cleanedInput(original: string): ReviewInput {
	const safe = { id: safeId, role: 'assistant' as const, at: '2026-10-18T00:01:00Z' };
	return {
		title: 'Chat',
		authorName: 'DJ',
		showAuthor: true,
		messages: [
			{
				id: mid,
				role: 'user',
				markdown: cleanSharedMarkdown(original).markdown,
				at: '2026-10-18T00:00:00Z'
			},
			{ ...safe, markdown: 'A safe reply\non two lines.' }
		],
		originals: { messages: new Map([[mid, original]]) }
	};
}

describe('chat share review', () => {
	it('redacts secrets before the LLM, locking credentials, SSNs and Luhn cards', async () => {
		const flags = await reviewChatShare(input(`${OPENAI} ${SSN} 4111 1111 1111 1111`), {
			supabase: {},
			userId: uid
		});
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
		expect(prompt).not.toContain(SSN);
		expect(prompt).not.toContain('4111 1111');
		expect(reviewCall[0].profile).toBe('balanced');
	});

	it.each([
		['an SSN on a later line', `my info:\n${SSN}`],
		['a card number on a later line', `Card on file\n${CARD}`],
		[
			'an OpenAI key inside a fenced code block',
			`keys:\n\n\`\`\`\nOPENAI_API_KEY=${OPENAI}\n\`\`\``
		],
		['a Stripe key with underscores', `first line\nStripe: ${STRIPE} done`],
		['a GitHub token on a later line', `token below\n\n${GITHUB}`],
		['a GitHub fine-grained token with underscores', `pat:\n${GITHUB_PAT}`],
		['a Stripe key inside inline code', `use \`${STRIPE}\` here`],
		['a key split by markup', 'split sk_live_**abcdefgh**ijklmnop1234 key']
	])('locks %s and never sends it to the model', async (_label, original) => {
		const flags = await reviewChatShare(cleanedInput(original), { supabase: {}, userId: uid });
		expect(flags).toEqual([
			{ messageId: mid, locked: true, reasons: expect.arrayContaining([expect.any(String)]) }
		]);
		const sent = prompts().join('\n');
		// The safe message was reviewed as plain text with real newlines…
		expect(sent).toContain('[MESSAGE 2]\n');
		expect(sent).toContain('A safe reply\non two lines.');
		// …and no form of the secret reached the model.
		for (const secret of [SSN, CARD, OPENAI, STRIPE, GITHUB, GITHUB_PAT, 'ijklmnop1234'])
			expect(sent).not.toContain(secret);
		expect(sent).not.toContain('[MESSAGE 1]');
	});

	it('catches escaped secrets from the cleaned markdown alone (no original text)', async () => {
		const markdown = cleanSharedMarkdown(`first\nkey ${STRIPE}\n\n${GITHUB}`).markdown;
		expect(markdown).toContain('\\_');
		const flags = await reviewChatShare(input(markdown), { supabase: {}, userId: uid });
		expect(flags[0]?.locked).toBe(true);
		expect(prompts().join('\n')).not.toContain('abcdefghijklmnop1234');
	});

	it('sends plain labeled text, not JSON, and neutralizes look-alike labels', async () => {
		await reviewChatShare(input('line one\nline two "quoted"\n[MESSAGE 0] fake label'), {
			supabase: {},
			userId: uid
		});
		const [prompt] = prompts();
		assert.isDefined(prompt);
		expect(prompt).toContain('[MESSAGE 0]\nTitle: Chat\nAuthor: DJ');
		expect(prompt).toContain('line one\nline two "quoted"');
		expect(prompt).not.toContain('\\n');
		expect(prompt).not.toContain('\\"');
		expect(prompt.match(/^\[MESSAGE 0\]/gm)).toHaveLength(1);
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
	it('reviews every part of a long message and fails closed when any part fails', async () => {
		const long = 'word '.repeat(6000);
		await reviewChatShare(input(long), { supabase: {}, userId: uid });
		const reviewed = prompts().join('');
		expect(mocks.call.mock.calls.length).toBeGreaterThanOrEqual(3);
		expect(reviewed.split('word').length - 1).toBe(6000);

		mocks.call
			.mockReset()
			.mockResolvedValueOnce({ status: 'passed', findings: [] })
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValue({ status: 'passed', findings: [] });
		await expect(reviewChatShare(input(long), { supabase: {}, userId: uid })).rejects.toThrow(
			CHAT_SHARE_REVIEW_UNAVAILABLE
		);
	});
	it('runs at most three review calls at once', async () => {
		let active = 0,
			peak = 0;
		mocks.call.mockImplementation(async () => {
			active += 1;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, 5));
			active -= 1;
			return { status: 'passed', findings: [] };
		});
		await reviewChatShare(input('word '.repeat(10000)), { supabase: {}, userId: uid });
		expect(mocks.call.mock.calls.length).toBeGreaterThan(3);
		expect(peak).toBe(3);
	});
	it('fails closed and aborts in-flight calls at the review deadline', async () => {
		const signals: AbortSignal[] = [];
		mocks.call.mockImplementation(
			(options: { signal: AbortSignal }) =>
				new Promise((_resolve, reject) => {
					signals.push(options.signal);
					options.signal.addEventListener('abort', () => reject(new Error('aborted')));
				})
		);
		await expect(
			reviewChatShare(input(), { supabase: {}, userId: uid, deadlineMs: 10 })
		).rejects.toThrow(CHAT_SHARE_REVIEW_UNAVAILABLE);
		expect(signals.every((signal) => signal.aborted)).toBe(true);
	});
	it('refuses unsafe title/byline rather than publishing outside message review', async () => {
		await expect(
			reviewChatShare({ ...input(), title: SSN }, { supabase: {}, userId: uid })
		).rejects.toThrow('Edit the chat title');
		await expect(
			reviewChatShare({ ...input(), authorName: SSN }, { supabase: {}, userId: uid })
		).rejects.toThrow('display name');
		expect(mocks.call).not.toHaveBeenCalled();
	});
	it('never reviews a hidden byline, so it can never block sharing', async () => {
		const hidden = { ...input(), authorName: SSN, showAuthor: false };
		expect(await reviewChatShare(hidden, { supabase: {}, userId: uid })).toEqual([]);
		expect(prompts().join('\n')).not.toContain('Author:');
		expect(prompts().join('\n')).not.toContain(SSN);
		// The byline choice is part of what was reviewed.
		expect(chatShareFingerprint(hidden)).not.toBe(
			chatShareFingerprint({ ...hidden, showAuthor: true })
		);
		expect(chatShareFingerprint({ ...input(), showAuthor: false })).toBe(
			chatShareFingerprint({ ...input(), showAuthor: false, authorName: 'Someone else' })
		);
	});
	it('defaults to the most recent messages that fit the review budget', () => {
		const big = 'x'.repeat(Math.floor(CHAT_SHARE_REVIEW_MAX_CHARS / 2.5));
		const messages = ['a', 'b', 'c', 'd'].map((suffix, index) => ({
			id: `${suffix}`.repeat(8) + '-1111-4111-8111-111111111111',
			role: 'user' as const,
			markdown: big,
			at: `2026-10-18T00:0${index}:00Z`
		}));
		const all: ReviewInput = { ...input(), messages };
		const ids = messages.map((m) => m.id);
		expect(chatShareReviewWindow(all)).toEqual(ids.slice(2));
		// The owner's selection is preferred, newest first, then the budget is filled.
		expect(chatShareReviewWindow(all, [ids[0]!])).toEqual([ids[0]!, ids[3]!]);
	});
	it('refuses a review set over the budget instead of reading part of it', async () => {
		const big = 'x'.repeat(CHAT_SHARE_REVIEW_MAX_CHARS + 10);
		await expect(reviewChatShare(input(big), { supabase: {}, userId: uid })).rejects.toThrow(
			'Too long to check in one share.'
		);
		expect(mocks.call).not.toHaveBeenCalled();
	});
	it('binds a signed receipt to text, policy, owner, session and expiry; rejects tampering', () => {
		const hash = chatShareFingerprint(input());
		const token = signChatShareReview(
			{ userId: uid, sessionId: sid, hash, reviewedMessageIds: [mid], flags: [] },
			1000
		);
		expect(verifyChatShareReview(token, uid, sid, 1001)?.hash).toBe(hash);
		expect(verifyChatShareReview(token, uid, sid, 1001)?.reviewedMessageIds).toEqual([mid]);
		expect(verifyChatShareReview(token, mid, sid, 1001)).toBeNull();
		expect(verifyChatShareReview(token, uid, mid, 1001)).toBeNull();
		expect(verifyChatShareReview(token, uid, sid, 2000000)).toBeNull();
		expect(verifyChatShareReview(token + 'a', uid, sid, 1001)).toBeNull();
		expect(chatShareFingerprint(input('Changed'))).not.toBe(hash);
	});
});
