// apps/web/src/lib/server/welcome-sequence.service.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
	failActorFallback?: boolean;
	failFullUserLoad?: boolean;
	legacySequenceSchema?: boolean;
	missingUpdatedAtColumn?: boolean;
	actorId?: string;
	fallbackActorId?: string;
	projectsByActorId?: Record<string, Array<Record<string, any>>>;
	briefPreferencesByUserId?: Record<string, Record<string, any>>;
	notificationPreferencesByUserId?: Record<string, Record<string, any>>;
	smsPreferencesByUserId?: Record<string, Record<string, any>>;
	calendarTokensByUserId?: Record<string, number>;
	emailLogsByUserId?: Record<string, Array<Record<string, any>>>;
	suppressedEmails?: string[];
	emailSequences?: Record<string, Record<string, any>>;
	emailSequenceEnrollments?: Record<string, Record<string, any>>;
	emailSequenceEnrollCalls?: Array<Record<string, any>>;
	emailSequenceUpserts?: Array<Record<string, any>>;
	emailSequenceRpcCalls?: Array<{ fn: string; args: Record<string, any> }>;
	failEmailSequenceEnrollmentRpc?: boolean;
}

class QueryBuilderMock implements PromiseLike<any> {
	private action: 'select' | 'insert' | 'update' | 'upsert' | null = null;
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

