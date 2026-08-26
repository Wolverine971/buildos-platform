// apps/web/src/lib/server/cycles/cycle-service.ts
import { formatInTimeZone } from 'date-fns-tz';
import { z } from 'zod';
import {
	DEFAULT_CYCLE_ATTENTION_POLICY_BY_KIND,
	DEFAULT_CYCLE_EXECUTION_POLICY,
	validateCycleInput,
	type CreateCycleInput,
	type CycleAttentionPolicy,
	type CycleDefinition,
	type CycleExecutionPolicy,
	type CycleKind,
	type CycleRun,
	type CycleRunAdmissionResult
} from '@buildos/shared-types';
import { materializeCycleTriggers } from './cycle-schedule';

type SupabaseLike = any;
type UnknownRecord = Record<string, any>;

const requestIdSchema = z.string().trim().min(1).max(200);
const cycleIdSchema = z.string().uuid();
const labelSchema = z.string().trim().min(1).max(100);
const cycleStateSchema = z.enum(['active', 'paused']);
const attentionPolicySchema = z.enum(['silent', 'exceptions', 'always']);
const executionPolicySchema = z
	.object({
		overlap: z.enum(['skip', 'allow']),
		misfire: z.enum(['skip', 'run_once']),
		max_attempts: z.number().int().min(1).max(10)
	})
	.strict();

const dailyScheduleSchema = z
	.object({
		type: z.literal('daily'),
		time_of_day: z.string(),
		timezone: z.string()
	})
	.strict();
const weeklyScheduleSchema = z
	.object({
		type: z.literal('weekly'),
		days_of_week: z.array(z.number().int().min(0).max(6)),
		time_of_day: z.string(),
		timezone: z.string()
	})
	.strict();
const intervalScheduleSchema = z
	.object({
		type: z.literal('interval'),
		every_minutes: z.number().int(),
		anchor_at: z.string()
	})
	.strict();
const scheduleSchema = z.discriminatedUnion('type', [
	dailyScheduleSchema,
	weeklyScheduleSchema,
	intervalScheduleSchema
]);

const triggerStateSchema = z.enum(['active', 'paused']).optional();
const triggerSchema = z.discriminatedUnion('type', [
	z
		.object({
			type: z.literal('schedule'),
			schedule: scheduleSchema,
			state: triggerStateSchema
		})
		.strict(),
	z
		.object({
			type: z.literal('event'),
			event_types: z.array(z.string()),
			debounce_minutes: z.number().int().optional(),
			state: triggerStateSchema
		})
		.strict(),
	z
		.object({
			type: z.literal('threshold'),
			metric: z.string(),
			operator: z.enum(['gte', 'lte']),
			value: z.number().finite(),
			evaluation_window_minutes: z.number().int().optional(),
			state: triggerStateSchema
		})
		.strict(),
	z
		.object({
			type: z.literal('relative'),
			relative_to: z.enum(['calendar_event', 'milestone', 'deadline']),
			offset_minutes: z.number().int(),
			state: triggerStateSchema
		})
		.strict()
]);

const commonCreateShape = {
	request_id: requestIdSchema,
	label: labelSchema,
	triggers: z.array(triggerSchema),
	policy: executionPolicySchema.optional(),
	attention_policy: attentionPolicySchema.optional(),
	state: cycleStateSchema.optional()
};
const userTargetSchema = z
	.object({ type: z.literal('user'), project_id: z.null().default(null) })
	.strict();
const projectTargetSchema = z
	.object({ type: z.literal('project'), project_id: z.string().uuid() })
	.strict();
const emptyConfigSchema = z.object({}).strict();
const dailyBriefConfigSchema = z
	.object({ generation_lead_minutes: z.number().int().min(0).max(30).optional() })
	.strict();

const createCycleSchema = z.discriminatedUnion('kind', [
	z
		.object({
			...commonCreateShape,
			kind: z.literal('daily_brief'),
			target: userTargetSchema,
			config: dailyBriefConfigSchema
		})
		.strict(),
	z
		.object({
			...commonCreateShape,
			kind: z.literal('project_audit'),
			target: projectTargetSchema,
			config: z.object({ depth: z.enum(['standard', 'deep']) }).strict()
		})
		.strict(),
	z
		.object({
			...commonCreateShape,
			kind: z.literal('project_review'),
			target: projectTargetSchema,
			config: emptyConfigSchema
		})
		.strict(),
	z
		.object({
			...commonCreateShape,
			kind: z.literal('task_review'),
			target: z.union([userTargetSchema, projectTargetSchema]),
			config: emptyConfigSchema
		})
		.strict()
]);

