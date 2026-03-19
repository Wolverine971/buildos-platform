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
	legacySequenceSchema?: boolean;
	actorId?: string;
	projectsByActorId?: Record<string, Array<Record<string, any>>>;
	briefPreferencesByUserId?: Record<string, Record<string, any>>;
	notificationPreferencesByUserId?: Record<string, Record<string, any>>;
	smsPreferencesByUserId?: Record<string, Record<string, any>>;
	calendarTokensByUserId?: Record<string, number>;
	emailLogsByUserId?: Record<string, Array<Record<string, any>>>;
}

class QueryBuilderMock implements PromiseLike<any> {
	private action: 'select' | 'insert' | 'update' | null = null;
	private resultMode: 'many' | 'maybeSingle' | 'single' = 'many';
	private selectedColumns: string | undefined;
	private selectOptions: Record<string, any> | undefined;
	private insertPayload: Record<string, any> | null = null;
	private updatePayload: Record<string, any> | null = null;
	private filters: Array<{ operator: 'eq' | 'is'; field: string; value: any }> = [];
	private orExpression: string | null = null;
	private containsFilter: { field: string; value: Record<string, any> } | null = null;
	private limitValue: number | null = null;

	constructor(
		private readonly table: string,
		private readonly state: MockState
	) {}

	select(columns?: string, options?: Record<string, any>) {
		if (!this.action) {
			this.action = 'select';
		}
		this.selectedColumns = columns;
		this.selectOptions = options;
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
		this.filters.push({ operator: 'eq', field, value });
		return this;
	}

	is(field: string, value: any) {
		this.filters.push({ operator: 'is', field, value });
		return this;
	}

	or(expression: string) {
		this.orExpression = expression;
		return this;
	}

	order() {
		return this;
	}

	limit(value: number) {
		this.limitValue = value;
		return this;
	}

	contains(field: string, value: Record<string, any>) {
		this.containsFilter = { field, value };
		return this;
	}

	maybeSingle() {
		this.resultMode = 'maybeSingle';
		return this;
	}

	single() {
		this.resultMode = 'single';
		return this;
	}

	then<TResult1 = any, TResult2 = never>(
		onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null | undefined,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined
	): PromiseLike<TResult1 | TResult2> {
		return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
	}

	private execute() {
		switch (this.action) {
			case 'insert':
				return this.executeInsert();
			case 'update':
				return this.executeUpdate();
			case 'select':
			default:
				return this.executeSelect();
		}
	}

