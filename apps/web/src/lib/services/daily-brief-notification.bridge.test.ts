// apps/web/src/lib/services/daily-brief-notification.bridge.test.ts
// @vitest-environment jsdom

import { requireTestValue } from '$lib/test-helpers/require-test-value';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { goto } from '$app/navigation';
import { notificationStore } from '$lib/stores/notification.store';
import { briefNotificationStatus } from '$lib/services/realtimeBrief.service';
import { getCurrentDateInTimezone } from '$lib/utils/timezone';
import type { DailyBriefNotification } from '$lib/types/notification.types';
import {
	DAILY_BRIEF_CANCELLED_AUTO_CLOSE_MS,
	DAILY_BRIEF_READY_AUTO_CLOSE_MS,
	destroyDailyBriefNotificationBridge,
	formatBriefDateLabel,
	initDailyBriefNotificationBridge
} from './daily-brief-notification.bridge';

const TODAY = getCurrentDateInTimezone('UTC');

function getCards(): DailyBriefNotification[] {
	return Array.from(get(notificationStore).notifications.values()).filter(
		(notification): notification is DailyBriefNotification =>
			notification.type === 'daily-brief'
	);
}

function onlyCard(): DailyBriefNotification {
	const cards = getCards();
	expect(cards).toHaveLength(1);
	return requireTestValue(cards[0]);
}

function generating(progress: number, jobId = 'job-1', message = 'Generating project briefs...') {
	briefNotificationStatus.set({
		isGenerating: true,
		status: 'processing',
		briefDate: TODAY,
		jobId,
		startedAt: new Date().toISOString(),
		progress,
		message,
		timezone: 'UTC'
	});
}

function completed(jobId: string | undefined = 'job-1', briefDate = TODAY) {
	briefNotificationStatus.set({
		isGenerating: false,
		status: 'completed',
		briefDate,
		jobId,
		timezone: 'UTC'
	});
}

