// apps/web/src/lib/services/admin/failed-jobs/failed-jobs.test.ts
import { describe, expect, it } from 'vitest';
import {
	ALWAYS_SAFE_TO_RERUN,
	NO_ERROR_MESSAGE,
	buildFailedJobGroups,
	displayErrorMessage,
	failedJobDaysFromParam,
	failedJobsAnswer,
	isTestAccountEmail,
	jobTypeLabel,
	localDateString,
	mostCommonError,
	parseRequeueJobIds,
	partitionRequeueRows,
	rerunBlockedLine,
	rerunDecision,
	type FailedJobRow
} from './failed-jobs';

// 16:00 UTC on 2026-10-22: noon on the 22nd in New York, 01:00 on the 23rd in Tokyo.
const NOW = new Date('2026-10-22T16:00:00.000Z');

let nextId = 0;
function row(overrides: Partial<FailedJobRow> = {}): FailedJobRow {
	nextId += 1;
	return {
		id: `00000000-0000-4000-8000-${String(nextId).padStart(12, '0')}`,
		job_type: 'embed_onto_entity',
		user_id: 'user-real',
		error_message: 'Embeddings request failed: 401',
		attempts: 3,
		created_at: '2026-10-22T13:00:00.000Z',
		updated_at: '2026-10-22T13:20:00.000Z',
		completed_at: '2026-10-22T13:20:00.000Z',
		brief_date: null,
		brief_timezone: null,
		...overrides
	};
}

const EMAILS = { 'user-real': 'dana@customer.com', 'user-test': 'harness@example.com' };

describe('rerunDecision', () => {
	it('allows every job type that is safe to run twice', () => {
		for (const jobType of [
			'embed_onto_entity',
			'extract_task_entities',
			'pick_project_emoji',
			'classify_chat_session',
			'capture_chat_checkpoint',
			'build_project_context_snapshot',
			'workspace_suggest',
			'generate_brief_audio'
		]) {
			expect(rerunDecision(row({ job_type: jobType }), NOW)).toEqual({ allowed: true });
		}
		expect(ALWAYS_SAFE_TO_RERUN.size).toBe(8);
	});

	it('refuses job types that could send twice or repeat a change', () => {
		for (const jobType of [
			'send_notification',
			'send_sms',
			'agentic_chat_turn',
			'agent_run',
			'buildos_project_loop',
			'consolidation_run',
			'sync_calendar',
			'user_data_export'
		]) {
			expect(rerunDecision(row({ job_type: jobType }), NOW)).toEqual({
				allowed: false,
				reason: 'could_repeat'
			});
		}
	});

	it('refuses a job type nobody listed', () => {
		expect(rerunDecision(row({ job_type: 'some_new_job' }), NOW)).toEqual({
			allowed: false,
			reason: 'could_repeat'
		});
		expect(rerunDecision(row({ job_type: '' }), NOW)).toEqual({
			allowed: false,
			reason: 'could_repeat'
		});
	});

	it("allows a daily brief only when it is today's in the job's timezone", () => {
		const brief = (brief_date: string | null, brief_timezone: string | null) =>
			rerunDecision(
				row({ job_type: 'generate_daily_brief', brief_date, brief_timezone }),
				NOW
			);

		expect(brief('2026-10-22', 'America/New_York')).toEqual({ allowed: true });
		expect(brief('2026-10-21', 'America/New_York')).toEqual({
			allowed: false,
			reason: 'old_brief'
		});
		// Tokyo is already on the 23rd, so the 22nd is yesterday's brief there.
		expect(brief('2026-10-22', 'Asia/Tokyo')).toEqual({ allowed: false, reason: 'old_brief' });
		expect(brief('2026-10-23', 'Asia/Tokyo')).toEqual({ allowed: true });
	});

	it('refuses a daily brief with a missing or malformed date', () => {
		for (const briefDate of [null, '', '10/22/2026', '2026-10-22T00:00:00Z']) {
			expect(
				rerunDecision(
					row({
						job_type: 'generate_daily_brief',
						brief_date: briefDate,
						brief_timezone: 'America/New_York'
					}),
					NOW
				)
			).toEqual({ allowed: false, reason: 'brief_date_unknown' });
		}
	});

	it('falls back to UTC when the timezone is missing or unknown', () => {
		expect(localDateString(NOW, null)).toBe('2026-10-22');
		expect(localDateString(NOW, 'Not/AZone')).toBe('2026-10-22');
		expect(localDateString(NOW, 'Asia/Tokyo')).toBe('2026-10-23');
		expect(
			rerunDecision(
				row({
					job_type: 'generate_daily_brief',
					brief_date: '2026-10-22',
					brief_timezone: null
				}),
				NOW
			)
		).toEqual({ allowed: true });
	});
});

