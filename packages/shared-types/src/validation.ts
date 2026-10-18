// packages/shared-types/src/validation.ts
import type { AgentRunJobMetadata } from './queue-types';
import { CYCLE_KINDS, type CycleQueueJobMetadata } from './cycle.types';

// Validation error class
export class ValidationError extends Error {
	constructor(
		public field: string,
		public value: unknown,
		public expectedType: string
	) {
		super(
			`Validation failed for field '${field}': expected ${expectedType}, got ${typeof value}`
		);
		this.name = 'ValidationError';
	}
}

// Timezone validator (basic check for IANA timezone format)
export function isValidTimezone(timezone: string): boolean {
	// Basic validation - checks for format like "America/New_York" or "UTC"
	return /^[A-Z][A-Za-z_\/]+$/.test(timezone) || timezone === 'UTC';
}

// UUID validator
export function isValidUUID(uuid: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

export function validateAgentRunMetadata(metadata: unknown): AgentRunJobMetadata {
	if (!metadata || typeof metadata !== 'object') {
		throw new ValidationError('metadata', metadata, 'object');
	}
	const meta = metadata as Record<string, unknown>;

	if (typeof meta.run_id !== 'string' || !isValidUUID(meta.run_id)) {
		throw new ValidationError('run_id', meta.run_id, 'valid UUID');
	}

	const triggers = ['chat', 'manual', 'scheduled', 'event'];
	if (typeof meta.trigger !== 'string' || !triggers.includes(meta.trigger)) {
		throw new ValidationError('trigger', meta.trigger, triggers.join(' | '));
	}

	if (meta.context_type !== 'global' && meta.context_type !== 'project') {
		throw new ValidationError('context_type', meta.context_type, 'global | project');
	}

	// A project-scoped run must name its project.
	if (
		meta.context_type === 'project' &&
		(typeof meta.project_id !== 'string' || !isValidUUID(meta.project_id))
	) {
		throw new ValidationError('project_id', meta.project_id, 'valid UUID for project context');
	}

	if (
		meta.scope_mode !== undefined &&
		meta.scope_mode !== 'read_only' &&
		meta.scope_mode !== 'read_write'
	) {
		throw new ValidationError('scope_mode', meta.scope_mode, 'read_only | read_write');
	}
	if (meta.effort !== undefined && meta.effort !== 'standard' && meta.effort !== 'deep') {
		throw new ValidationError('effort', meta.effort, 'standard | deep');
	}
	if (
		meta.run_template !== undefined &&
		meta.run_template !== 'agent' &&
		meta.run_template !== 'deep_research'
	) {
		throw new ValidationError('run_template', meta.run_template, 'agent | deep_research');
	}
	if (meta.run_template === 'deep_research') {
		if ((meta.depth ?? 0) !== 0) {
			throw new ValidationError('depth', meta.depth, '0 for deep_research');
		}
		if (meta.scope_mode !== 'read_only') {
			throw new ValidationError('scope_mode', meta.scope_mode, 'read_only for deep_research');
		}
		if (meta.effort !== 'deep') {
			throw new ValidationError('effort', meta.effort, 'deep for deep_research');
		}
		if (meta.parent_run_id !== undefined && meta.parent_run_id !== null) {
			throw new ValidationError(
				'parent_run_id',
				meta.parent_run_id,
				'null for deep_research'
			);
		}
	}

	// review on a read-only run is contradictory — there is nothing to stage (02 §3a).
	if (meta.review_required === true && meta.scope_mode === 'read_only') {
		throw new ValidationError(
			'review_required',
			meta.review_required,
			'review requires scope_mode=read_write'
		);
	}

	if (
		meta.allowed_ops !== undefined &&
		meta.allowed_ops !== null &&
		!Array.isArray(meta.allowed_ops)
	) {
		throw new ValidationError('allowed_ops', meta.allowed_ops, 'string[] | null');
	}
	if (
		Array.isArray(meta.allowed_ops) &&
		meta.allowed_ops.some((op) => typeof op !== 'string' || !op.trim())
	) {
		throw new ValidationError('allowed_ops', meta.allowed_ops, 'non-empty string[] | null');
	}

	if (
		meta.budgets !== undefined &&
		(!meta.budgets || typeof meta.budgets !== 'object' || Array.isArray(meta.budgets))
	) {
		throw new ValidationError('budgets', meta.budgets, 'object');
	}
	if (meta.budgets && typeof meta.budgets === 'object' && !Array.isArray(meta.budgets)) {
		const budgets = meta.budgets as Record<string, unknown>;
		for (const field of [
			'wall_clock_ms',
			'max_tokens',
			'max_tool_calls',
			'max_cost_usd'
		] as const) {
			const value = budgets[field];
			if (value === undefined) continue;
			if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
				throw new ValidationError(`budgets.${field}`, value, 'non-negative number');
			}
		}
		for (const field of ['max_tokens', 'max_tool_calls'] as const) {
			const value = budgets[field];
			if (value !== undefined && !Number.isInteger(value)) {
				throw new ValidationError(`budgets.${field}`, value, 'integer');
			}
		}
	}

	if (
		meta.depth !== undefined &&
		(typeof meta.depth !== 'number' || meta.depth < 0 || meta.depth > 1)
	) {
		throw new ValidationError('depth', meta.depth, '0 or 1');
	}
	if (
		meta.parent_run_id !== undefined &&
		meta.parent_run_id !== null &&
		(typeof meta.parent_run_id !== 'string' || !isValidUUID(meta.parent_run_id))
	) {
		throw new ValidationError('parent_run_id', meta.parent_run_id, 'valid UUID | null');
	}
	if (
		meta.depth === 1 &&
		(typeof meta.parent_run_id !== 'string' || !isValidUUID(meta.parent_run_id))
	) {
		throw new ValidationError('parent_run_id', meta.parent_run_id, 'valid UUID for depth 1');
	}

	if (
		meta.continuation_from !== undefined &&
		meta.continuation_from !== 'paused' &&
		meta.continuation_from !== 'needs_input' &&
		meta.continuation_from !== 'partial' &&
		meta.continuation_from !== 'children'
	) {
		throw new ValidationError(
			'continuation_from',
			meta.continuation_from,
			'paused | needs_input | partial | children'
		);
	}
	if (meta.continuation_from === 'children' && meta.run_template !== 'deep_research') {
		throw new ValidationError(
			'run_template',
			meta.run_template,
			'deep_research for continuation_from=children'
		);
	}
	if (
		meta.continuation_from === 'children' &&
		((meta.depth ?? 0) !== 0 ||
			meta.scope_mode !== 'read_only' ||
			meta.effort !== 'deep' ||
			(meta.parent_run_id !== undefined && meta.parent_run_id !== null))
	) {
		throw new ValidationError(
			'continuation_from',
			meta.continuation_from,
			'depth-0 read-only deep root continuation'
		);
	}

	return meta as unknown as AgentRunJobMetadata;
}

export function validateCycleQueueJobMetadata(metadata: unknown): CycleQueueJobMetadata {
	if (!metadata || typeof metadata !== 'object') {
		throw new ValidationError('metadata', metadata, 'object');
	}

	const meta = metadata as Record<string, unknown>;
	if (typeof meta.cycle_id !== 'string' || !isValidUUID(meta.cycle_id)) {
		throw new ValidationError('cycle_id', meta.cycle_id, 'valid UUID');
	}
	if (typeof meta.cycle_run_id !== 'string' || !isValidUUID(meta.cycle_run_id)) {
		throw new ValidationError('cycle_run_id', meta.cycle_run_id, 'valid UUID');
	}
	if (
		typeof meta.kind !== 'string' ||
		!CYCLE_KINDS.includes(meta.kind as (typeof CYCLE_KINDS)[number])
	) {
		throw new ValidationError('kind', meta.kind, 'valid CycleKind');
	}

	return meta as unknown as CycleQueueJobMetadata;
}