const updateCycleSchema = z
	.object({
		expected_version: z.number().int().positive(),
		label: labelSchema.optional(),
		target: z.union([userTargetSchema, projectTargetSchema]).optional(),
		config: z.record(z.unknown()).optional(),
		policy: executionPolicySchema.optional(),
		attention_policy: attentionPolicySchema.optional(),
		state: cycleStateSchema.optional()
	})
	.strict()
	.refine(
		(value) => Object.keys(value).some((key) => key !== 'expected_version'),
		'A Cycle update must contain at least one change.'
	);

const manualRunSchema = z
	.object({
		request_id: requestIdSchema.optional(),
		brief_date: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional(),
		force_regenerate: z.boolean().optional(),
		include_projects: z.array(z.string().uuid()).max(100).optional(),
		exclude_projects: z.array(z.string().uuid()).max(100).optional(),
		custom_template: z.string().max(20_000).optional()
	})
	.strict();

export class CycleServiceError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly code: string,
		readonly details?: unknown
	) {
		super(message);
		this.name = 'CycleServiceError';
	}
}

function validationError(error: z.ZodError): CycleServiceError {
	return new CycleServiceError('Invalid Cycle request.', 400, 'INVALID_REQUEST', error.issues);
}

function mapDatabaseError(error: UnknownRecord, fallback: string): CycleServiceError {
	const databaseMessage = typeof error?.message === 'string' ? error.message : '';
	const databaseCode = typeof error?.code === 'string' ? error.code : '';
	const details = { database_code: databaseCode || undefined, detail: error?.details };

	if (databaseMessage === 'cycle_not_found' || databaseCode === 'P0002') {
		return new CycleServiceError('Cycle not found.', 404, 'CYCLE_NOT_FOUND');
	}
	if (databaseMessage === 'cycle_service_role_required') {
		return new CycleServiceError(
			'The Cycle command service is misconfigured.',
			503,
			'CYCLE_SERVICE_UNAVAILABLE'
		);
	}
	if (databaseMessage === 'cycle_project_access_denied' || databaseCode === '42501') {
		return new CycleServiceError(
			'You do not have permission to use that Cycle target.',
			403,
			'CYCLE_ACCESS_DENIED'
		);
	}
	if (
		databaseMessage === 'cycle_version_conflict' ||
		databaseMessage === 'cycle_create_request_conflict' ||
		databaseMessage === 'cycle_occurrence_conflict' ||
		databaseMessage === 'cycle_already_exists_for_target' ||
		databaseCode === '23505'
	) {
		return new CycleServiceError(
			'The Cycle changed or an equivalent request already exists.',
			409,
			'CYCLE_CONFLICT',
			details
		);
	}
	if (databaseMessage === 'cycle_not_active' || databaseCode === '55000') {
		return new CycleServiceError('The Cycle is not active.', 409, 'CYCLE_NOT_ACTIVE');
	}
	if (databaseCode === '22023') {
		return new CycleServiceError(
			'The Cycle request is invalid.',
			400,
			'INVALID_REQUEST',
			details
		);
	}
	if (databaseCode === 'PGRST202') {
		return new CycleServiceError(
			'The Cycle command service is not available yet.',
			503,
			'CYCLE_SERVICE_UNAVAILABLE'
		);
	}

	return new CycleServiceError(fallback, 500, 'DATABASE_ERROR', details);
}

function normalizeLimit(limit: number | undefined): number {
	return Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit as number), 1), 100) : 50;
}

function parseCreateCycle(payload: unknown): CreateCycleInput {
	const parsed = createCycleSchema.safeParse(payload);
	if (!parsed.success) throw validationError(parsed.error);

	const input = parsed.data as CreateCycleInput;
	const issues = validateCycleInput(input);
	if (issues.length > 0) {
		throw new CycleServiceError('Invalid Cycle request.', 400, 'INVALID_REQUEST', issues);
	}
	return input;
}

function mapTrigger(row: UnknownRecord) {
	return {
		...(row.spec as UnknownRecord),
		id: row.id,
		cycle_id: row.cycle_id,
		state: row.state,
		version: row.version,
		next_run_at: row.next_run_at,
		last_fired_at: row.last_fired_at,
		created_at: row.created_at,
		updated_at: row.updated_at,
		deleted_at: row.deleted_at
	};
}

function mapCycle(row: UnknownRecord): CycleDefinition {
	const triggers = Array.isArray(row.triggers)
		? row.triggers
				.map(mapTrigger)
				.sort((a: UnknownRecord, b: UnknownRecord) =>
					String(a.created_at).localeCompare(String(b.created_at))
				)
		: [];

	return {
		id: row.id,
		user_id: row.user_id,
		label: row.label,
		kind: row.kind,
		state: row.state,
		target: {
			type: row.target_type,
			project_id: row.project_id
		},
		triggers,
		config: row.config,
		policy: row.policy,
		attention_policy: row.attention_policy,
		version: row.version,
		next_run_at: row.next_run_at,
		last_run_at: row.last_run_at,
		last_run_id: row.last_run_id,
		last_error: row.last_error,
		created_at: row.created_at,
		updated_at: row.updated_at,
		deleted_at: row.deleted_at
	} as CycleDefinition;
}

