// apps/web/src/lib/server/retargeting-pilot.logic.test.ts
import { describe, expect, it } from 'vitest';

import {
	buildRetargetingEmailContent,
	listRetargetingStepCandidates,
	summarizeRetargetingOutcomes,
	type RetargetingPilotMetricRow
} from './retargeting-pilot.logic';

function createMetricRow(
	overrides: Partial<RetargetingPilotMetricRow> = {}
): RetargetingPilotMetricRow {
	return {
		id: 'member-1',
		campaign_id: 'buildos-reactivation-founder-pilot-v1',
		cohort_id: 'founder-pilot-2026-03',
		user_id: 'user-1',
		email: 'alex@example.com',
		name: 'Alex Builder',
		cohort_frozen_at: '2026-03-20T10:00:00.000Z',
		cohort_size: 25,
		prioritized_rank: 1,
		pilot_segment: 'tried_briefly_then_disappeared',
		holdout: false,
		batch_id: 'batch_01',
		variant: 'A',
		conversion_window_days: 14,
		first_activity_at: null,
		last_meaningful_activity_at: null,
		lifetime_activity_count: 0,
		first_14d_activity_count: 0,
		last_outbound_email_at: null,
		last_seen_at: null,
		touch_1_sent_at: null,
		touch_2_sent_at: null,
		touch_3_sent_at: null,
		reply_status: 'none',
		reply_recorded_at: null,
		manual_stop: false,
		manual_stop_at: null,
		manual_stop_reason: null,
		notes: null,
		created_at: '2026-03-20T10:00:00.000Z',
		updated_at: '2026-03-20T10:00:00.000Z',
		first_send_at: null,
		last_send_at: null,
		touch_1_opened: false,
		touch_1_clicked: false,
		any_open: false,
		any_click: false,
		anchor_at: '2026-03-20T10:00:00.000Z',
		first_post_send_activity_at: null,
		first_post_send_action_at: null,
		return_session_at: null,
		first_action_at: null,
		active_days_30d: 0,
		attributed_step: null,
		attribution_type: 'organic',
		...overrides
	};
}

describe('retargeting pilot logic', () => {
	it('builds Touch 1 with tracked welcome-back params', () => {
		const content = buildRetargetingEmailContent({
			baseUrl: 'https://build-os.com',
			campaignId: 'buildos-reactivation-founder-pilot-v1',
			cohortId: 'founder-pilot-2026-03',
			batchId: 'batch_01',
			member: {
				name: 'Alex Builder',
				variant: 'A'
			},
			step: 'touch_1'
		});

		expect(content.subject).toBe('You tried BuildOS early. It is different now.');
		expect(content.primaryCtaUrl).toContain('/welcome-back?');
		expect(content.primaryCtaUrl).toContain('utm_source=retargeting');
		expect(content.primaryCtaUrl).toContain(
			'campaign_id=buildos-reactivation-founder-pilot-v1'
		);
		expect(content.primaryCtaUrl).toContain('cohort_id=founder-pilot-2026-03');
		expect(content.primaryCtaUrl).toContain('batch_id=batch_01');
		expect(content.body).toContain('Use something you are actually working on');
		expect(content.html).toContain('try one real brain dump here');
	});

	it('requires a demo URL for Touch 2', () => {
		expect(() =>
			buildRetargetingEmailContent({
				baseUrl: 'https://build-os.com',
				campaignId: 'buildos-reactivation-founder-pilot-v1',
				cohortId: 'founder-pilot-2026-03',
				batchId: 'batch_01',
				member: {
					name: 'Alex Builder',
					variant: 'A'
				},
				step: 'touch_2'
			})
		).toThrow('Touch 2 requires a demo URL');
	});

	it('filters Touch 2 candidates to non-returners after 72 hours', () => {
		const candidates = listRetargetingStepCandidates(
			[
				createMetricRow({
					id: 'candidate-a',
					prioritized_rank: 2,
					touch_1_sent_at: '2026-03-20T10:00:00.000Z',
					touch_1_clicked: true,
					touch_1_opened: true
				}),
				createMetricRow({
					id: 'candidate-b',
					prioritized_rank: 1,
					touch_1_sent_at: '2026-03-20T10:00:00.000Z',
					touch_1_opened: true
				}),
				createMetricRow({
					id: 'returned',
					touch_1_sent_at: '2026-03-20T10:00:00.000Z',
					first_post_send_activity_at: '2026-03-21T09:00:00.000Z'
				}),
				createMetricRow({
					id: 'too-soon',
					touch_1_sent_at: '2026-03-22T12:00:00.000Z'
				})
			],
			{
				step: 'touch_2',
				batchId: 'batch_01',
				now: new Date('2026-03-24T12:30:00.000Z')
			}
		);

		expect(candidates.map((candidate) => candidate.id)).toEqual(['candidate-a', 'candidate-b']);
	});

	it('filters Touch 3 candidates to engaged non-converters', () => {
		const candidates = listRetargetingStepCandidates(
			[
				createMetricRow({
					id: 'engaged',
					touch_1_sent_at: '2026-03-20T10:00:00.000Z',
					touch_2_sent_at: '2026-03-23T10:00:00.000Z',
					any_open: true,
					any_click: true,
					last_send_at: '2026-03-23T10:00:00.000Z'
				}),
				createMetricRow({
					id: 'converted',
					touch_1_sent_at: '2026-03-20T10:00:00.000Z',
					any_open: true,
					first_post_send_action_at: '2026-03-24T10:00:00.000Z'
				}),
				createMetricRow({
					id: 'not-engaged',
					touch_1_sent_at: '2026-03-20T10:00:00.000Z'
				})
			],
			{
				step: 'touch_3',
				batchId: 'batch_01',
				now: new Date('2026-03-28T11:00:00.000Z')
			}
		);

		expect(candidates.map((candidate) => candidate.id)).toEqual(['engaged']);
	});

	it('summarizes send-group versus holdout outcomes', () => {
		const summary = summarizeRetargetingOutcomes([
			createMetricRow({
				id: 'send-1',
				return_session_at: '2026-03-22T10:00:00.000Z',
				first_action_at: '2026-03-23T10:00:00.000Z',
				active_days_30d: 3
			}),
			createMetricRow({
				id: 'send-2',
				active_days_30d: 1
			}),
			createMetricRow({
				id: 'holdout-1',
				holdout: true,
				return_session_at: '2026-03-25T10:00:00.000Z',
				active_days_30d: 2
			})
		]);

		expect(summary).toEqual([
			{
				holdout: false,
				users: 2,
				returnSessionUsers: 1,
				firstActionUsers: 1,
				multiDayUsageUsers: 1
			},
			{
				holdout: true,
				users: 1,
				returnSessionUsers: 1,
				firstActionUsers: 0,
				multiDayUsageUsers: 1
			}
		]);
	});
});
