// apps/web/src/lib/tests/llm/schemas/validators.ts
// Flexible validation for LLM test outputs
import { expect } from 'vitest';
import type { BrainDumpParseResult, ParsedOperation } from '$lib/types';

// Validate project operation structure
export function validateProjectOperation(op: ParsedOperation) {
	expect(op).toHaveProperty('table', 'projects');
	expect(op).toHaveProperty('operation');
	expect(['create', 'update']).toContain(op.operation);
	expect(op.data).toHaveProperty('name');

	if (op.operation === 'create') {
		expect(op.data).toHaveProperty('slug');
		expect(op).toHaveProperty('ref');
		// Validate slug format
		expect(op.data.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
	}

	if (op.operation === 'update') {
		expect(op.data).toHaveProperty('id');
	}
}

// Validate task operation structure
export function validateTaskOperation(op: ParsedOperation) {
	expect(op).toHaveProperty('table', 'tasks');
	expect(op).toHaveProperty('operation');
	expect(['create', 'update']).toContain(op.operation);
	expect(op.data).toHaveProperty('title');

	if (op.operation === 'create') {
		// Should have either project_id or project_ref
		const hasProjectReference = op.data.project_id || op.data.project_ref;
		expect(hasProjectReference).toBeTruthy();

		// Check valid status values
		if (op.data.status) {
			expect(['backlog', 'in_progress', 'done', 'blocked']).toContain(op.data.status);
		}

		// Check valid priority values
		if (op.data.priority) {
			expect(['low', 'medium', 'high']).toContain(op.data.priority);
		}

		// Check recurring task fields
		if (op.data.task_type === 'recurring') {
			expect(op.data).toHaveProperty('recurrence_pattern');
			expect([
				'daily',
				'weekdays',
				'weekly',
				'biweekly',
				'monthly',
				'quarterly',
				'yearly'
			]).toContain(op.data.recurrence_pattern);
		}
	}

	if (op.operation === 'update') {
		expect(op.data).toHaveProperty('id');
	}
}

// Validate overall brain dump result structure
export function validateBrainDumpResult(result: BrainDumpParseResult) {
	expect(result).toBeDefined();
	expect(result).toHaveProperty('title');
	expect(result).toHaveProperty('operations');
	expect(result).toHaveProperty('summary');
	expect(result).toHaveProperty('insights');
	expect(Array.isArray(result.operations)).toBe(true);
}

// Validate small project (2-4 operations total)
export function validateSmallProject(result: BrainDumpParseResult) {
	validateBrainDumpResult(result);
	expect(result.operations.length).toBeGreaterThanOrEqual(2);
	expect(result.operations.length).toBeLessThanOrEqual(5);

	// First operation should be project creation
	validateProjectOperation(result.operations[0]!);

	// Rest should be tasks
	const taskOps = result.operations.slice(1);
	taskOps.forEach((op) => {
		expect(op.table).toBe('tasks');
	});
}

// Validate large project (8+ operations)
export function validateLargeProject(result: BrainDumpParseResult) {
	validateBrainDumpResult(result);
	expect(result.operations.length).toBeGreaterThanOrEqual(8);

	// First operation should be project creation
	validateProjectOperation(result.operations[0]!);

	// Should have substantial context
	const projectOp = result.operations[0]!;
	expect(projectOp.data.context).toBeDefined();
	expect(projectOp.data.context?.length || 0).toBeGreaterThan(200);
}

// Validate single task creation
export function validateSingleTaskCreation(result: BrainDumpParseResult) {
	validateBrainDumpResult(result);
	expect(result.operations.length).toBe(2); // 1 project + 1 task

	validateProjectOperation(result.operations[0]!);
	validateTaskOperation(result.operations[1]!);

	// Task should have details
	const taskOp = result.operations[1]!;
	expect(taskOp.data.details || taskOp.data.description).toBeDefined();
}

// Validate multi-task creation (3-4 tasks)
export function validateMultiTaskCreation(result: BrainDumpParseResult) {
	validateBrainDumpResult(result);

	const taskOps = result.operations.filter((op) => op.table === 'tasks');
	expect(taskOps.length).toBeGreaterThanOrEqual(3);
	expect(taskOps.length).toBeLessThanOrEqual(4);

	taskOps.forEach((op) => validateTaskOperation(op));
}

// Validate existing project update operations
export function validateExistingProjectOperations(
	operations: ParsedOperation[],
	expectedProjectId: string
) {
	operations.forEach((op) => {
		if (op.table === 'projects' && op.operation === 'update') {
			expect(op.data.id).toBe(expectedProjectId);
		}
		if (op.table === 'tasks' && op.operation === 'create') {
			expect(op.data.project_id).toBe(expectedProjectId);
		}
	});
}

// Validate recurring task
export function validateRecurringTask(op: ParsedOperation) {
	validateTaskOperation(op);
	expect(op.data.task_type).toBe('recurring');
	expect(op.data.recurrence_pattern).toBeDefined();
	expect(['daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']).toContain(
		op.data.recurrence_pattern
	);
}
