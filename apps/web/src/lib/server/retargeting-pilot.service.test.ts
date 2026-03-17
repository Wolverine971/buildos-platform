// apps/web/src/lib/server/retargeting-pilot.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
	RetargetingPilotMemberRow,
	RetargetingPilotMetricRow
} from './retargeting-pilot.logic';

const sendEmailMock = vi.fn();

vi.mock('$lib/services/email-service', () => ({
	EmailService: class MockEmailService {
		sendEmail = sendEmailMock;
	}
}));

interface MockState {
	frozenMembers: RetargetingPilotMemberRow[];
	members: Record<string, RetargetingPilotMemberRow>;
	metricRows: RetargetingPilotMetricRow[];
}

class MembersQueryBuilderMock {
	private action: 'select' | 'update' | null = null;
	private filters = new Map<string, unknown>();
	private updatePayload: Record<string, unknown> | null = null;
	private returnSingle = false;
	private includeSelectedRow = false;

	constructor(private readonly state: MockState) {}

	select() {
		this.includeSelectedRow = true;
		if (!this.action) {
			this.action = 'select';
		}
		return this;
	}

	update(payload: Record<string, unknown>) {
		this.action = 'update';
		this.updatePayload = payload;
		return this;
	}

	eq(field: string, value: unknown) {
		this.filters.set(field, value);
		return this;
	}

	order() {
		return Promise.resolve(this.executeMany());
	}

	single() {
		this.returnSingle = true;
		return Promise.resolve(this.executeSingle());
	}

	then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
		return Promise.resolve(this.executeMany()).then(resolve, reject);
	}

	private applyFilters(rows: RetargetingPilotMemberRow[]) {
		return rows.filter((row) =>
			Array.from(this.filters.entries()).every(
				([field, value]) => row[field as keyof RetargetingPilotMemberRow] === value
			)
		);
	}

	private executeMany() {
		if (this.action === 'update' && this.updatePayload) {
			const rows = this.applyFilters(Object.values(this.state.members));
			for (const row of rows) {
				this.state.members[row.id] = {
					...row,
					...(this.updatePayload as Partial<RetargetingPilotMemberRow>)
				};
			}

			if (this.includeSelectedRow) {
				return {
					data: this.returnSingle
						? (rows.map((row) => this.state.members[row.id])[0] ?? null)
						: rows,
					error: null
				};
			}

			return { data: null, error: null };
		}

		const rows = this.applyFilters(Object.values(this.state.members)).sort(
			(left, right) => left.prioritized_rank - right.prioritized_rank
		);

		return {
			data: this.returnSingle ? (rows[0] ?? null) : rows,
			error: null
		};
	}

	private executeSingle() {
		const result = this.executeMany();
		if (Array.isArray(result.data)) {
			return {
				data: result.data[0] ?? null,
				error: null
			};
		}

		return result;
	}
}

function createMember(
	overrides: Partial<RetargetingPilotMemberRow> = {}
): RetargetingPilotMemberRow {
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
		...overrides
	};
}

