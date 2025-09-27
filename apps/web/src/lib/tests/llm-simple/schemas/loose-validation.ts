// src/lib/tests/llm-simple/schemas/loose-validation.ts

import { expect } from 'vitest';
import type { BrainDumpParseResult, ParsedOperation } from '$lib/types/brain-dump';

/**
 * Loose validation focused on structure, not exact content
 * This approach is more resilient to LLM output variations
 */

/**
 * Validate basic brain dump result structure
 */
export function validateBrainDumpResult(result: BrainDumpParseResult): void {
	expect(result).toBeTruthy();
	expect(result.title).toBeTruthy();
	expect(result.operations).toBeInstanceOf(Array);
	expect(result.operations.length).toBeGreaterThan(0);
	expect(result.summary).toBeTruthy();
	expect(result.insights).toBeTruthy();
}

/**
 * Validate project creation operations (flexible)
 */
export function validateProjectCreation(operations: ParsedOperation[]): void {
	expect(operations).toHaveLength.toBeGreaterThan(0);

	// First operation should be project creation
	const projectOp = operations[0];
	expect(projectOp.table).toBe('projects');
	expect(projectOp.operation).toBe('create');
	expect(projectOp.data.name).toBeTruthy();
	expect(projectOp.data.slug).toBeTruthy();
	expect(projectOp.ref).toBeTruthy();

	// Should have at least one task
	const taskOps = operations.slice(1).filter((op) => op.table === 'tasks');
	expect(taskOps.length).toBeGreaterThan(0);

	// Validate task structure (loose)
	taskOps.forEach((task) => {
		expect(task.data.title).toBeTruthy();
		expect(task.data.project_ref).toBeTruthy();
	});
}

/**
 * Validate small project (2-4 operations total)
 */
export function validateSmallProject(result: BrainDumpParseResult): void {
	validateBrainDumpResult(result);
	validateProjectCreation(result.operations);
	expect(result.operations).toHaveLength.toBeLessThanOrEqual(4);
	expect(result.operations).toHaveLength.toBeGreaterThanOrEqual(2);
}

/**
 * Validate large project (8+ operations)
 */
export function validateLargeProject(result: BrainDumpParseResult): void {
	validateBrainDumpResult(result);
	validateProjectCreation(result.operations);
	expect(result.operations).toHaveLength.toBeGreaterThanOrEqual(8);

	// Large projects should have structured context
	const projectOp = result.operations[0];
	expect(projectOp.data.context).toBeTruthy();
	expect(projectOp.data.context.length).toBeGreaterThan(100);
}

/**
 * Validate single task creation scenario
 */
export function validateSingleTaskCreation(result: BrainDumpParseResult): void {
	validateBrainDumpResult(result);

	const taskOps = result.operations.filter((op) => op.table === 'tasks');
	expect(taskOps).toHaveLength(1);

	const taskOp = taskOps[0];
	expect(taskOp.data.title).toBeTruthy();
	expect(taskOp.data.details || taskOp.data.description).toBeTruthy();
}

/**
 * Validate multi-task creation (3-4 tasks)
 */
export function validateMultiTaskCreation(result: BrainDumpParseResult): void {
	validateBrainDumpResult(result);

	const taskOps = result.operations.filter((op) => op.table === 'tasks');
	expect(taskOps).toHaveLength.toBeGreaterThanOrEqual(3);
	expect(taskOps).toHaveLength.toBeLessThanOrEqual(4);

	taskOps.forEach((task) => {
		expect(task.data.title).toBeTruthy();
		expect(task.data.project_ref).toBeTruthy();
	});
}

/**
 * Validate existing project update operations
 */
export function validateExistingProjectUpdate(
	operations: ParsedOperation[],
	projectId?: string
): void {
	expect(operations).toHaveLength.toBeGreaterThan(0);

	operations.forEach((op) => {
		if (op.table === 'projects' && op.operation === 'update') {
			if (projectId) {
				expect(op.data.id || op.conditions?.id).toBe(projectId);
			}
		} else if (op.table === 'tasks') {
			expect(op.data.title).toBeTruthy();
			// For new tasks, should reference the project
			if (op.operation === 'create') {
				expect(op.data.project_id || op.data.project_ref).toBeTruthy();
			}
		}
	});
}

/**
 * Validate recurring task creation
 */
export function validateRecurringTask(operations: ParsedOperation[]): void {
	const recurringTasks = operations.filter(
		(op) => op.table === 'tasks' && op.data.task_type === 'recurring'
	);

	expect(recurringTasks.length).toBeGreaterThan(0);

	const validPatterns = [
		'daily',
		'weekdays',
		'weekly',
		'biweekly',
		'monthly',
		'quarterly',
		'yearly'
	];

	recurringTasks.forEach((task) => {
		expect(task.data.recurrence_pattern).toBeTruthy();
		expect(validPatterns).toContain(task.data.recurrence_pattern);
	});
}

/**
 * Validate operation IDs are properly formatted (loose check)
 */
export function validateOperationIds(operations: ParsedOperation[]): void {
	const ids = operations.map((op) => op.id).filter(Boolean);
	const uniqueIds = new Set(ids);

	// Should have unique IDs
	expect(uniqueIds.size).toBe(ids.length);

	// IDs should be strings
	ids.forEach((id) => {
		expect(typeof id).toBe('string');
		expect(id.length).toBeGreaterThan(0);
	});
}