describe('parseRequeueJobIds', () => {
	it('accepts UUIDs and drops repeats', () => {
		expect(
			parseRequeueJobIds([
				'0B9A7E0E-1111-4222-8333-944445555666',
				'0b9a7e0e-1111-4222-8333-944445555666',
				'7c9e6679-7425-40de-944b-e07fc1f90ae7'
			])
		).toEqual(['0b9a7e0e-1111-4222-8333-944445555666', '7c9e6679-7425-40de-944b-e07fc1f90ae7']);
	});

	it('rejects anything that is not a list of UUIDs', () => {
		expect(parseRequeueJobIds(undefined)).toBeNull();
		expect(parseRequeueJobIds('0b9a7e0e-1111-4222-8333-944445555666')).toBeNull();
		expect(parseRequeueJobIds(['not-an-id'])).toBeNull();
		expect(parseRequeueJobIds([42])).toBeNull();
		expect(parseRequeueJobIds([])).toEqual([]);
	});
});

describe('partitionRequeueRows', () => {
	it('keeps only the rows the allow-list permits', () => {
		const safe = row({ job_type: 'classify_chat_session' });
		const sends = row({ job_type: 'send_notification' });
		const todayBrief = row({
			job_type: 'generate_daily_brief',
			brief_date: '2026-10-22',
			brief_timezone: 'America/New_York'
		});
		const oldBrief = row({
			job_type: 'generate_daily_brief',
			brief_date: '2026-10-20',
			brief_timezone: 'America/New_York'
		});

		const result = partitionRequeueRows([safe, sends, todayBrief, oldBrief], NOW);

		expect(result.allowedIds).toEqual([safe.id, todayBrief.id]);
		expect(result.blocked).toEqual([
			{ id: sends.id, reason: 'could_repeat' },
			{ id: oldBrief.id, reason: 'old_brief' }
		]);
	});
});