async function runRpc<T>(
	client: SupabaseLike,
	name: string,
	parameters: UnknownRecord,
	fallback: string
): Promise<T> {
	const { data, error } = await client.rpc(name, parameters);
	if (error) throw mapDatabaseError(error, fallback);
	if (data === null || data === undefined) {
		throw new CycleServiceError(fallback, 500, 'CYCLE_COMMAND_CONTRACT_INVALID');
	}
	return data as T;
}

export async function listCycles(params: {
	client: SupabaseLike;
	userId: string;
	kind?: CycleKind;
	state?: 'active' | 'paused' | 'deleted';
	limit?: number;
}): Promise<CycleDefinition[]> {
	let query = params.client
		.from('cycles')
		.select('*, triggers:cycle_triggers(*)')
		.eq('user_id', params.userId)
		.order('updated_at', { ascending: false })
		.limit(normalizeLimit(params.limit));

	if (params.kind) query = query.eq('kind', params.kind);
	if (params.state) query = query.eq('state', params.state);
	else query = query.is('deleted_at', null);

	const { data, error } = await query;
	if (error) throw mapDatabaseError(error, 'Failed to load Cycles.');
	return ((data ?? []) as UnknownRecord[]).map(mapCycle);
}

export async function getCycle(params: {
	client: SupabaseLike;
	userId: string;
	cycleId: string;
	includeDeleted?: boolean;
}): Promise<CycleDefinition> {
	if (!cycleIdSchema.safeParse(params.cycleId).success) {
		throw new CycleServiceError('Cycle ID must be a UUID.', 400, 'INVALID_REQUEST');
	}

	let query = params.client
		.from('cycles')
		.select('*, triggers:cycle_triggers(*)')
		.eq('id', params.cycleId)
		.eq('user_id', params.userId);
	if (!params.includeDeleted) query = query.is('deleted_at', null);

	const { data, error } = await query.maybeSingle();
	if (error) throw mapDatabaseError(error, 'Failed to load the Cycle.');
	if (!data) throw new CycleServiceError('Cycle not found.', 404, 'CYCLE_NOT_FOUND');
	return mapCycle(data as UnknownRecord);
}

export async function createCycle(params: {
	readClient: SupabaseLike;
	commandClient: SupabaseLike;
	userId: string;
	payload: unknown;
	now?: Date;
}): Promise<CycleDefinition> {
	const input = parseCreateCycle(params.payload);
	const policy: CycleExecutionPolicy = input.policy ?? { ...DEFAULT_CYCLE_EXECUTION_POLICY };
	const attentionPolicy: CycleAttentionPolicy =
		input.attention_policy ?? DEFAULT_CYCLE_ATTENTION_POLICY_BY_KIND[input.kind];
	const triggers = materializeCycleTriggers(input.triggers, params.now);

	const cycleResult = await runRpc<UnknownRecord | UnknownRecord[]>(
		params.commandClient,
		'create_cycle',
		{
			p_user_id: params.userId,
			p_request_id: input.request_id,
			p_label: input.label,
			p_kind: input.kind,
			p_target_type: input.target.type,
			p_project_id: input.target.project_id,
			p_config: input.config,
			p_triggers: triggers,
			p_policy: policy,
			p_attention_policy: attentionPolicy,
			p_state: input.state ?? 'active'
		},
		'Failed to create the Cycle.'
	);
	const cycle = Array.isArray(cycleResult) ? cycleResult[0] : cycleResult;
	if (!cycle?.id) {
		throw new CycleServiceError(
			'Failed to create the Cycle.',
			500,
			'CYCLE_COMMAND_CONTRACT_INVALID'
		);
	}

	return getCycle({
		client: params.readClient,
		userId: params.userId,
		cycleId: String(cycle.id)
	});
}

export async function updateCycle(params: {
	readClient: SupabaseLike;
	commandClient: SupabaseLike;
	userId: string;
	cycleId: string;
	payload: unknown;
}): Promise<CycleDefinition> {
	if (!cycleIdSchema.safeParse(params.cycleId).success) {
		throw new CycleServiceError('Cycle ID must be a UUID.', 400, 'INVALID_REQUEST');
	}

	const parsed = updateCycleSchema.safeParse(params.payload);
	if (!parsed.success) throw validationError(parsed.error);

	const { expected_version: expectedVersion, ...patch } = parsed.data;
	const patchKeys = Object.keys(patch);
	const stateOnly = patchKeys.length === 1 && patch.state;
	const rpcName =
		stateOnly === 'paused'
			? 'pause_cycle'
			: stateOnly === 'active'
				? 'resume_cycle'
				: 'update_cycle';
	const rpcParameters =
		rpcName === 'update_cycle'
			? {
					p_user_id: params.userId,
					p_cycle_id: params.cycleId,
					p_expected_version: expectedVersion,
					p_patch: patch
				}
			: {
					p_user_id: params.userId,
					p_cycle_id: params.cycleId,
					p_expected_version: expectedVersion
				};

	await runRpc<UnknownRecord>(
		params.commandClient,
		rpcName,
		rpcParameters,
		'Failed to update the Cycle.'
	);

	return getCycle({
		client: params.readClient,
		userId: params.userId,
		cycleId: params.cycleId
	});
}

