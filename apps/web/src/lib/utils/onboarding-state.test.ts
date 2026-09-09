// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
	clearOnboardingDrafts,
	onboardingProgress,
	onboardingStep,
	onboardingStorageKey,
	readOnboardingDraft,
	writeOnboardingDraft
} from './onboarding-state';

describe('onboarding milestones and account isolation', () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});
	it('never calls the Ready milestone complete until completion is committed', () => {
		expect(onboardingProgress(3)).toBe(75);
		expect(onboardingProgress(3, true)).toBe(100);
		expect(onboardingStep(undefined, 'explore', 'low')).toBe(1);
		expect(onboardingStep(99)).toBe(3);
	});
	it('keeps drafts separate between accounts and rejects an owner mismatch', () => {
		writeOnboardingDraft('alice', 'capture', { draft: 'Private idea' });
		expect(readOnboardingDraft('bob', 'capture')).toBeNull();
		localStorage.setItem(
			onboardingStorageKey('bob', 'capture'),
			localStorage.getItem(onboardingStorageKey('alice', 'capture'))!
		);
		expect(readOnboardingDraft('bob', 'capture')).toBeNull();
		expect(readOnboardingDraft('alice', 'capture')).toEqual({ draft: 'Private idea' });
	});
	it('clears both current and legacy onboarding storage without deleting unrelated preferences', () => {
		writeOnboardingDraft('alice', 'capture', { draft: 'Private idea' });
		localStorage.setItem('theme', 'dark');
		sessionStorage.setItem('buildos_onboarding_step2_state', 'legacy');
		clearOnboardingDrafts();
		expect(readOnboardingDraft('alice', 'capture')).toBeNull();
		expect(sessionStorage.getItem('buildos_onboarding_step2_state')).toBeNull();
		expect(localStorage.getItem('theme')).toBe('dark');
	});
});