	upsert(payload: Record<string, any>) {
		this.action = 'upsert';
		this.insertPayload = payload;
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
			case 'upsert':
				return this.executeUpsert();
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

			if (this.selectedColumns === 'email') {
				return {
					data: {
						email: user.email
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

		if (this.table === 'email_sequences') {
			const key = this.getFilterValue('eq', 'key');
			const sequence = key ? (this.state.emailSequences?.[key] ?? null) : null;
			return {
				data: this.resultMode === 'many' ? (sequence ? [sequence] : []) : sequence,
				error: null
			};
		}

		if (this.table === 'email_sequence_enrollments') {
			const sequenceId = this.getFilterValue('eq', 'sequence_id');
			const userId = this.getFilterValue('eq', 'user_id');
			const key = sequenceId && userId ? `${sequenceId}:${userId}` : '';
			const enrollment = key ? (this.state.emailSequenceEnrollments?.[key] ?? null) : null;
			return {
				data: this.resultMode === 'many' ? (enrollment ? [enrollment] : []) : enrollment,
				error: null
			};
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

	private executeUpsert() {
		if (this.table === 'onto_actors' && this.insertPayload) {
			if (this.state.failActorFallback) {
				return {
					data: null,
					error: { message: 'onto_actors upsert failed' }
				};
			}

			const actorId = this.state.fallbackActorId ?? 'actor-fallback';
			this.state.actorId = actorId;
			return {
				data: { id: actorId },
				error: null
			};
		}

		if (this.table === 'email_sequence_enrollments' && this.insertPayload) {
			this.state.emailSequenceUpserts ??= [];
			this.state.emailSequenceEnrollments ??= {};
			this.state.emailSequenceUpserts.push(this.insertPayload);

			const key = `${this.insertPayload.sequence_id}:${this.insertPayload.user_id}`;
			const existing = this.state.emailSequenceEnrollments[key] ?? {};
			const row = {
				...existing,
				...this.insertPayload,
				id:
					existing.id ??
					`email-sequence-enrollment-${this.state.emailSequenceUpserts.length}`
			};
			this.state.emailSequenceEnrollments[key] = row;

			return {
				data:
					this.resultMode === 'maybeSingle' || this.resultMode === 'single'
						? this.projectSelectedColumns(row)
						: row,
				error: null
			};
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

			if (this.shouldSimulateMissingUpdatedAtError()) {
				return {
					data: null,
					error: {
						code: '42703',
						message: 'column welcome_email_sequences.updated_at does not exist'
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

	private shouldSimulateMissingUpdatedAtError(): boolean {
		if (!this.state.missingUpdatedAtColumn) {
			return false;
		}

		return (
			Object.hasOwn(this.updatePayload ?? {}, 'updated_at') ||
			Boolean(this.orExpression?.includes('updated_at'))
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

const TEST_SEQUENCE_ID = 'sequence-1';
const TEST_STEP_OFFSETS: Record<string, number> = {
	email_1: 0,
	email_2: 1,
	email_3: 3,
	email_4: 6,
	email_5: 9
};
const TEST_STEPS = ['email_1', 'email_2', 'email_3', 'email_4', 'email_5'] as const;

function ensureMockSequence(state: MockState) {
	state.emailSequences ??= {};
	state.emailSequences.buildos_welcome ??= {
		id: TEST_SEQUENCE_ID,
		key: 'buildos_welcome',
		metadata: {}
	};
	return state.emailSequences.buildos_welcome;
}

function enrollmentKey(sequenceId: string, userId: string) {
	return `${sequenceId}:${userId}`;
}

function latestTimestamp(values: Array<string | null | undefined>) {
	return values.filter(Boolean).sort().at(-1) ?? null;
}

function addDaysIso(startedAt: string, days: number) {
	const date = new Date(startedAt);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString();
}

function finalizedStepNumber(row: Record<string, any>) {
	let finalized = 0;
	for (const [index, step] of TEST_STEPS.entries()) {
		if (row[`${step}_sent_at`] || row[`${step}_skipped_at`]) {
			finalized = index + 1;
		}
	}
	return finalized;
}

function nextStepNumber(row: Record<string, any>) {
	for (const [index, step] of TEST_STEPS.entries()) {
		if (!row[`${step}_sent_at`] && !row[`${step}_skipped_at`]) {
			return index + 1;
		}
	}
	return null;
}

function createEnrollmentFromWelcomeRow(state: MockState, row: Record<string, any>) {
	const sequence = ensureMockSequence(state);
	const next = nextStepNumber(row);
	const sentAt = latestTimestamp(TEST_STEPS.map((step) => row[`${step}_sent_at`]));
	return {
		id: `enrollment-${row.user_id}`,
		sequence_id: sequence.id,
		user_id: row.user_id,
		recipient_email: state.users[row.user_id]?.email?.toLowerCase() ?? 'user@example.com',
		status: row.status === 'active' ? 'active' : row.status,
		current_step_number: finalizedStepNumber(row),
		next_step_number: row.status === 'active' ? next : null,
		next_send_at:
			row.status === 'active' && next
				? addDaysIso(row.started_at, TEST_STEP_OFFSETS[`email_${next}`])
				: null,
		last_sent_at: sentAt,
		last_email_id: null,
		processing_started_at: null,
		failure_count: 0,
		exit_reason: row.status === 'completed' ? 'completed' : null,
		last_error: null,
		metadata: {
			signup_method: row.signup_method,
			trigger_source: row.trigger_source,
			legacy_started_at: row.started_at,
			sequence_version: row.sequence_version
		},
		created_at: row.started_at,
		updated_at: row.updated_at
	};
}

function getEnrollmentById(state: MockState, enrollmentId: string) {
	return Object.values(state.emailSequenceEnrollments ?? {}).find(
		(enrollment: any) => enrollment.id === enrollmentId
	) as Record<string, any> | undefined;
}

function advanceEnrollment(state: MockState, enrollment: Record<string, any>) {
	const nextStepNumberValue =
		typeof enrollment.next_step_number === 'number' ? enrollment.next_step_number + 1 : null;
	const hasNext = nextStepNumberValue != null && nextStepNumberValue <= TEST_STEPS.length;
	const updated = {
		...enrollment,
		status: hasNext ? 'active' : 'completed',
		current_step_number: enrollment.next_step_number,
		next_step_number: hasNext ? nextStepNumberValue : null,
		next_send_at: hasNext
			? addDaysIso(enrollment.created_at, TEST_STEP_OFFSETS[`email_${nextStepNumberValue}`])
			: null,
		processing_started_at: null,
		failure_count: 0,
		exit_reason: hasNext ? null : 'completed',
		updated_at: new Date().toISOString()
	};
	state.emailSequenceEnrollments![enrollmentKey(updated.sequence_id, updated.user_id)] = updated;
	return updated;
}

function createMockSupabase(state: MockState) {
	return {
		from: (table: string) => new QueryBuilderMock(table, state),
		rpc: vi.fn(async (fn: string, args?: Record<string, any>) => {
			state.emailSequenceRpcCalls ??= [];
			state.emailSequenceRpcCalls.push({ fn, args: args ?? {} });

			if (fn === 'ensure_actor_for_user') {
				return state.failRpc
					? { data: null, error: { message: 'rpc unavailable' } }
					: { data: state.actorId ?? 'actor-1', error: null };
			}

			if (fn === 'is_email_suppressed') {
				const email =
					typeof args?.p_email === 'string' ? args.p_email.trim().toLowerCase() : '';
				return {
					data: state.suppressedEmails
						?.map((value) => value.toLowerCase())
						.includes(email)
						? true
						: false,
					error: null
				};
			}

			if (fn === 'enroll_user_in_email_sequence') {
				state.emailSequenceEnrollCalls ??= [];
				state.emailSequenceEnrollCalls.push(args ?? {});

				if (state.failEmailSequenceEnrollmentRpc) {
					return { data: null, error: { message: 'email sequence rpc unavailable' } };
				}

				const sequence = ensureMockSequence(state);
				state.emailSequenceEnrollments ??= {};
				const userId = args?.p_user_id;
				const key = enrollmentKey(sequence.id, userId);
				const now = new Date().toISOString();
				const existing = state.emailSequenceEnrollments[key];
				const enrollment = existing ?? {
					id: `enrollment-${userId}`,
					sequence_id: sequence.id,
					user_id: userId,
					recipient_email: args?.p_recipient_email,
					status: 'active',
					current_step_number: 0,
					next_step_number: 1,
					next_send_at: now,
					last_sent_at: null,
					last_email_id: null,
					processing_started_at: null,
					failure_count: 0,
					exit_reason: null,
					last_error: null,
					metadata: {
						signup_method: args?.p_signup_method,
						trigger_source: args?.p_trigger_source,
						...(args?.p_metadata ?? {})
					},
					created_at: now,
					updated_at: now
				};
				state.emailSequenceEnrollments[key] = {
					...enrollment,
					recipient_email: args?.p_recipient_email,
					metadata: {
						...(enrollment.metadata ?? {}),
						signup_method: args?.p_signup_method,
						trigger_source: args?.p_trigger_source,
						...(args?.p_metadata ?? {})
					}
				};
				return { data: state.emailSequenceEnrollments[key], error: null };
			}

			if (fn === 'claim_specific_email_sequence_send') {
				const enrollment = getEnrollmentById(state, args?.p_enrollment_id);
				if (
					!enrollment ||
					enrollment.status !== 'active' ||
					!enrollment.next_step_number ||
					(enrollment.next_send_at &&
						new Date(enrollment.next_send_at).getTime() > Date.now())
				) {
					return { data: null, error: null };
				}

				enrollment.status = 'processing';
				enrollment.processing_started_at = new Date().toISOString();
				return { data: enrollment, error: null };
			}

			if (fn === 'claim_pending_email_sequence_sends') {
				const sequence = ensureMockSequence(state);
				state.emailSequenceEnrollments ??= {};
				for (const row of Object.values(state.welcomeRows)) {
					const key = enrollmentKey(sequence.id, row.user_id);
					if (!state.emailSequenceEnrollments[key]) {
						state.emailSequenceEnrollments[key] = createEnrollmentFromWelcomeRow(
							state,
							row
						);
					}
				}

				const limit = args?.p_limit ?? 50;
				const due = Object.values(state.emailSequenceEnrollments)
					.filter(
						(enrollment: any) =>
							enrollment.status === 'active' &&
							enrollment.next_step_number &&
							enrollment.next_send_at &&
							new Date(enrollment.next_send_at).getTime() <= Date.now()
					)
					.slice(0, limit);

				for (const enrollment of due as any[]) {
					enrollment.status = 'processing';
					enrollment.processing_started_at = new Date().toISOString();
				}

				return { data: due, error: null };
			}

			if (fn === 'complete_email_sequence_send' || fn === 'skip_email_sequence_step') {
				const enrollment = getEnrollmentById(state, args?.p_enrollment_id);
				if (!enrollment || enrollment.status !== 'processing') {
					return { data: null, error: { message: 'not processing' } };
				}

				if (fn === 'complete_email_sequence_send') {
					enrollment.last_sent_at = new Date().toISOString();
					enrollment.last_email_id = args?.p_email_id ?? null;
				}

				return { data: advanceEnrollment(state, enrollment), error: null };
			}

			if (fn === 'defer_email_sequence_step') {
				const enrollment = getEnrollmentById(state, args?.p_enrollment_id);
				if (!enrollment || enrollment.status !== 'processing') {
					return { data: null, error: { message: 'not processing' } };
				}

				enrollment.status = 'active';
				enrollment.next_send_at = args?.p_next_send_at;
				enrollment.processing_started_at = null;
				enrollment.updated_at = new Date().toISOString();
				return { data: enrollment, error: null };
			}

			if (fn === 'retry_or_fail_email_sequence_send') {
				const enrollment = getEnrollmentById(state, args?.p_enrollment_id);
				if (!enrollment) {
					return { data: null, error: { message: 'not found' } };
				}

				enrollment.failure_count = (enrollment.failure_count ?? 0) + 1;
				enrollment.status = enrollment.failure_count >= 3 ? 'errored' : 'active';
				enrollment.processing_started_at = null;
				enrollment.last_error = args?.p_error;
				return { data: enrollment, error: null };
			}

			if (fn === 'exit_user_from_email_sequence' || fn === 'exit_email_from_email_sequence') {
				let count = 0;
				for (const enrollment of Object.values(
					state.emailSequenceEnrollments ?? {}
				) as any[]) {
					const matches =
						fn === 'exit_user_from_email_sequence'
							? enrollment.user_id === args?.p_user_id
							: enrollment.recipient_email === args?.p_email;
					if (matches && ['active', 'processing', 'paused'].includes(enrollment.status)) {
						enrollment.status = 'exited';
						enrollment.next_step_number = null;
						enrollment.next_send_at = null;
						enrollment.processing_started_at = null;
						enrollment.exit_reason = args?.p_reason;
						count += 1;
					}
				}
				return { data: count, error: null };
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

	afterEach(() => {
		vi.useRealTimers();
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
			failRpc: true,
			failActorFallback: true
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

	it('falls back to direct actor creation when actor RPC fails', async () => {
		const state: MockState = {
			users: {
				'user-1': {
					id: 'user-1',
					email: 'user@example.com',
					name: null,
					created_at: '2026-03-01T10:00:00.000Z',
					last_visit: null,
					onboarding_completed_at: null,
					onboarding_intent: 'plan',
					timezone: 'UTC'
				}
			},
			welcomeRows: {},
			updates: [],
			failRpc: true,
			fallbackActorId: 'actor-fallback'
		};

		const { WelcomeSequenceService } = await import('./welcome-sequence.service');
		const service = new WelcomeSequenceService(createMockSupabase(state) as any);

		await expect(
			service.startSequenceForUser({
				userId: 'user-1',
				signupMethod: 'email'
			})
		).resolves.toBeUndefined();

		expect(sendEmailMock).toHaveBeenCalledTimes(1);
		expect(state.welcomeRows['user-1']?.email_1_sent_at).toEqual(expect.any(String));
	});

	it('sends email_1 immediately when sequence start is slightly ahead of app time', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-01T10:00:00.000Z'));

		const state: MockState = {
			users: {
				'user-1': {
					id: 'user-1',
					email: 'user@example.com',
					name: 'Alex Builder',
					created_at: '2026-03-01T10:00:00.050Z',
					last_visit: null,
					onboarding_completed_at: null,
					onboarding_intent: 'plan',
					timezone: 'UTC'
				}
			},
			welcomeRows: {},
			updates: [],
			failRpc: false
		};

		const { WelcomeSequenceService } = await import('./welcome-sequence.service');
		const service = new WelcomeSequenceService(createMockSupabase(state) as any);

		await expect(
			service.startSequenceForUser({
				userId: 'user-1',
				signupMethod: 'email'
			})
		).resolves.toBeUndefined();

		expect(sendEmailMock).toHaveBeenCalledTimes(1);
		expect(state.welcomeRows['user-1']?.email_1_sent_at).toBe('2026-03-01T10:00:00.050Z');
	});

	it('enrolls signup in the queue, claims email_1, and shadows completion to legacy', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-01T10:00:00.000Z'));

		const state: MockState = {
			users: {
				'user-1': {
					id: 'user-1',
					email: 'USER@example.com',
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
			emailSequences: {
				buildos_welcome: {
					id: 'sequence-1',
					key: 'buildos_welcome',
					metadata: {}
				}
			},
			emailSequenceEnrollCalls: [],
			emailSequenceUpserts: []
		};

		const { WelcomeSequenceService } = await import('./welcome-sequence.service');
		const service = new WelcomeSequenceService(createMockSupabase(state) as any);

		await service.startSequenceForUser({
			userId: 'user-1',
			signupMethod: 'email',
			triggerSource: 'account_created'
		});

		expect(state.emailSequenceEnrollCalls).toEqual([
			expect.objectContaining({
				p_user_id: 'user-1',
				p_sequence_key: 'buildos_welcome',
				p_recipient_email: 'user@example.com',
				p_signup_method: 'email',
				p_trigger_source: 'account_created'
			})
		]);

		const enrollment = state.emailSequenceEnrollments?.['sequence-1:user-1'];
		expect(enrollment).toMatchObject({
			sequence_id: 'sequence-1',
			user_id: 'user-1',
			recipient_email: 'user@example.com',
			status: 'active',
			current_step_number: 1,
			next_step_number: 2,
			next_send_at: '2026-03-02T10:00:00.000Z',
			last_sent_at: '2026-03-01T10:00:00.000Z'
		});
		expect(state.welcomeRows['user-1']?.email_1_sent_at).toBe('2026-03-01T10:00:00.000Z');
	});

	it('cancels a suppressed user at sequence start without sending email_1', async () => {
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
			suppressedEmails: ['user@example.com']
		};

		const { WelcomeSequenceService } = await import('./welcome-sequence.service');
		const service = new WelcomeSequenceService(createMockSupabase(state) as any);

		await expect(
			service.startSequenceForUser({
				userId: 'user-1',
				signupMethod: 'email'
			})
		).resolves.toBeUndefined();

		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(state.welcomeRows['user-1']?.status).toBe('cancelled');
		expect(state.welcomeRows['user-1']?.completed_at).toEqual(expect.any(String));
	});

	it('cancels a suppressed active sequence during cron without sending the due step', async () => {
		const row = createSequenceRow('user-1');
		row.email_1_sent_at = '2026-03-01T10:01:00.000Z';
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
				'user-1': row
			},
			updates: [],
			failRpc: false,
			suppressedEmails: ['USER@example.com']
		};

		const { WelcomeSequenceService } = await import('./welcome-sequence.service');
		const service = new WelcomeSequenceService(createMockSupabase(state) as any);
		const result = await service.processDueSequences({
			now: new Date('2026-03-02T10:30:00.000Z')
		});

		expect(result.suppressed).toBe(1);
		expect(result.cancelled).toBe(1);
		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(state.welcomeRows['user-1']?.status).toBe('cancelled');
		expect(state.welcomeRows['user-1']?.email_2_sent_at).toBeNull();
	});

	it('defers a claimed queue step to the next weekday send window', async () => {
		const row = createSequenceRow('user-1');
		row.email_1_sent_at = '2026-03-01T10:01:00.000Z';
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
					timezone: 'America/New_York'
				}
			},
			welcomeRows: {
				'user-1': row
			},
			updates: [],
			failRpc: false,
			actorId: 'actor-1'
		};

		const { WelcomeSequenceService } = await import('./welcome-sequence.service');
		const service = new WelcomeSequenceService(createMockSupabase(state) as any);
		const result = await service.processDueSequences({
			now: new Date('2026-03-07T15:00:00.000Z')
		});

		expect(result.deferred).toBe(1);
		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(state.emailSequenceEnrollments?.['sequence-1:user-1']).toMatchObject({
			status: 'active',
			next_step_number: 2,
			next_send_at: '2026-03-09T13:00:00.000Z'
		});
		expect(state.welcomeRows['user-1']?.email_2_sent_at).toBeNull();
	});

	it('counts legacy user-owned projects when deciding later welcome steps', async () => {
		const row = createSequenceRow('user-1');
		row.email_1_sent_at = '2026-03-01T10:01:00.000Z';
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
				'user-1': row
			},
			updates: [],
			failRpc: false,
			actorId: 'actor-1',
			emailSequences: {
				buildos_welcome: {
					id: 'sequence-1',
					key: 'buildos_welcome',
					metadata: {}
				}
			},
			emailSequenceUpserts: [],
			projectsByActorId: {
				'user-1': [
					{
						id: 'project-legacy',
						updated_at: '2026-03-01T12:00:00.000Z',
						deleted_at: null
					}
				]
			}
		};

		const { WelcomeSequenceService } = await import('./welcome-sequence.service');
		const service = new WelcomeSequenceService(createMockSupabase(state) as any);
		const result = await service.processDueSequences({
			now: new Date('2026-03-02T10:30:00.000Z')
		});

		expect(result.skipped).toBe(1);
		expect(sendEmailMock).not.toHaveBeenCalled();
		expect(state.welcomeRows['user-1']?.email_2_skipped_at).toEqual('2026-03-02T10:30:00.000Z');
		expect(state.emailSequenceEnrollments?.['sequence-1:user-1']).toMatchObject({
			sequence_id: 'sequence-1',
			user_id: 'user-1',
			status: 'active',
			current_step_number: 2,
			next_step_number: 3,
			next_send_at: '2026-03-04T10:00:00.000Z',
			last_sent_at: '2026-03-01T10:01:00.000Z'
		});
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

	it('best-effort sends when the legacy sequence table is missing both evaluation columns', async () => {
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
			legacySequenceSchema: true,
			missingUpdatedAtColumn: true
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
		expect(state.updates).toHaveLength(1);
		expect(state.updates[0]).toMatchObject({
			userId: 'user-1',
			updates: {
				email_1_sent_at: expect.any(String)
			}
		});
		expect(state.updates[0]?.updates).not.toHaveProperty('last_evaluated_at');
		expect(state.updates[0]?.updates).not.toHaveProperty('updated_at');
	});
});
