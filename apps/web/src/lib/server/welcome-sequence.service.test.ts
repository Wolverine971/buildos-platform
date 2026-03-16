// apps/web/src/lib/server/welcome-sequence.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmailMock = vi.fn();

vi.mock('$lib/services/email-service', () => ({
	EmailService: class MockEmailService {
		sendEmail = sendEmailMock;
	}
}));

interface MockState {
	users: Record<string, any>;
	welcomeRows: Record<string, any>;
	updates: Array<{ userId: string; updates: Record<string, any> }>;
	failRpc: boolean;
	failFullUserLoad?: boolean;
}

class QueryBuilderMock {
	private action: 'select' | 'insert' | 'update' | null = null;
	private selectedColumns: string | undefined;
	private insertPayload: Record<string, any> | null = null;
	private updatePayload: Record<string, any> | null = null;
	private filters = new Map<string, any>();

	constructor(
		private readonly table: string,
		private readonly state: MockState
	) {}

	select(columns?: string) {
		if (!this.action) {
			this.action = 'select';
		}
		this.selectedColumns = columns;
		return this;
	}

	insert(payload: Record<string, any>) {
		this.action = 'insert';
		this.insertPayload = payload;
		return this;
	}

	update(payload: Record<string, any>) {
		this.action = 'update';
		this.updatePayload = payload;
		return this;
	}

	eq(field: string, value: any) {
		this.filters.set(field, value);
		if (this.action === 'update') {
			return Promise.resolve(this.executeUpdate());
		}
		return this;
	}

	order() {
		return this;
	}

	limit() {
		return Promise.resolve(this.executeSelectMany());
	}

	contains() {
		return Promise.resolve({ data: [], error: null });
	}

	maybeSingle() {
		return Promise.resolve(this.executeMaybeSingle());
	}

	single() {
		return Promise.resolve(this.executeSingle());
	}

	private executeMaybeSingle() {
		if (this.table === 'welcome_email_sequences') {
			const userId = this.filters.get('user_id');
			return {
				data: userId ? (this.state.welcomeRows[userId] ?? null) : null,
				error: null
			};
		}

		if (this.table === 'users') {
			const userId = this.filters.get('id');
			const user = userId ? (this.state.users[userId] ?? null) : null;
			if (!user) {
				return { data: null, error: null };
			}

			if (this.selectedColumns === 'id, created_at') {
				return {
					data: {
						id: user.id,
						created_at: user.created_at
					},
					error: null
				};
			}

			if (this.state.failFullUserLoad) {
				return {
					data: null,
					error: { message: 'user load failed' }
				};
			}

			return { data: user, error: null };
		}

		return { data: null, error: null };
	}

	private executeSingle() {
		if (
			this.table === 'welcome_email_sequences' &&
			this.action === 'insert' &&
			this.insertPayload
		) {
			const row = {
				user_id: this.insertPayload.user_id,
				sequence_version: this.insertPayload.sequence_version,
				trigger_source: this.insertPayload.trigger_source,
				signup_method: this.insertPayload.signup_method,
				started_at: this.insertPayload.started_at,
				status: 'active',
				email_1_sent_at: null,
				email_1_skipped_at: null,
				email_2_sent_at: null,
				email_2_skipped_at: null,
				email_3_sent_at: null,
				email_3_skipped_at: null,
				email_4_sent_at: null,
				email_4_skipped_at: null,
				email_5_sent_at: null,
				email_5_skipped_at: null,
				last_evaluated_at: null,
				completed_at: null,
				created_at: this.insertPayload.started_at,
				updated_at: this.insertPayload.started_at
			};
			this.state.welcomeRows[row.user_id] = row;
			return { data: row, error: null };
		}

		return { data: null, error: null };
	}

	private executeSelectMany() {
		if (this.table === 'welcome_email_sequences') {
			const status = this.filters.get('status');
			const rows = Object.values(this.state.welcomeRows).filter((row: any) =>
				status ? row.status === status : true
			);
			return { data: rows, error: null };
		}

		return { data: [], error: null };
	}