describe('buildFailedJobGroups', () => {
	it('groups by job type with counts, first and last failure, and the common error', () => {
		const rows = [
			row({
				error_message: 'Embeddings request failed: 401',
				completed_at: '2026-10-22T13:20:00.000Z'
			}),
			row({
				error_message: 'Embeddings request failed: 401',
				completed_at: '2026-10-22T13:50:00.000Z'
			}),
			row({ error_message: 'fetch failed', completed_at: '2026-10-22T13:05:00.000Z' }),
			row({
				job_type: 'send_notification',
				error_message: 'SMTP down',
				completed_at: '2026-10-22T13:30:00.000Z'
			})
		];

		const summary = buildFailedJobGroups(rows, {
			emails: EMAILS,
			includeTestAccounts: false,
			now: NOW
		});

		expect(summary.total).toBe(4);
		expect(summary.rerunnable).toBe(3);
		expect(summary.hiddenTestJobs).toBe(0);
		expect(summary.groups.map((group) => group.jobType)).toEqual([
			'embed_onto_entity',
			'send_notification'
		]);

		const embeds = summary.groups[0]!;
		expect(embeds.label).toBe('Search index updates');
		expect(embeds.count).toBe(3);
		expect(embeds.firstFailedAt).toBe('2026-10-22T13:05:00.000Z');
		expect(embeds.lastFailedAt).toBe('2026-10-22T13:50:00.000Z');
		expect(embeds.topError).toEqual({ message: 'Embeddings request failed: 401', count: 2 });
		expect(embeds.jobs.map((job) => job.failedAt)).toEqual([
			'2026-10-22T13:50:00.000Z',
			'2026-10-22T13:20:00.000Z',
			'2026-10-22T13:05:00.000Z'
		]);
		expect(embeds.rerunnableIds).toHaveLength(3);
		expect(embeds.blockedMessage).toBeNull();
		expect(embeds.jobs[0]!.userEmail).toBe('dana@customer.com');

		const sends = summary.groups[1]!;
		expect(sends.rerunnableIds).toEqual([]);
		expect(sends.blockedMessage).toBe(rerunBlockedLine('could_repeat'));
		expect(sends.jobs[0]!.canRerun).toBe(false);
	});

	it('hides test-account jobs unless asked, and counts what it hid', () => {
		const rows = [
			row(),
			row({ user_id: 'user-test' }),
			row({ user_id: 'user-test', job_type: 'capture_chat_checkpoint' })
		];

		const hidden = buildFailedJobGroups(rows, {
			emails: EMAILS,
			includeTestAccounts: false,
			now: NOW
		});
		expect(hidden.total).toBe(1);
		expect(hidden.hiddenTestJobs).toBe(2);
		expect(hidden.groups.map((group) => group.jobType)).toEqual(['embed_onto_entity']);
		expect(hidden.groups[0]!.rerunnableIds).toEqual([rows[0]!.id]);

		const shown = buildFailedJobGroups(rows, {
			emails: EMAILS,
			includeTestAccounts: true,
			now: NOW
		});
		expect(shown.total).toBe(3);
		expect(shown.hiddenTestJobs).toBe(0);
		expect(shown.groups).toHaveLength(2);
		expect(shown.groups[0]!.jobs.filter((job) => job.isTestAccount)).toHaveLength(1);
	});

	it("offers only today's briefs in a daily brief group and says why for the rest", () => {
		const today = row({
			job_type: 'generate_daily_brief',
			brief_date: '2026-10-22',
			brief_timezone: 'America/New_York'
		});
		const yesterday = row({
			job_type: 'generate_daily_brief',
			brief_date: '2026-10-21',
			brief_timezone: 'America/New_York'
		});
		const older = row({
			job_type: 'generate_daily_brief',
			brief_date: '2026-10-19',
			brief_timezone: 'America/New_York'
		});

		const { groups } = buildFailedJobGroups([today, yesterday, older], {
			emails: EMAILS,
			includeTestAccounts: false,
			now: NOW
		});

		expect(groups).toHaveLength(1);
		expect(groups[0]!.rerunnableIds).toEqual([today.id]);
		expect(groups[0]!.blockedMessage).toBe(rerunBlockedLine('old_brief', 2, 3));
		expect(groups[0]!.blockedMessage).toContain('2 of these 3');
	});

	it('falls back to the last write time, then the creation time, for when a job failed', () => {
		const { groups } = buildFailedJobGroups(
			[
				row({ completed_at: null, updated_at: '2026-10-22T12:00:00+00:00' }),
				row({ completed_at: null, updated_at: null, created_at: '2026-10-22T11:00:00Z' })
			],
			{ emails: {}, includeTestAccounts: false, now: NOW }
		);
		expect(groups[0]!.lastFailedAt).toBe('2026-10-22T12:00:00.000Z');
		expect(groups[0]!.firstFailedAt).toBe('2026-10-22T11:00:00.000Z');
		expect(groups[0]!.jobs[0]!.userEmail).toBeNull();
	});
});