describe('daily-brief-notification.bridge', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		briefNotificationStatus.set({ isGenerating: false });
		initDailyBriefNotificationBridge();
	});

	afterEach(() => {
		destroyDailyBriefNotificationBridge();
		notificationStore.clear();
		briefNotificationStatus.set({ isGenerating: false });
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	it('shows one processing card with the step message and progress, dated Today', () => {
		generating(40);

		const card = onlyCard();
		expect(card.status).toBe('processing');
		expect(card.data.message).toBe('Generating project briefs...');
		expect(card.data.dateLabel).toBe('Today');
		expect(card.data.jobId).toBe('job-1');
		expect(card.progress).toEqual({
			type: 'percentage',
			percentage: 40,
			message: 'Generating project briefs...'
		});
	});

	it('progress ticks update the same card instead of stacking', () => {
		generating(0, 'job-1', 'Starting brief generation...');
		expect(onlyCard().progress.type).toBe('indeterminate');

		generating(70, 'job-1', 'Writing your summary...');
		const card = onlyCard();
		expect(card.progress).toMatchObject({ type: 'percentage', percentage: 70 });
		expect(card.data.message).toBe('Writing your summary...');
	});

	it('completion flips the card to ready and auto-closes it', () => {
		generating(40);
		completed();

		const card = onlyCard();
		expect(card.status).toBe('success');
		expect(card.progress).toMatchObject({ message: 'Tap to read it' });

		vi.advanceTimersByTime(DAILY_BRIEF_READY_AUTO_CLOSE_MS - 1);
		expect(getCards()).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(getCards()).toHaveLength(0);
	});

	it('opening a ready card navigates to that brief and spends the card', () => {
		generating(40);
		completed();

		onlyCard().actions.view?.();

		expect(goto).toHaveBeenCalledWith(`/briefs?date=${encodeURIComponent(TODAY)}&view=single`);
		expect(getCards()).toHaveLength(0);
	});

	it('opening a processing card navigates but keeps the card', () => {
		generating(40);

		onlyCard().actions.view?.();

		expect(goto).toHaveBeenCalledTimes(1);
		expect(getCards()).toHaveLength(1);
	});

	it('a hidden processing card stays hidden for that job, but completion still shows', () => {
		generating(40);
		onlyCard().actions.dismiss?.();
		expect(getCards()).toHaveLength(0);

		generating(60);
		expect(getCards()).toHaveLength(0);

		completed();
		expect(onlyCard().status).toBe('success');
	});

	it('a new job shows again after an earlier one was hidden', () => {
		generating(40, 'job-1');
		onlyCard().actions.dismiss?.();

		generating(10, 'job-2');
		expect(onlyCard().data.jobId).toBe('job-2');
	});

	it('failure flips the card to error with the message and keeps it', () => {
		generating(40);
		briefNotificationStatus.set({
			isGenerating: false,
			status: 'failed',
			briefDate: TODAY,
			jobId: 'job-1',
			error: 'LLM timed out',
			timezone: 'UTC'
		});

		const card = onlyCard();
		expect(card.status).toBe('error');
		expect(card.data.error).toBe('LLM timed out');

		vi.advanceTimersByTime(10 * 60 * 1000);
		expect(getCards()).toHaveLength(1);
	});

	it('a bare clear removes a processing card but leaves a ready card', () => {
		generating(40);
		briefNotificationStatus.set({ isGenerating: false });
		expect(getCards()).toHaveLength(0);

		generating(90);
		completed();
		briefNotificationStatus.set({ isGenerating: false });
		expect(onlyCard().status).toBe('success');
	});

	it('a broadcast completion without a job id reuses the job card', () => {
		generating(40, 'job-1');
		completed(undefined, TODAY);

		const card = onlyCard();
		expect(card.status).toBe('success');
		expect(card.data.jobId).toBe('job-1');
	});

	it('a completion echo after auto-close does not resurrect the card', () => {
		generating(40);
		completed();
		vi.advanceTimersByTime(DAILY_BRIEF_READY_AUTO_CLOSE_MS);
		expect(getCards()).toHaveLength(0);

		completed(undefined, TODAY);
		expect(getCards()).toHaveLength(0);
	});

	it('a later regeneration still announces completion after an earlier one', () => {
		generating(40, 'job-1');
		completed('job-1');
		vi.advanceTimersByTime(DAILY_BRIEF_READY_AUTO_CLOSE_MS);

		generating(20, 'job-2');
		completed('job-2');
		expect(onlyCard().status).toBe('success');
	});

	it('cancellation flips the watched card and auto-closes it', () => {
		generating(40, 'job-1');
		briefNotificationStatus.set({
			isGenerating: false,
			status: 'cancelled',
			briefDate: TODAY,
			jobId: 'job-1',
			message: 'Brief generation was cancelled',
			timezone: 'UTC'
		});

		expect(onlyCard().status).toBe('cancelled');
		vi.advanceTimersByTime(DAILY_BRIEF_CANCELLED_AUTO_CLOSE_MS);
		expect(getCards()).toHaveLength(0);
	});

	it('a cancellation nobody was watching stays silent', () => {
		briefNotificationStatus.set({
			isGenerating: false,
			status: 'cancelled',
			briefDate: TODAY,
			jobId: 'job-9',
			timezone: 'UTC'
		});
		expect(getCards()).toHaveLength(0);
	});

	it('init drops daily-brief cards persisted from a previous page load', () => {
		destroyDailyBriefNotificationBridge();
		notificationStore.add({
			type: 'daily-brief',
			status: 'processing',
			isMinimized: true,
			isPersistent: true,
			autoCloseMs: null,
			data: {
				briefDate: TODAY,
				dateLabel: 'Today',
				jobId: 'stale',
				message: null,
				error: null
			},
			progress: { type: 'indeterminate', message: 'Starting…' },
			actions: {}
		});
		expect(getCards()).toHaveLength(1);

		initDailyBriefNotificationBridge();
		expect(getCards()).toHaveLength(0);
	});

	it('destroy stops listening to the status store', () => {
		destroyDailyBriefNotificationBridge();
		generating(40);
		expect(getCards()).toHaveLength(0);
	});
});

describe('formatBriefDateLabel', () => {
	it('labels today in the given timezone and short-dates anything else', () => {
		expect(formatBriefDateLabel(TODAY, 'UTC')).toBe('Today');
		expect(formatBriefDateLabel('2026-01-05', 'UTC')).toBe('Jan 5');
		expect(formatBriefDateLabel(null, 'UTC')).toBe('Today');
		expect(formatBriefDateLabel('not-a-date', 'UTC')).toBe('not-a-date');
	});
});