	private executeUpdate() {
		if (this.table === 'welcome_email_sequences' && this.updatePayload) {
			const userId = this.filters.get('user_id');
			if (userId && this.state.welcomeRows[userId]) {
				this.state.welcomeRows[userId] = {
					...this.state.welcomeRows[userId],
					...this.updatePayload
				};
				this.state.updates.push({
					userId,
					updates: this.updatePayload
				});
			}
		}

		return { error: null };
	}
}

function createSequenceRow(userId: string) {
	return {
		user_id: userId,
		sequence_version: '2026-03-16',
		trigger_source: 'account_created',
		signup_method: 'email',
		started_at: '2026-03-01T10:00:00.000Z',
		status: 'active',
		email_1_sent_at: null,
		email_1_skipped_at: null,
		email_2_sent_at: null,
		email_2_skipped_at: null,
		email_3_sent_at: null,
		email_3_skipped_at: null,
		email_4_sent_at: null,
		email_4_skipped_at: null,
		email_5_sent_at: null,
		email_5_skipped_at: null,
		last_evaluated_at: null,
		completed_at: null,
		created_at: '2026-03-01T10:00:00.000Z',
		updated_at: '2026-03-01T10:00:00.000Z'
	};
}

function createMockSupabase(state: MockState) {
	return {
		from: (table: string) => new QueryBuilderMock(table, state),
		rpc: vi.fn(async (fn: string) => {
			if (fn === 'ensure_actor_for_user') {
				return state.failRpc
					? { data: null, error: { message: 'rpc unavailable' } }
					: { data: 'actor-1', error: null };
			}

			return { data: null, error: null };
		})
	};
}

describe('WelcomeSequenceService failure recovery', () => {
	beforeEach(() => {
		sendEmailMock.mockReset();
		sendEmailMock.mockResolvedValue({ success: true, messageId: 'msg-1' });
	});

	it('creates a sequence row before full state loading so cron can recover later', async () => {
		const state: MockState = {
			users: {
				'user-1': {
					id: 'user-1',
					email: 'user@example.com',
					name: 'Alex Builder',
					created_at: '2026-03-01T10:00:00.000Z',
					last_visit: null,
					onboarding_completed_at: null,
					onboarding_intent: 'plan',
					timezone: 'UTC'
				}
			},
			welcomeRows: {},
			updates: [],
			failRpc: false,
			failFullUserLoad: true
		};

		const { WelcomeSequenceService } = await import('./welcome-sequence.service');
		const service = new WelcomeSequenceService(createMockSupabase(state) as any);

		await expect(
			service.startSequenceForUser({
				userId: 'user-1',
				signupMethod: 'email'
			})
		).rejects.toThrow('Failed to load welcome user');

		expect(state.welcomeRows['user-1']).toBeTruthy();
		expect(state.updates).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					userId: 'user-1',
					updates: expect.objectContaining({
						last_evaluated_at: expect.any(String)
					})
				})
			])
		);
		expect(sendEmailMock).not.toHaveBeenCalled();
	});

	it('records last_evaluated_at when cron processing hits a per-user failure', async () => {
		const state: MockState = {
			users: {
				'user-1': {
					id: 'user-1',
					email: 'user@example.com',
					name: 'Alex Builder',
					created_at: '2026-03-01T10:00:00.000Z',
					last_visit: null,
					onboarding_completed_at: null,
					onboarding_intent: 'plan',
					timezone: 'UTC'
				}
			},
			welcomeRows: {
				'user-1': createSequenceRow('user-1')
			},
			updates: [],
			failRpc: true
		};

		const { WelcomeSequenceService } = await import('./welcome-sequence.service');
		const service = new WelcomeSequenceService(createMockSupabase(state) as any);
		const result = await service.processDueSequences({
			now: new Date('2026-03-01T11:00:00.000Z')
		});

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.userId).toBe('user-1');
		expect(state.updates).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					userId: 'user-1',
					updates: expect.objectContaining({
						last_evaluated_at: '2026-03-01T11:00:00.000Z'
					})
				})
			])
		);
	});
});