describe('mostCommonError', () => {
	it('counts messages that differ only by a number or an id as one error', () => {
		const result = mostCommonError([
			{ errorMessage: 'Timed out after 299980ms', failedAt: '2026-10-22T13:00:00.000Z' },
			{ errorMessage: 'Timed out after 300112ms', failedAt: '2026-10-22T13:10:00.000Z' },
			{ errorMessage: 'fetch failed', failedAt: '2026-10-22T13:20:00.000Z' }
		]);
		expect(result).toEqual({ message: 'Timed out after 300112ms', count: 2 });
	});

	it('breaks a tie with the most recent error, and handles an empty list', () => {
		expect(
			mostCommonError([
				{ errorMessage: 'A', failedAt: '2026-10-22T13:00:00.000Z' },
				{ errorMessage: 'B', failedAt: '2026-10-22T13:10:00.000Z' }
			])
		).toEqual({ message: 'B', count: 1 });
		expect(mostCommonError([])).toBeNull();
	});
});

describe('labels and copy', () => {
	it('names job types in plain words and falls back to the slug as words', () => {
		expect(jobTypeLabel('classify_chat_session')).toBe('Chat titles and summaries');
		expect(jobTypeLabel('generate_daily_brief')).toBe('Daily briefs');
		expect(jobTypeLabel('some_new_job')).toBe('Some new job');
		expect(jobTypeLabel('')).toBe('Unknown job');
	});

	it('recognises the test account by its email domain', () => {
		expect(isTestAccountEmail('harness@example.com')).toBe(true);
		expect(isTestAccountEmail('Harness@Example.COM ')).toBe(true);
		expect(isTestAccountEmail('dana@customer.com')).toBe(false);
		expect(isTestAccountEmail('dana@example.com.au')).toBe(false);
		expect(isTestAccountEmail(null)).toBe(false);
	});

	it('shortens very long error text and names a missing one', () => {
		expect(displayErrorMessage(null)).toBe(NO_ERROR_MESSAGE);
		expect(displayErrorMessage('   ')).toBe(NO_ERROR_MESSAGE);
		expect(displayErrorMessage('fetch failed')).toBe('fetch failed');
		const long = displayErrorMessage('x'.repeat(2000));
		expect(long.length).toBe(601);
		expect(long.endsWith('…')).toBe(true);
	});

	it('answers "did anything fail?" plainly', () => {
		expect(failedJobsAnswer({ total: 0, rerunnable: 0, hiddenTestJobs: 0 }, 1)).toEqual({
			failed: false,
			headline: 'Nothing failed in the last 24 hours.',
			detail: 'Every background job finished or is still retrying.'
		});
		expect(failedJobsAnswer({ total: 0, rerunnable: 0, hiddenTestJobs: 3 }, 7)).toEqual({
			failed: false,
			headline: 'Nothing failed in the last 7 days.',
			detail: '3 jobs from the test account are hidden.'
		});
		expect(failedJobsAnswer({ total: 5, rerunnable: 2, hiddenTestJobs: 1 }, 3)).toEqual({
			failed: true,
			headline: '5 jobs failed in the last 3 days.',
			detail: '2 of them can be run again. 1 job from the test account is hidden.'
		});
		expect(failedJobsAnswer({ total: 1, rerunnable: 1, hiddenTestJobs: 0 }, 1).detail).toBe(
			'It can be run again.'
		);
		expect(failedJobsAnswer({ total: 4, rerunnable: 0, hiddenTestJobs: 0 }, 1).detail).toBe(
			'None of them can be run again safely.'
		);
	});

	it('reads the window from the URL and ignores anything else', () => {
		expect(failedJobDaysFromParam(null)).toBe(1);
		expect(failedJobDaysFromParam('3')).toBe(3);
		expect(failedJobDaysFromParam('7')).toBe(7);
		expect(failedJobDaysFromParam('14')).toBe(1);
		expect(failedJobDaysFromParam('abc')).toBe(1);
	});
});