export async function deleteCycle(params: {
	readClient: SupabaseLike;
	commandClient: SupabaseLike;
	userId: string;
	cycleId: string;
	expectedVersion: number;
}): Promise<CycleDefinition> {
	if (!cycleIdSchema.safeParse(params.cycleId).success) {
		throw new CycleServiceError('Cycle ID must be a UUID.', 400, 'INVALID_REQUEST');
	}

	if (!Number.isInteger(params.expectedVersion) || params.expectedVersion < 1) {
		throw new CycleServiceError(
			'expected_version must be a positive integer.',
			400,
			'INVALID_REQUEST'
		);
	}

	await runRpc<UnknownRecord>(
		params.commandClient,
		'delete_cycle',
		{
			p_user_id: params.userId,
			p_cycle_id: params.cycleId,
			p_expected_version: params.expectedVersion
		},
		'Failed to delete the Cycle.'
	);

	return getCycle({
		client: params.readClient,
		userId: params.userId,
		cycleId: params.cycleId,
		includeDeleted: true
	});
}

function validTimezone(timezone: unknown): timezone is string {
	if (typeof timezone !== 'string' || !timezone) return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
		return true;
	} catch {
		return false;
	}
}

function validCalendarDate(value: string): boolean {
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function admitManualCycleRun(params: {
	readClient: SupabaseLike;
	commandClient: SupabaseLike;
	userId: string;
	userTimezone?: unknown;
	cycleId: string;
	idempotencyKey?: string | null;
	payload: unknown;
	now?: Date;
}): Promise<CycleRunAdmissionResult> {
	const parsed = manualRunSchema.safeParse(params.payload);
	if (!parsed.success) throw validationError(parsed.error);

	const requestId = (params.idempotencyKey || parsed.data.request_id || '').trim();
	if (!requestId || requestId.length > 200) {
		throw new CycleServiceError(
			'An Idempotency-Key header or request_id is required.',
			400,
			'IDEMPOTENCY_KEY_REQUIRED'
		);
	}

	const cycle = await getCycle({
		client: params.readClient,
		userId: params.userId,
		cycleId: params.cycleId
	});
	if (cycle.kind !== 'daily_brief') {
		throw new CycleServiceError(
			`Manual execution is not available for ${cycle.kind} Cycles yet.`,
			409,
			'CYCLE_HANDLER_UNAVAILABLE'
		);
	}

	const timezone = validTimezone(params.userTimezone) ? params.userTimezone : 'UTC';
	const now = params.now ?? new Date();
	const briefDate = parsed.data.brief_date ?? formatInTimeZone(now, timezone, 'yyyy-MM-dd');
	if (!validCalendarDate(briefDate)) {
		throw new CycleServiceError(
			'brief_date must be a real calendar date.',
			400,
			'INVALID_REQUEST'
		);
	}

	return runRpc<CycleRunAdmissionResult>(
		params.commandClient,
		'admit_manual_cycle_run',
		{
			p_user_id: params.userId,
			p_cycle_id: params.cycleId,
			p_request_id: requestId,
			p_execution_input: {
				mode: parsed.data.force_regenerate ? 'regenerate' : 'manual',
				brief_date: briefDate,
				timezone,
				force_regenerate: parsed.data.force_regenerate ?? false,
				include_projects: parsed.data.include_projects,
				exclude_projects: parsed.data.exclude_projects,
				custom_template: parsed.data.custom_template,
				use_ontology: true
			},
			p_delivery_intent: { mode: 'suppress', reason: 'manual_run' }
		},
		'Failed to start the Cycle.'
	);
}

export async function listCycleRuns(params: {
	client: SupabaseLike;
	userId: string;
	cycleId: string;
	limit?: number;
}): Promise<CycleRun[]> {
	await getCycle({ client: params.client, userId: params.userId, cycleId: params.cycleId });

	const { data, error } = await params.client
		.from('cycle_runs')
		.select('*')
		.eq('cycle_id', params.cycleId)
		.eq('user_id', params.userId)
		.order('created_at', { ascending: false })
		.limit(normalizeLimit(params.limit));
	if (error) throw mapDatabaseError(error, 'Failed to load Cycle Runs.');
	return (data ?? []) as CycleRun[];
}
