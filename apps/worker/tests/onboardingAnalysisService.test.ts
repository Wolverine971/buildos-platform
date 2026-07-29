import { describe, expect, it } from 'vitest';
import { normalizeOnboardingQuestionPriority } from '../src/workers/onboarding/onboardingAnalysisService';

describe('normalizeOnboardingQuestionPriority', () => {
	it('maps the legacy highest value to the valid high database value', () => {
		expect(normalizeOnboardingQuestionPriority('highest')).toBe('high');
	});

	it('preserves valid priorities case-insensitively', () => {
		expect(normalizeOnboardingQuestionPriority(' HIGH ')).toBe('high');
		expect(normalizeOnboardingQuestionPriority('medium')).toBe('medium');
		expect(normalizeOnboardingQuestionPriority('low')).toBe('low');
	});

	it('falls back safely for malformed model output', () => {
		expect(normalizeOnboardingQuestionPriority('urgent')).toBe('medium');
		expect(normalizeOnboardingQuestionPriority(null)).toBe('medium');
	});
});
