import { describe, expect, it } from 'vitest';
import { confidenceFromScore, tokenizeSearchText } from './search-ranking';

describe('tokenizeSearchText', () => {
	it('normalizes case, punctuation, and short tokens', () => {
		expect(tokenizeSearchText(' A Calendar, SEARCH! ')).toEqual(['calendar', 'search']);
	});

	it('preserves underscores by default and can split them for domain matching', () => {
		expect(tokenizeSearchText('project_management')).toEqual(['project_management']);
		expect(tokenizeSearchText('project_management', { preserveUnderscores: false })).toEqual([
			'project',
			'management'
		]);
	});
});

describe('confidenceFromScore', () => {
	it('uses the shared floor, scale, rounding, and ceiling', () => {
		expect(confidenceFromScore(0)).toBe(0);
		expect(confidenceFromScore(-10)).toBe(0);
		expect(confidenceFromScore(1)).toBe(0.35);
		expect(confidenceFromScore(110)).toBe(0.5);
		expect(confidenceFromScore(220)).toBe(0.95);
		expect(confidenceFromScore(1_000)).toBe(0.95);
	});
});
