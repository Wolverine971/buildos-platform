// apps/worker/tests/briefDateGuard.test.ts
import { describe, expect, it } from 'vitest';

import {
	getStaleBriefJobDecision,
	resolveScheduledBriefDate
} from '../src/workers/brief/briefDateGuard';

describe('Brief date guard', () => {
	it('skips missed automatic brief jobs from earlier local dates', () => {
		const decision = getStaleBriefJobDecision({
			briefDate: '2026-04-11',
			timezone: 'America/New_York',
			now: new Date('2026-04-12T14:00:00Z')
		});

		expect(decision.shouldSkip).toBe(true);
		expect(decision.currentBriefDate).toBe('2026-04-12');
		expect(decision.reason).toContain('Brief date 2026-04-11');
	});

	it('allows the current local day', () => {
		const decision = getStaleBriefJobDecision({
			briefDate: '2026-04-12',
			timezone: 'America/New_York',
			now: new Date('2026-04-12T14:00:00Z')
		});

		expect(decision.shouldSkip).toBe(false);
		expect(decision.currentBriefDate).toBe('2026-04-12');
	});

	it('uses the user timezone instead of the UTC date', () => {
		const decision = getStaleBriefJobDecision({
			briefDate: '2026-04-11',
			timezone: 'America/Los_Angeles',
			now: new Date('2026-04-12T03:30:00Z')
		});

		expect(decision.shouldSkip).toBe(false);
		expect(decision.currentBriefDate).toBe('2026-04-11');
	});

	it('allows explicit regeneration of an older requested date', () => {
		const decision = getStaleBriefJobDecision({
			briefDate: '2026-04-11',
			timezone: 'America/New_York',
			now: new Date('2026-04-12T14:00:00Z'),
			options: {
				forceRegenerate: true
			}
		});

		expect(decision.shouldSkip).toBe(false);
	});

	it('resolves scheduled brief dates from the notification time, not the generation buffer', () => {
		const briefDate = resolveScheduledBriefDate({
			scheduledFor: new Date('2026-04-12T03:59:00Z'),
			notificationScheduledFor: new Date('2026-04-12T04:01:00Z'),
			timezone: 'America/New_York'
		});

		expect(briefDate).toBe('2026-04-12');
	});

	it('preserves explicitly requested brief dates', () => {
		const briefDate = resolveScheduledBriefDate({
			scheduledFor: new Date('2026-04-12T03:59:00Z'),
			notificationScheduledFor: new Date('2026-04-12T04:01:00Z'),
			timezone: 'America/New_York',
			requestedBriefDate: '2026-04-10'
		});

		expect(briefDate).toBe('2026-04-10');
	});
});
