// apps/web/src/lib/tests/agentic-e2e/phase-a/acceptance.test.ts
import { describe, expect, it } from 'vitest';

import { evaluateAcceptanceChecks, extractUrls } from './acceptance';
import type { FrozenAcceptanceCheck } from './fixtures';

function check(validatorId: string, config: Record<string, unknown>): FrozenAcceptanceCheck {
	return {
		validator_id: validatorId,
		description: validatorId,
		required: true,
		config
	};
}

describe('Phase A machine-checkable acceptance', () => {
	it('evaluates required and excluded terms case-insensitively', async () => {
		const results = await evaluateAcceptanceChecks(
			[
				check('answer.contains_all', { terms: ['PVT', 'Weekly'] }),
				check('answer.excludes_all', { terms: ['diagnosis'] })
			],
			'The weekly PVT baseline is a measurement.'
		);
		expect(results.every((result) => result.passed)).toBe(true);
	});

	it('counts only top-level bullets', async () => {
		const [result] = await evaluateAcceptanceChecks(
			[check('answer.bullet_count', { count: 2 })],
			'- First\n  - nested\n- Second'
		);
		expect(result?.passed).toBe(true);
	});

	it('extracts unique bare and markdown-link URLs', () => {
		expect(
			extractUrls(
				'See [one](https://example.com/a) and https://example.com/a. Also https://b.test/x'
			)
		).toEqual(['https://example.com/a', 'https://b.test/x']);
	});

	it('requires explicit question and scope terms for clarification', async () => {
		const [result] = await evaluateAcceptanceChecks(
			[check('route.asks_question', { terms: ['which project', 'content'] })],
			'Which project contains the content you want to plan?'
		);
		expect(result?.passed).toBe(true);
	});
});
