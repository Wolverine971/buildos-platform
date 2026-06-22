// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-failure.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildFailureKey,
	classifyToolFailure,
	isNotFoundFailure,
	isValidationFailure,
	parseInvalidArgumentFailure,
	parseRequiredParameterFailure
} from './tool-failure';

describe('tool failure classification', () => {
	it('classifies model-facing validation wrappers as missing required parameters', () => {
		const failure = classifyToolFailure({
			message: 'Tool validation failed: Missing required parameter: task_id',
			toolName: 'update_onto_task',
			canonicalOp: 'onto.task.update'
		});

		expect(failure).toMatchObject({
			kind: 'missing_required_parameter',
			toolName: 'update_onto_task',
			canonicalOp: 'onto.task.update',
			field: 'task_id',
			message: 'Tool validation failed: Missing required parameter: task_id',
			retryable: true,
			userRecoverable: true
		});
		expect(isValidationFailure(failure)).toBe(true);
	});

	it('parses required fields from direct tool errors', () => {
		expect(parseRequiredParameterFailure('Missing required parameter: document_id')).toBe(
			'document_id'
		);
		expect(classifyToolFailure('Missing required parameter: document_id')).toMatchObject({
			kind: 'missing_required_parameter',
			field: 'document_id'
		});
	});

	it('classifies invalid arguments as validation failures with a field', () => {
		const failure = classifyToolFailure('Invalid task_id: expected UUID');

		expect(failure).toMatchObject({
			kind: 'invalid_argument',
			field: 'task_id',
			retryable: true,
			userRecoverable: true
		});
		expect(parseInvalidArgumentFailure('Invalid task_id: expected UUID')).toBe('task_id');
		expect(isValidationFailure(failure)).toBe(true);
	});

	it('classifies not found errors and keeps generic missing compatibility', () => {
		expect(classifyToolFailure('Task not found')).toMatchObject({
			kind: 'not_found',
			retryable: true,
			userRecoverable: true
		});
		expect(isNotFoundFailure(classifyToolFailure('Task not found'))).toBe(true);
		expect(classifyToolFailure('Missing task record')).toMatchObject({
			kind: 'not_found'
		});
	});

	it('classifies permission and timeout errors', () => {
		expect(classifyToolFailure('permission denied')).toMatchObject({
			kind: 'permission',
			retryable: false,
			userRecoverable: true
		});
		expect(classifyToolFailure('timed out')).toMatchObject({
			kind: 'timeout',
			retryable: true,
			userRecoverable: false
		});
	});

	it('classifies unknown failures as execution failures', () => {
		expect(classifyToolFailure('unknown execution failure')).toMatchObject({
			kind: 'execution',
			retryable: false,
			userRecoverable: false
		});
	});

	it('builds stable failure keys from typed metadata', () => {
		const failure = classifyToolFailure({
			message: 'Missing required parameter: task_id',
			toolName: 'update_onto_task',
			canonicalOp: 'onto.task.update'
		});

		expect(failure ? buildFailureKey(failure) : null).toBe(
			'update_onto_task|onto.task.update|missing_required_parameter|task_id|Missing required parameter: task_id'
		);
	});
});
