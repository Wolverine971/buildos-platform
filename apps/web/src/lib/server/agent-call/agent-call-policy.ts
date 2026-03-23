// apps/web/src/lib/server/agent-call/agent-call-policy.ts
import {
	BUILDOS_AGENT_READ_OPS,
	BUILDOS_AGENT_SUPPORTED_OPS,
	BUILDOS_AGENT_WRITE_OPS
} from '@buildos/shared-types';
import type { BuildosAgentAllowedOp, BuildosAgentScopeMode } from '@buildos/shared-types';

const READ_OP_SET = new Set<BuildosAgentAllowedOp>(BUILDOS_AGENT_READ_OPS);
const WRITE_OP_SET = new Set<BuildosAgentAllowedOp>(BUILDOS_AGENT_WRITE_OPS);
const SUPPORTED_OP_SET = new Set<BuildosAgentAllowedOp>(BUILDOS_AGENT_SUPPORTED_OPS);

export const DEFAULT_SCOPE_MODE: BuildosAgentScopeMode = 'read_only';

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function scopeRank(mode: BuildosAgentScopeMode): number {
	return mode === 'read_write' ? 2 : 1;
}

export function isBuildosAgentScopeMode(value: unknown): value is BuildosAgentScopeMode {
	return value === 'read_only' || value === 'read_write';
}

export function normalizeScopeMode(
	value: unknown,
	fieldName: string,
	fallback: BuildosAgentScopeMode = DEFAULT_SCOPE_MODE
): BuildosAgentScopeMode {
	if (value === undefined || value === null) {
		return fallback;
	}

	if (!isBuildosAgentScopeMode(value)) {
		throw new Error(`${fieldName} must be read_only or read_write`);
	}

	return value;
}

export function defaultAllowedOpsForMode(mode: BuildosAgentScopeMode): BuildosAgentAllowedOp[] {
	return mode === 'read_write' ? [...BUILDOS_AGENT_SUPPORTED_OPS] : [...BUILDOS_AGENT_READ_OPS];
}

export function minimumScopeMode(
	left: BuildosAgentScopeMode,
	right: BuildosAgentScopeMode
): BuildosAgentScopeMode {
	return scopeRank(left) <= scopeRank(right) ? left : right;
}

export function isWriteOp(op: string): op is BuildosAgentAllowedOp {
	return WRITE_OP_SET.has(op as BuildosAgentAllowedOp);
}

export function isReadOp(op: string): op is BuildosAgentAllowedOp {
	return READ_OP_SET.has(op as BuildosAgentAllowedOp);
}

export function isSupportedOp(op: string): op is BuildosAgentAllowedOp {
	return SUPPORTED_OP_SET.has(op as BuildosAgentAllowedOp);
}

export function requiredScopeModeForOp(op: string): BuildosAgentScopeMode | null {
	if (!isSupportedOp(op)) {
		return null;
	}

	return isWriteOp(op) ? 'read_write' : 'read_only';
}

export function normalizeAllowedOps(
	value: unknown,
	fieldName: string,
	mode: BuildosAgentScopeMode
): BuildosAgentAllowedOp[] | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}

	if (!Array.isArray(value)) {
		throw new Error(`${fieldName} must be an array of supported BuildOS ops`);
	}

	const normalized: BuildosAgentAllowedOp[] = [];
	const seen = new Set<string>();

	for (const entry of value) {
		if (typeof entry !== 'string' || !isSupportedOp(entry)) {
			throw new Error(`${fieldName} must contain supported BuildOS ops`);
		}

		if (mode === 'read_only' && isWriteOp(entry)) {
			throw new Error(`${fieldName} cannot include write ops when scope_mode is read_only`);
		}

		if (seen.has(entry)) {
			continue;
		}

		seen.add(entry);
		normalized.push(entry);
	}

	return normalized;
}

export function extractScopeModeFromPolicy(
	policy: unknown,
	fallback: BuildosAgentScopeMode = DEFAULT_SCOPE_MODE
): BuildosAgentScopeMode {
	if (!isRecord(policy)) {
		return fallback;
	}

	try {
		return normalizeScopeMode(policy.scope_mode, 'policy.scope_mode', fallback);
	} catch {
		return fallback;
	}
}

export function extractAllowedOpsFromPolicy(
	policy: unknown,
	mode: BuildosAgentScopeMode
): BuildosAgentAllowedOp[] {
	if (!isRecord(policy)) {
		return defaultAllowedOpsForMode(mode);
	}

	try {
		const normalized = normalizeAllowedOps(policy.allowed_ops, 'policy.allowed_ops', mode);
		return normalized ?? defaultAllowedOpsForMode(mode);
	} catch {
		return defaultAllowedOpsForMode(mode);
	}
}

export function buildCallerPolicy(params: {
	scopeMode: BuildosAgentScopeMode;
	allowedProjectIds?: string[];
	allowedOps?: BuildosAgentAllowedOp[];
}): Record<string, unknown> {
	return {
		scope_mode: params.scopeMode,
		allowed_project_ids: params.allowedProjectIds ?? null,
		allowed_ops: params.allowedOps ?? defaultAllowedOpsForMode(params.scopeMode)
	};
}

export function intersectAllowedOps(
	left: BuildosAgentAllowedOp[],
	right: BuildosAgentAllowedOp[]
): BuildosAgentAllowedOp[] {
	const rightSet = new Set(right);
	return left.filter((op) => rightSet.has(op));
}

export function describeScopeMode(mode: BuildosAgentScopeMode): string {
	return mode === 'read_write' ? 'read and write' : 'read only';
}
