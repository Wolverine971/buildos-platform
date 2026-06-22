// packages/shared-agent-ops/src/gateway/op-execution-gateway.normalization.ts
import { isValidUUID } from '@buildos/shared-types';
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

export function normalizeOptionalDate(
	value: unknown,
	fieldName: string
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

	const parsed = Date.parse(normalized);
	if (Number.isNaN(parsed)) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be a valid ISO date`
		);
	}

	return normalized;
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
