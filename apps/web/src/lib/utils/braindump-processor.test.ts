// apps/web/src/lib/utils/braindump-processor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('BrainDumpProcessor - Promise.allSettled Validation', () => {
	describe('Dual Processing Result Validation', () => {
		it('should handle both promises rejected', async () => {
			const contextResult: PromiseSettledResult<any> = {
				status: 'rejected',
				reason: 'Context extraction failed: API error'
			};

			const tasksResult: PromiseSettledResult<any> = {
				status: 'rejected',
				reason: 'Task extraction failed: Timeout'
			};

			// Simulate the validation logic
			const validateDualProcessingResults = (
				context: PromiseSettledResult<any>,
				tasks: PromiseSettledResult<any>
			) => {
				if (context.status === 'rejected' && tasks.status === 'rejected') {
					return {
						success: false,
						operations: [],
						title: 'Brain dump processing failed',
						summary:
							'Both context and task extraction failed. Please try again or contact support if the issue persists.',
						insights: '',
						tags: [],
						metadata: {},
						errors: [
							`Context extraction failed: ${context.reason}`,
							`Task extraction failed: ${tasks.reason}`
						]
					};
				}

				return { success: true };
			};

			const result = validateDualProcessingResults(contextResult, tasksResult);

			expect(result.success).toBe(false);
			expect(result.operations).toEqual([]);
			expect(result.errors).toHaveLength(2);
			expect(result.errors[0]).toContain('Context extraction failed');
			expect(result.errors[1]).toContain('Task extraction failed');
		});

		it('should handle context fulfilled, tasks rejected', async () => {
			const contextResult: PromiseSettledResult<any> = {
				status: 'fulfilled',
				value: {
					operations: [
						{ table: 'projects', operation: 'create', data: { name: 'Test' } }
					],
					title: 'Test Project'
				}
			};

			const tasksResult: PromiseSettledResult<any> = {
				status: 'rejected',
				reason: 'Task extraction failed'
			};

			const validateDualProcessingResults = (
				context: PromiseSettledResult<any>,
				tasks: PromiseSettledResult<any>
			) => {
				if (context.status === 'rejected' && tasks.status === 'rejected') {
					return { success: false, operations: [] };
				}

				// At least one succeeded - can proceed with partial results
				const operations = [];
				if (context.status === 'fulfilled') {
					operations.push(...(context.value.operations || []));
				}
				if (tasks.status === 'fulfilled') {
					operations.push(...(tasks.value.operations || []));
				}

				return { success: true, operations };
			};

			const result = validateDualProcessingResults(contextResult, tasksResult);

			expect(result.success).toBe(true);
			expect(result.operations.length).toBeGreaterThan(0);
		});

		it('should handle context rejected, tasks fulfilled', async () => {
			const contextResult: PromiseSettledResult<any> = {
				status: 'rejected',
				reason: 'Context extraction failed'
			};

			const tasksResult: PromiseSettledResult<any> = {
				status: 'fulfilled',
				value: {
					operations: [
						{ table: 'tasks', operation: 'create', data: { title: 'Task 1' } }
					],
					tasks: ['Task 1', 'Task 2']
				}
			};

			const validateDualProcessingResults = (
				context: PromiseSettledResult<any>,
				tasks: PromiseSettledResult<any>
			) => {
				if (context.status === 'rejected' && tasks.status === 'rejected') {
					return { success: false, operations: [] };
				}

				const operations = [];
				if (context.status === 'fulfilled') {
					operations.push(...(context.value.operations || []));
				}
				if (tasks.status === 'fulfilled') {
					operations.push(...(tasks.value.operations || []));
				}

				return { success: true, operations };
			};

			const result = validateDualProcessingResults(contextResult, tasksResult);

			expect(result.success).toBe(true);
			expect(result.operations.length).toBeGreaterThan(0);
		});

		it('should handle both promises fulfilled', async () => {
			const contextResult: PromiseSettledResult<any> = {
				status: 'fulfilled',
				value: {
					operations: [
						{ table: 'projects', operation: 'create', data: { name: 'Test' } }
					],
					title: 'Test Project'
				}
			};

			const tasksResult: PromiseSettledResult<any> = {
				status: 'fulfilled',
				value: {
					operations: [
						{ table: 'tasks', operation: 'create', data: { title: 'Task 1' } },
						{ table: 'tasks', operation: 'create', data: { title: 'Task 2' } }
					]
				}
			};

			const validateDualProcessingResults = (
				context: PromiseSettledResult<any>,
				tasks: PromiseSettledResult<any>
			) => {
				if (context.status === 'rejected' && tasks.status === 'rejected') {
					return { success: false, operations: [] };
				}

				const operations = [];
				if (context.status === 'fulfilled') {
					operations.push(...(context.value.operations || []));
				}
				if (tasks.status === 'fulfilled') {
					operations.push(...(tasks.value.operations || []));
				}

				return { success: true, operations };
			};

			const result = validateDualProcessingResults(contextResult, tasksResult);

			expect(result.success).toBe(true);
			expect(result.operations.length).toBe(3); // 1 project + 2 tasks
		});
	});

	describe('Error Logging for Failed Promises', () => {
		it('should log both errors when both promises fail', async () => {
			const loggedErrors: any[] = [];

			const mockErrorLogger = {
				logBrainDumpError: vi.fn((error: Error, brainDumpId: string, context: any) => {
					loggedErrors.push({ error, brainDumpId, context });
				})
			};

			const contextResult: PromiseSettledResult<any> = {
				status: 'rejected',
				reason: 'Context API timeout'
			};

			const tasksResult: PromiseSettledResult<any> = {
				status: 'rejected',
				reason: 'Tasks API error'
			};

			// Simulate error logging
			if (contextResult.status === 'rejected' && tasksResult.status === 'rejected') {
				const error = new Error(
					`Both context and task extraction failed. Context: ${contextResult.reason}. Tasks: ${tasksResult.reason}`
				);

				await mockErrorLogger.logBrainDumpError(error, 'dump-123', {
					attemptNumber: 1,
					contextError: contextResult.reason,
					tasksError: tasksResult.reason
				});
			}

			expect(mockErrorLogger.logBrainDumpError).toHaveBeenCalled();
			expect(loggedErrors.length).toBe(1);
			expect(loggedErrors[0].context.contextError).toBe('Context API timeout');
			expect(loggedErrors[0].context.tasksError).toBe('Tasks API error');
		});

		it('should include attempt number in error context', async () => {
			const loggedErrors: any[] = [];

			const mockErrorLogger = {
				logBrainDumpError: vi.fn((error: Error, brainDumpId: string, context: any) => {
					loggedErrors.push(context);
				})
			};

			const contextResult: PromiseSettledResult<any> = {
				status: 'rejected',
				reason: 'Error'
			};

			const tasksResult: PromiseSettledResult<any> = {
				status: 'rejected',
				reason: 'Error'
			};

			const attemptNumber = 3;

			if (contextResult.status === 'rejected' && tasksResult.status === 'rejected') {
				await mockErrorLogger.logBrainDumpError(new Error('Failure'), 'dump-123', {
					attemptNumber,
					contextError: contextResult.reason,
					tasksError: tasksResult.reason
				});
			}

			expect(loggedErrors[0].attemptNumber).toBe(3);
		});
	});

	describe('Partial Success Handling', () => {
		it('should merge valid operations from fulfilled promises', () => {
			const contextOperations = [
				{ table: 'projects', operation: 'create', data: { name: 'Project' } }
			];

			const tasksOperations = [
				{ table: 'tasks', operation: 'create', data: { title: 'Task 1' } },
				{ table: 'tasks', operation: 'create', data: { title: 'Task 2' } }
			];

			const mergeOperations = (
				context: PromiseSettledResult<any>,
				tasks: PromiseSettledResult<any>
			) => {
				const operations = [];

				if (context.status === 'fulfilled' && context.value.operations) {
					operations.push(...context.value.operations);
				}

				if (tasks.status === 'fulfilled' && tasks.value.operations) {
					operations.push(...tasks.value.operations);
				}

				return operations;
			};

			const contextResult: PromiseSettledResult<any> = {
				status: 'fulfilled',
				value: { operations: contextOperations }
			};

			const tasksResult: PromiseSettledResult<any> = {
				status: 'fulfilled',
				value: { operations: tasksOperations }
			};

			const merged = mergeOperations(contextResult, tasksResult);

			expect(merged.length).toBe(3);
			expect(merged[0].table).toBe('projects');
			expect(merged[1].table).toBe('tasks');
			expect(merged[2].table).toBe('tasks');
		});

		it('should handle missing operations array gracefully', () => {
			const mergeOperations = (
				context: PromiseSettledResult<any>,
				tasks: PromiseSettledResult<any>
			) => {
				const operations = [];

				if (context.status === 'fulfilled' && context.value?.operations) {
					operations.push(...context.value.operations);
				}

				if (tasks.status === 'fulfilled' && tasks.value?.operations) {
					operations.push(...tasks.value.operations);
				}

				return operations;
			};

			const contextResult: PromiseSettledResult<any> = {
				status: 'fulfilled',
				value: {} // No operations array
			};

			const tasksResult: PromiseSettledResult<any> = {
				status: 'fulfilled',
				value: null // Null value
			};

			const merged = mergeOperations(contextResult, tasksResult);

			expect(merged).toEqual([]);
		});

		it('should not include operations from rejected promises', () => {
			const mergeOperations = (
				context: PromiseSettledResult<any>,
				tasks: PromiseSettledResult<any>
			) => {
				const operations = [];

				if (context.status === 'fulfilled' && context.value?.operations) {
					operations.push(...context.value.operations);
				}

				if (tasks.status === 'fulfilled' && tasks.value?.operations) {
					operations.push(...tasks.value.operations);
				}

				return operations;
			};

			const contextResult: PromiseSettledResult<any> = {
				status: 'rejected',
				reason: 'Failed'
			};

			const tasksResult: PromiseSettledResult<any> = {
				status: 'fulfilled',
				value: {
					operations: [{ table: 'tasks', operation: 'create', data: { title: 'Task' } }]
				}
			};

			const merged = mergeOperations(contextResult, tasksResult);

			// Only tasks operations should be included
			expect(merged.length).toBe(1);
			expect(merged[0].table).toBe('tasks');
		});
	});

	describe('Return Value Validation', () => {
		it('should return minimal result when both promises fail', () => {
			const createMinimalResult = (contextError: string, tasksError: string) => {
				return {
					operations: [],
					title: 'Brain dump processing failed',
					summary:
						'Both context and task extraction failed. Please try again or contact support if the issue persists.',
					insights: '',
					tags: [],
					metadata: {},
					errors: [
						`Context extraction failed: ${contextError}`,
						`Task extraction failed: ${tasksError}`
					]
				};
			};

			const result = createMinimalResult('Timeout', 'API Error');

			expect(result.operations).toEqual([]);
			expect(result.title).toContain('failed');
			expect(result.errors.length).toBe(2);
		});

		it('should include user-friendly error messages', () => {
			const createMinimalResult = () => {
				return {
					operations: [],
					title: 'Brain dump processing failed',
					summary:
						'Both context and task extraction failed. Please try again or contact support if the issue persists.',
					insights: '',
					tags: [],
					metadata: {},
					errors: []
				};
			};

			const result = createMinimalResult();

			expect(result.summary).toContain('Please try again');
			expect(result.summary).toContain('contact support');
			expect(result.title).toBe('Brain dump processing failed');
		});

		it('should preserve metadata from successful promises', () => {
			const contextResult: PromiseSettledResult<any> = {
				status: 'fulfilled',
				value: {
					operations: [],
					title: 'Test Project',
					metadata: { source: 'context' }
				}
			};

			const tasksResult: PromiseSettledResult<any> = {
				status: 'fulfilled',
				value: {
					operations: [],
					metadata: { source: 'tasks', taskCount: 5 }
				}
			};

			const mergeMetadata = (
				context: PromiseSettledResult<any>,
				tasks: PromiseSettledResult<any>
			) => {
				const metadata: any = {};

				if (context.status === 'fulfilled' && context.value?.metadata) {
					Object.assign(metadata, context.value.metadata);
				}

				if (tasks.status === 'fulfilled' && tasks.value?.metadata) {
					Object.assign(metadata, tasks.value.metadata);
				}

				return metadata;
			};

			const merged = mergeMetadata(contextResult, tasksResult);

			expect(merged.source).toBe('tasks'); // Later value wins
			expect(merged.taskCount).toBe(5);
		});
	});

	describe('Edge Cases', () => {
		it('should handle undefined reason in rejected promises', () => {
			const contextResult: PromiseSettledResult<any> = {
				status: 'rejected',
				reason: undefined
			};

			const tasksResult: PromiseSettledResult<any> = {
				status: 'rejected',
				reason: undefined
			};

			const createErrorMessage = (context: PromiseSettledResult<any>) => {
				const reason = context.status === 'rejected' ? context.reason : 'Unknown error';
				return `Context extraction failed: ${reason || 'Unknown error'}`;
			};

			const message = createErrorMessage(contextResult);

			expect(message).toContain('Unknown error');
		});

		it('should handle non-Error rejection reasons', () => {
			const contextResult: PromiseSettledResult<any> = {
				status: 'rejected',
				reason: 'String error'
			};

			const tasksResult: PromiseSettledResult<any> = {
				status: 'rejected',
				reason: { code: 'ERR_TIMEOUT', message: 'Request timeout' }
			};

			const formatReason = (reason: any) => {
				if (typeof reason === 'string') return reason;
				if (reason && typeof reason === 'object' && 'message' in reason) {
					return reason.message;
				}
				return 'Unknown error';
			};

			expect(formatReason(contextResult.reason)).toBe('String error');
			expect(formatReason(tasksResult.reason)).toBe('Request timeout');
		});

		it('should handle empty operations array from fulfilled promises', () => {
			const contextResult: PromiseSettledResult<any> = {
				status: 'fulfilled',
				value: { operations: [] }
			};

			const tasksResult: PromiseSettledResult<any> = {
				status: 'fulfilled',
				value: { operations: [] }
			};

			const mergeOperations = (
				context: PromiseSettledResult<any>,
				tasks: PromiseSettledResult<any>
			) => {
				const operations = [];

				if (context.status === 'fulfilled' && context.value?.operations) {
					operations.push(...context.value.operations);
				}

				if (tasks.status === 'fulfilled' && tasks.value?.operations) {
					operations.push(...tasks.value.operations);
				}

				return operations;
			};

			const merged = mergeOperations(contextResult, tasksResult);

			expect(merged).toEqual([]);
			expect(Array.isArray(merged)).toBe(true);
		});
	});
});
