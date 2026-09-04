// packages/shared-agent-ops/src/gateway/op-execution-gateway.normalization.ts
import { isValidUUID } from '@buildos/shared-types';
import {
	CivilDateError,
	type CivilDateBoundary,
	hasDateOnlyValue,
	normalizeDateOnlyInput,
	resolveUserCivilTimezone
} from '../dates/civil-date';
import { normalizeDocumentStateInput } from '../ontology/document-state';
import {
	DOCUMENT_STATES,
	GOAL_STATES,
	MILESTONE_STATES,
	PLAN_STATES,
	PROJECT_STATES,
	RISK_STATES,
	TASK_STATES
} from '../ontology/onto';
import { normalizeTaskStateInput } from '../ontology/task-state';
import type { ExternalEntityKind } from './op-execution-gateway.config';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';

export function requireTrimmedString(
	value: unknown,
	fieldName: string,
	options?: { allowEmpty?: boolean; allowNull?: boolean }
): string | null {
	if (value === null && options?.allowNull) {
		return null;
	}

	if (typeof value !== 'string') {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} must be a string`);
	}

	const normalized = value.trim();
	if (!normalized && options?.allowEmpty !== true) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} is required`);
	}

	return normalized;
}

export function normalizeProjectState(value: unknown, fieldName = 'state_key'): string | undefined {
	if (value === undefined) return undefined;
	const state = requireTrimmedString(value, fieldName);
	if (state === null) return undefined;
	if (!PROJECT_STATES.includes(state as (typeof PROJECT_STATES)[number])) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be one of: ${PROJECT_STATES.join(', ')}`
		);
	}
	return state;
}

const ENTITY_STATE_VALUES: Record<ExternalEntityKind, readonly string[]> = {
	project: PROJECT_STATES,
	task: TASK_STATES,
	document: DOCUMENT_STATES,
	goal: GOAL_STATES,
	plan: PLAN_STATES,
	milestone: MILESTONE_STATES,
	risk: RISK_STATES
};

export function normalizeEntityStateFilter(
	value: unknown,
	kind: ExternalEntityKind,
	fieldName = 'state_key'
): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;

	if (kind === 'task') {
		const state = normalizeTaskStateInput(value);
		if (state) return state;
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be one of: ${TASK_STATES.join(', ')}`
		);
	}

	if (kind === 'document') {
		const state = normalizeDocumentStateInput(value);
		if (state) return state;
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be one of: ${DOCUMENT_STATES.join(', ')}`
		);
	}

	if (kind === 'project') {
		return normalizeProjectState(value, fieldName);
	}

	return normalizeStateValue(value, fieldName, ENTITY_STATE_VALUES[kind]);
}

export function normalizeEntityTypeFilter(
	value: unknown,
	kind?: ExternalEntityKind
): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const typeKey = requireTrimmedString(value, 'type_key');
	if (!typeKey) return undefined;
	void kind;
	return typeKey;
}

export function normalizeRiskImpactFilter(value: unknown): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const impact = requireTrimmedString(value, 'impact') ?? '';
	if (!['low', 'medium', 'high', 'critical'].includes(impact)) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'impact must be one of: low, medium, high, critical'
		);
	}
	return impact;
}

export function normalizeArchivedBoolean(
	value: unknown,
	fieldName = 'archived'
): boolean | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value === 'boolean') return value;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (normalized === 'true') return true;
		if (normalized === 'false') return false;
	}
	throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} must be a boolean`);
}

export function normalizeArchivedReadFilter(value: unknown): boolean {
	return normalizeArchivedBoolean(value) ?? false;
}

export function applyArchivedFilter<
	T extends { is: (...args: any[]) => any; not: (...args: any[]) => any }
>(query: T, archived: boolean): T {
	const withoutDeleted = query.is('deleted_at', null) as T;
	return archived
		? (withoutDeleted.not('archived_at', 'is', null) as T)
		: (withoutDeleted.is('archived_at', null) as T);
}

export function applyArchivedReadFilter<
	T extends { is: (...args: any[]) => any; not: (...args: any[]) => any }
>(query: T, args: Record<string, unknown>): T {
	return applyArchivedFilter(query, normalizeArchivedReadFilter(args.archived));
}