function createMetricRow(
	overrides: Partial<RetargetingPilotMetricRow> = {}
): RetargetingPilotMetricRow {
	return {
		...createMember(),
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

function createMockSupabase(state: MockState) {
	return {
		rpc: vi.fn(async (fn: string) => {
			if (fn === 'freeze_retargeting_founder_pilot_cohort') {
				return { data: state.frozenMembers, error: null };
			}

			if (fn === 'get_retargeting_founder_pilot_member_metrics') {
				return { data: state.metricRows, error: null };
			}

			return { data: null, error: null };
		}),
		from: vi.fn((table: string) => {
			if (table === 'retargeting_founder_pilot_members') {
				return new MembersQueryBuilderMock(state);
			}

			throw new Error(`Unexpected table ${table}`);
		})
	};
}

describe('RetargetingPilotService', () => {
	beforeEach(() => {
		sendEmailMock.mockReset();
		sendEmailMock.mockResolvedValue({ success: true, messageId: 'msg-1' });
	});

	it('freezes a cohort and summarizes batches', async () => {
		const frozenMembers = [
			createMember({
				id: 'member-1',
				batch_id: 'batch_01'
			}),
			createMember({
				id: 'member-2',
				prioritized_rank: 2,
				batch_id: null,
				holdout: true
			})
		];
		const state: MockState = {
			frozenMembers,
			members: Object.fromEntries(frozenMembers.map((member) => [member.id, member])),
			metricRows: []
		};

		const { RetargetingPilotService } = await import('./retargeting-pilot.service');
		const service = new RetargetingPilotService(createMockSupabase(state) as any);
		const result = await service.freezeCohort({
			cohortId: 'founder-pilot-2026-03'
		});

		expect(result.counts).toEqual({
			total: 2,
			holdout: 1,
			sendable: 1
		});
		expect(result.batches).toEqual(['batch_01']);
	});

	it('returns dry-run candidates without sending', async () => {
		const metricRows = [
			createMetricRow({
				id: 'member-1',
				touch_1_sent_at: '2024-03-20T10:00:00.000Z'
			}),
			createMetricRow({
				id: 'member-2',
				touch_1_sent_at: '2024-03-20T10:00:00.000Z',
				first_post_send_activity_at: '2024-03-21T10:00:00.000Z'
			})
		];
		const state: MockState = {
			frozenMembers: [],
			members: {},
			metricRows
		};

		const { RetargetingPilotService } = await import('./retargeting-pilot.service');
		const service = new RetargetingPilotService(createMockSupabase(state) as any);
		const result = await service.sendStep({
			cohortId: 'founder-pilot-2026-03',
			step: 'touch_2',
			sentByUserId: 'admin-1',
			batchId: 'batch_01',
			demoUrl: 'https://example.com/demo',
			dryRun: true
		});

		expect(result.counts).toEqual({
			candidates: 1,
			sent: 0,
			failed: 0
		});
		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it('requires a batch id for retargeting sends', async () => {
		const state: MockState = {
			frozenMembers: [],
			members: {},
			metricRows: []
		};

		const { RetargetingPilotService } = await import('./retargeting-pilot.service');
		const service = new RetargetingPilotService(createMockSupabase(state) as any);

		await expect(
			service.sendStep({
				cohortId: 'founder-pilot-2026-03',
				step: 'touch_2',
				sentByUserId: 'admin-1',
				batchId: '   ',
				demoUrl: 'https://example.com/demo'
			})
		).rejects.toThrow('batch_id is required for retargeting sends');
	});

	it('sends Touch 1 through EmailService and updates member state', async () => {
		const member = createMember();
		const metricRows = [createMetricRow()];
		const state: MockState = {
			frozenMembers: [],
			members: {
				[member.id]: member
			},
			metricRows
		};

		const { RetargetingPilotService } = await import('./retargeting-pilot.service');
		const service = new RetargetingPilotService(createMockSupabase(state) as any);
		const result = await service.sendStep({
			cohortId: 'founder-pilot-2026-03',
			step: 'touch_1',
			sentByUserId: 'admin-1',
			batchId: 'batch_01'
		});

		expect(result.counts.sent).toBe(1);
		expect(sendEmailMock).toHaveBeenCalledTimes(1);
		expect(sendEmailMock).toHaveBeenCalledWith(
			expect.objectContaining({
				to: 'alex@example.com',
				userId: 'user-1',
				createdBy: 'admin-1',
				metadata: expect.objectContaining({
					campaign_id: 'buildos-reactivation-founder-pilot-v1',
					cohort_id: 'founder-pilot-2026-03',
					batch_id: 'batch_01',
					step: '1',
					send_type: 'manual_founder_led'
				})
			})
		);
		expect(state.members['member-1'].touch_1_sent_at).toMatch(/2026|20\d{2}/);
	});

	it('rejects empty member updates', async () => {
		const member = createMember();
		const state: MockState = {
			frozenMembers: [],
			members: {
				[member.id]: member
			},
			metricRows: []
		};

		const { RetargetingPilotService } = await import('./retargeting-pilot.service');
		const service = new RetargetingPilotService(createMockSupabase(state) as any);

		await expect(service.updateMember(member.id, {})).rejects.toThrow(
			'At least one retargeting member field must be updated'
		);
	});
});