	private executeSelect() {
		if (this.table === 'welcome_email_sequences') {
			const rows = this.filterWelcomeRows();
			if (this.resultMode === 'maybeSingle' || this.resultMode === 'single') {
				return {
					data: rows[0] ?? null,
					error: null
				};
			}

			return {
				data: this.limitValue ? rows.slice(0, this.limitValue) : rows,
				error: null
			};
		}

		if (this.table === 'users') {
			const userId = this.getFilterValue('eq', 'id');
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

		if (this.table === 'onto_projects') {
			const actorId = this.getFilterValue('eq', 'created_by');
			const rows = (this.state.projectsByActorId?.[actorId] ?? []).filter(
				(project) => project.deleted_at == null
			);
			return {
				data: this.limitValue ? rows.slice(0, this.limitValue) : rows,
				count: rows.length,
				error: null
			};
		}

		if (this.table === 'user_brief_preferences') {
			const userId = this.getFilterValue('eq', 'user_id');
			return {
				data: userId ? (this.state.briefPreferencesByUserId?.[userId] ?? null) : null,
				error: null
			};
		}

		if (this.table === 'user_notification_preferences') {
			const userId = this.getFilterValue('eq', 'user_id');
			return {
				data: userId
					? (this.state.notificationPreferencesByUserId?.[userId] ?? null)
					: null,
				error: null
			};
		}

		if (this.table === 'user_sms_preferences') {
			const userId = this.getFilterValue('eq', 'user_id');
			return {
				data: userId ? (this.state.smsPreferencesByUserId?.[userId] ?? null) : null,
				error: null
			};
		}

		if (this.table === 'user_calendar_tokens') {
			const userId = this.getFilterValue('eq', 'user_id');
			const count = userId ? (this.state.calendarTokensByUserId?.[userId] ?? 0) : 0;
			return {
				data: this.selectOptions?.head
					? null
					: Array.from({ length: count }, () => ({ user_id: userId })),
				count,
				error: null
			};
		}

		if (this.table === 'email_logs') {
			const userId = this.getFilterValue('eq', 'user_id');
			const status = this.getFilterValue('eq', 'status');
			const rows = (this.state.emailLogsByUserId?.[userId] ?? []).filter((row) => {
				if (status && row.status !== status) {
					return false;
				}

				if (!this.containsFilter) {
					return true;
				}

				const metadata = row[this.containsFilter.field] as Record<string, any> | undefined;
				return Object.entries(this.containsFilter.value).every(
					([key, value]) => metadata?.[key] === value
				);
			});
			return { data: rows, error: null };
		}

		return {
			data: this.resultMode === 'many' ? [] : null,
			error: null
		};
	}

	private executeInsert() {
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

	private executeUpdate() {
		if (this.table === 'welcome_email_sequences' && this.updatePayload) {
			if (this.shouldSimulateMissingLastEvaluatedAtError()) {
				return {
					data: null,
					error: {
						code: '42703',
						message: 'column welcome_email_sequences.last_evaluated_at does not exist'
					}
				};
			}

			const rows = this.filterWelcomeRows();
			const row = rows[0] ?? null;
			if (!row) {
				return {
					data: this.resultMode === 'many' ? [] : null,
					error: null
				};
			}

			const nextRow = {
				...row,
				...this.updatePayload
			};
			this.state.welcomeRows[row.user_id] = nextRow;
			this.state.updates.push({
				userId: row.user_id,
				updates: this.updatePayload
			});

			return {
				data:
					this.resultMode === 'maybeSingle' || this.resultMode === 'single'
						? this.projectSelectedColumns(nextRow)
						: null,
				error: null
			};
		}

		return { error: null };
	}

	private getFilterValue(operator: 'eq' | 'is', field: string) {
		return this.filters.find((filter) => filter.operator === operator && filter.field === field)
			?.value;
	}

	private filterWelcomeRows() {
		return Object.values(this.state.welcomeRows).filter((row: any) => {
			const matchesFilters = this.filters.every((filter) => {
				if (filter.operator === 'eq') {
					return row[filter.field] === filter.value;
				}
				if (filter.value === null) {
					return row[filter.field] === null;
				}
				return row[filter.field] === filter.value;
			});

			if (!matchesFilters) {
				return false;
			}

			if (!this.orExpression) {
				return true;
			}

			return this.orExpression.split(',').some((clause) => this.matchesOrClause(row, clause));
		});
	}

	private matchesOrClause(row: Record<string, any>, clause: string): boolean {
		const trimmed = clause.trim();
		if (trimmed.endsWith('.is.null')) {
			const field = trimmed.slice(0, -'.is.null'.length);
			return row[field] == null;
		}

		const ltIndex = trimmed.indexOf('.lt.');
		if (ltIndex === -1) {
			return false;
		}

		const field = trimmed.slice(0, ltIndex);
		const value = trimmed.slice(ltIndex + 4);
		if (row[field] == null) {
			return false;
		}

		return new Date(row[field]).getTime() < new Date(value).getTime();
	}

	private shouldSimulateMissingLastEvaluatedAtError(): boolean {
		if (!this.state.legacySequenceSchema) {
			return false;
		}

		return (
			Object.hasOwn(this.updatePayload ?? {}, 'last_evaluated_at') ||
			Boolean(this.orExpression?.includes('last_evaluated_at'))
		);
	}

	private projectSelectedColumns(row: Record<string, any>) {
		if (!this.selectedColumns || this.selectedColumns === '*') {
			return row;
		}

		const projected: Record<string, any> = {};
		for (const column of this.selectedColumns.split(',').map((value) => value.trim())) {
			projected[column] = row[column];
		}
		return projected;
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
					: { data: state.actorId ?? 'actor-1', error: null };
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

	it('falls back to updated_at when the legacy sequence table is missing last_evaluated_at', async () => {
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
			failRpc: false,
			legacySequenceSchema: true
		};

		const { WelcomeSequenceService } = await import('./welcome-sequence.service');
		const service = new WelcomeSequenceService(createMockSupabase(state) as any);

		await expect(
			service.startSequenceForUser({
				userId: 'user-1',
				signupMethod: 'google_oauth'
			})
		).resolves.toBeUndefined();

		expect(sendEmailMock).toHaveBeenCalledTimes(1);
		expect(state.welcomeRows['user-1']?.email_1_sent_at).toEqual(expect.any(String));
		expect(state.updates).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					userId: 'user-1',
					updates: expect.objectContaining({
						updated_at: expect.any(String)
					})
				}),
				expect.objectContaining({
					userId: 'user-1',
					updates: expect.objectContaining({
						email_1_sent_at: expect.any(String),
						updated_at: expect.any(String)
					})
				})
			])
		);
	});
});
