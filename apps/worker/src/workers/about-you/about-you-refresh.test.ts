// apps/worker/src/workers/about-you/about-you-refresh.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	ABOUT_YOU_MAX_EVIDENCE_CHARS,
	ABOUT_YOU_MESSAGE_CHARS,
	ABOUT_YOU_REFRESH_MODELS,
	ABOUT_YOU_REFRESH_SYSTEM_PROMPT,
	aboutYouInputHash,
	askForAboutYouRefresh,
	buildAboutYouRefreshPrompt,
	checkAboutYouRefreshAnswer,
	selectAboutYouEvidence
} from './about-you-refresh';

describe('selectAboutYouEvidence', () => {
	it('keeps the newest messages within budget and returns them oldest first', () => {
		const messages = Array.from({ length: 80 }, (_, index) => ({
			at: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString(),
			where: 'Workspace chat',
			text: `message ${index} ${'x'.repeat(900)}`
		}));
		const kept = selectAboutYouEvidence(messages);
		expect(kept.length).toBeGreaterThan(0);
		expect(kept.every((message) => message.text.length <= ABOUT_YOU_MESSAGE_CHARS)).toBe(true);
		expect(kept.reduce((sum, message) => sum + message.text.length, 0)).toBeLessThanOrEqual(
			ABOUT_YOU_MAX_EVIDENCE_CHARS
		);
		expect(kept.at(-1)!.text.startsWith('message 79')).toBe(true);
		expect(Date.parse(kept[0]!.at)).toBeLessThan(Date.parse(kept.at(-1)!.at));
	});

	it('drops empty messages', () => {
		expect(
			selectAboutYouEvidence([{ at: '2026-10-01T00:00:00Z', where: 'BuildOS', text: '   ' }])
		).toEqual([]);
	});
});

describe('buildAboutYouRefreshPrompt', () => {
	it('shows the note, the deleted lines, the projects and the person’s messages', () => {
		const prompt = buildAboutYouRefreshPrompt({
			today: '2026-10-23',
			current: [
				{
					heading: 'Schedule and constraints',
					lines: [{ text: 'Works late into the night', noted: 'Oct 2026' }]
				}
			],
			suppressedKeys: ['owns firearms'],
			messages: [
				{
					at: '2026-10-20T00:56:00Z',
					where: 'Wayne Strategies',
					text: 'Okay, so what all is overdue over here?'
				}
			],
			projectNames: ['BuildOS', '9takes']
		});
		expect(prompt).toContain('Today: 2026-10-23');
		expect(prompt).toContain('- Works late into the night (noted Oct 2026)');
		expect(prompt).toContain('- owns firearms');
		expect(prompt).toContain('BuildOS; 9takes');
		expect(prompt).toContain('[2026-10-20 · Wayne Strategies] Okay, so what all is overdue');
	});

	it('marks empty inputs plainly', () => {
		const prompt = buildAboutYouRefreshPrompt({
			today: '2026-10-23',
			current: [],
			suppressedKeys: [],
			messages: [],
			projectNames: []
		});
		expect(prompt).toContain('Current note:\n(empty)');
		expect(prompt).toContain('deleted. Never write these again, reworded or not:\n(none)');
	});
});

describe('checkAboutYouRefreshAnswer', () => {
	it('keeps well-formed lines and notes the rest', () => {
		const answer = checkAboutYouRefreshAnswer({
			lines: [
				{
					heading: 'How you like answers',
					text: 'Outcome first',
					basis: 'lead with outcome'
				},
				{ heading: '', text: 'no heading' },
				'not an object'
			],
			changed: 'Added how they like answers.'
		});
		expect(answer.lines).toEqual([{ heading: 'How you like answers', text: 'Outcome first' }]);
		expect(answer.changed).toBe('Added how they like answers.');
		expect(answer.notes).toHaveLength(2);
	});

	it('treats a malformed answer as no lines', () => {
		expect(checkAboutYouRefreshAnswer({ nope: true })).toEqual({
			lines: [],
			changed: 'nothing',
			notes: ['answer had no lines array']
		});
	});
});

describe('aboutYouInputHash', () => {
	it('changes only when what the model reads changes', () => {
		const base = {
			current: [],
			suppressedKeys: ['b', 'a'],
			messages: [{ at: '2026-10-20T00:00:00Z', where: 'X', text: 'hi' }]
		};
		expect(aboutYouInputHash(base)).toBe(
			aboutYouInputHash({ ...base, suppressedKeys: ['a', 'b'] })
		);
		expect(aboutYouInputHash(base)).not.toBe(
			aboutYouInputHash({
				...base,
				messages: [{ at: '2026-10-20T00:00:00Z', where: 'X', text: 'hello' }]
			})
		);
	});
});

describe('askForAboutYouRefresh', () => {
	it('sends one capped JSON call on the cheap models', async () => {
		const getJSONResponse = vi.fn().mockResolvedValue({ lines: [], changed: 'nothing' });
		await askForAboutYouRefresh({ getJSONResponse }, 'prompt', { userId: 'u1' });
		const options = getJSONResponse.mock.calls[0]![0];
		expect(options.systemPrompt).toBe(ABOUT_YOU_REFRESH_SYSTEM_PROMPT);
		expect(options.models).toEqual([...ABOUT_YOU_REFRESH_MODELS]);
		expect(options.operationType).toBe('about_you_refresh');
		expect(options.spendLimit).toEqual({ maxCostUsd: 0.01 });
	});
});