export function normalizeArchivedUpdate(value: unknown): string | null | undefined {
	const archived = normalizeArchivedBoolean(value);
	if (archived === undefined) return undefined;
	return archived ? new Date().toISOString() : null;
}

export function normalizeStateValue<const T extends readonly string[]>(
	value: unknown,
	fieldName: string,
	allowed: T,
	fallback?: T[number]
): T[number] | undefined {
	if (value === undefined || value === null || value === '') {
		return fallback;
	}

	const state = requireTrimmedString(value, fieldName);
	if (!allowed.includes(state as T[number])) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be one of: ${allowed.join(', ')}`
		);
	}
	return state as T[number];
}

export function normalizeOptionalText(
	value: unknown,
	fieldName: string,
	options?: { allowNull?: boolean }
): string | null | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (value === null) {
		if (options?.allowNull) return null;
		throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} must be a string`);
	}
	return requireTrimmedString(value, fieldName, { allowEmpty: true });
}

export function normalizeOptionalUuid(
	value: unknown,
	fieldName: string
): string | null | undefined {
	if (value === undefined) return undefined;
	if (value === null || value === '') return null;
	if (typeof value !== 'string' || !isValidUUID(value.trim())) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} must be a valid UUID`);
	}
	return value.trim();
}

export interface NormalizeOptionalDateOptions {
	/**
	 * Which end of the civil day a bare `YYYY-MM-DD` means. Due/end fields take
	 * 'end'; start fields take 'start'.
	 */
	boundary?: CivilDateBoundary;
	/** Owning user's IANA timezone. Missing/invalid falls back to UTC. */
	timezone?: string | null;
}

export function normalizeOptionalDate(
	value: unknown,
	fieldName: string,
	options: NormalizeOptionalDateOptions = {}
): string | null | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (value === null || value === '') {
		return null;
	}

	if (typeof value !== 'string') {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be a string or null`
		);
	}

	const normalized = value.trim();
	if (!normalized) {
		return null;
	}

	try {
		// Date-only input means a civil day in the user's timezone, not the
		// midnight-UTC instant Postgres would otherwise store.
		return normalizeDateOnlyInput(normalized, {
			boundary: options.boundary ?? 'start',
			timezone: options.timezone
		});
	} catch (error) {
		if (error instanceof CivilDateError) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				`${fieldName} must be a valid ISO date`
			);
		}
		throw error;
	}
}

/**
 * Cache the users.timezone lookup per gateway execution context so a mutation
 * touching several date fields costs at most one extra read, and a mutation
 * with no date-only input costs none.
 */
const contextTimezoneCache = new WeakMap<object, Promise<string | null>>();

export type CivilTimezoneContext = {
	admin: unknown;
	userId: string;
	/** Pre-resolved override; skips the lookup entirely. */
	timezone?: string | null;
};

/**
 * Resolve the acting user's civil timezone, but only when at least one supplied
 * value is date-only. Everything else already carries its own offset.
 */
export async function resolveGatewayCivilTimezone(
	context: CivilTimezoneContext,
	dateCandidates: readonly unknown[]
): Promise<string | null> {
	if (!hasDateOnlyValue(dateCandidates)) return null;
	if (typeof context.timezone === 'string' && context.timezone.trim()) {
		return context.timezone.trim();
	}

	const cached = contextTimezoneCache.get(context as object);
	if (cached) return cached;

	const pending = resolveUserCivilTimezone(
		context.admin as { from: (table: string) => any } | null,
		context.userId
	);
	contextTimezoneCache.set(context as object, pending);
	return pending;
}

export type GatewayCalendarSyncMode = 'auto' | 'none';

/**
 * Explicit switch for task calendar side effects. Default keeps today's
 * behavior; 'none' means the caller asked for no calendar events/blocks.
 */
export function normalizeCalendarSyncMode(
	value: unknown,
	fieldName = 'calendar_sync'
): GatewayCalendarSyncMode {
	if (value === undefined || value === null || value === '') return 'auto';
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (normalized === 'auto' || normalized === 'none') return normalized;
	}
	throw new ExternalToolGatewayError(
		'VALIDATION_ERROR',
		`${fieldName} must be one of: auto, none`
	);
}

export function normalizeProps(
	value: unknown,
	fieldName: string
): Record<string, unknown> | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} must be an object`);
	}

	return value as Record<string, unknown>;
}
