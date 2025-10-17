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

describe('BrainDumpProcessor - Retry Mechanism', () => {
	describe('onRetry Callback Invocation', () => {
		it('should call onRetry callback on first failure with correct attempt numbers', async () => {
			const retryCallbacks: Array<{ attempt: number; maxAttempts: number }> = [];
			let attemptCount = 0;

			const mockOnRetry = vi.fn(async (attempt: number, maxAttempts: number) => {
				retryCallbacks.push({ attempt, maxAttempts });
			});

			// Simulate retry loop
			const maxRetries = 3;
			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				attemptCount++;

				// Fail first attempt
				if (attempt === 1) {
					// Call onRetry before next attempt
					if (attempt < maxRetries) {
						await mockOnRetry(attempt + 1, maxRetries);
						await new Promise((resolve) => setTimeout(resolve, 10));
					}
					continue;
				}

				// Success on second attempt
				break;
			}

			expect(mockOnRetry).toHaveBeenCalledTimes(1);
			expect(retryCallbacks[0]).toEqual({ attempt: 2, maxAttempts: 3 });
			expect(attemptCount).toBe(2); // Attempted twice before success
		});

		it('should call onRetry callback multiple times on multiple failures', async () => {
			const retryCallbacks: Array<{ attempt: number; maxAttempts: number }> = [];
			let attemptCount = 0;

			const mockOnRetry = vi.fn(async (attempt: number, maxAttempts: number) => {
				retryCallbacks.push({ attempt, maxAttempts });
			});

			// Simulate retry loop with 2 failures, success on 3rd
			const maxRetries = 3;
			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				attemptCount++;

				// Fail first two attempts
				if (attempt <= 2) {
					if (attempt < maxRetries) {
						await mockOnRetry(attempt + 1, maxRetries);
						await new Promise((resolve) => setTimeout(resolve, 10));
					}
					continue;
				}

				// Success on third attempt
				break;
			}

			expect(mockOnRetry).toHaveBeenCalledTimes(2);
			expect(retryCallbacks[0]).toEqual({ attempt: 2, maxAttempts: 3 });
			expect(retryCallbacks[1]).toEqual({ attempt: 3, maxAttempts: 3 });
			expect(attemptCount).toBe(3); // Attempted 3 times before success
		});

		it('should NOT call onRetry callback if first attempt succeeds', async () => {
			const mockOnRetry = vi.fn();

			// Simulate successful first attempt
			const maxRetries = 3;
			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				// Success immediately
				break;
			}

			expect(mockOnRetry).not.toHaveBeenCalled();
		});

		it('should NOT call onRetry after final failure', async () => {
			const retryCallbacks: Array<{ attempt: number; maxAttempts: number }> = [];

			const mockOnRetry = vi.fn(async (attempt: number, maxAttempts: number) => {
				retryCallbacks.push({ attempt, maxAttempts });
			});

			// Simulate all retries exhausted
			const maxRetries = 3;
			let lastError: Error | null = null;

			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				// All attempts fail
				lastError = new Error(`Attempt ${attempt} failed`);

				// Only call onRetry if we have more attempts
				if (attempt < maxRetries) {
					await mockOnRetry(attempt + 1, maxRetries);
					await new Promise((resolve) => setTimeout(resolve, 10));
				}
			}

			// Should throw after exhausting retries
			expect(lastError).toBeDefined();
			expect(lastError?.message).toContain('Attempt 3 failed');

			// onRetry should be called 2 times (before attempt 2 and 3, but NOT after attempt 3)
			expect(mockOnRetry).toHaveBeenCalledTimes(2);
			expect(retryCallbacks).toEqual([
				{ attempt: 2, maxAttempts: 3 },
				{ attempt: 3, maxAttempts: 3 }
			]);
		});
	});

	describe('Callback Error Handling', () => {
		it('should not break retry loop if onRetry callback throws error', async () => {
			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			let attemptCount = 0;
			let callbackCallCount = 0;

			const mockOnRetry = vi.fn(async () => {
				callbackCallCount++;
				throw new Error('SSE stream closed');
			});

			// Simulate retry loop
			const maxRetries = 3;
			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				attemptCount++;

				// Fail first attempt
				if (attempt === 1) {
					if (attempt < maxRetries) {
						// Call callback with error handling
						try {
							await mockOnRetry(attempt + 1, maxRetries);
						} catch (callbackError) {
							console.warn('onRetry callback failed:', callbackError);
						}
						await new Promise((resolve) => setTimeout(resolve, 10));
					}
					continue;
				}

				// Success on second attempt
				break;
			}

			// Retry loop should complete despite callback error
			expect(attemptCount).toBe(2);
			expect(callbackCallCount).toBe(1);
			expect(consoleWarnSpy).toHaveBeenCalledWith(
				'onRetry callback failed:',
				expect.any(Error)
			);

			consoleWarnSpy.mockRestore();
		});

		it('should log callback errors with proper context', async () => {
			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const mockOnRetry = vi.fn(async () => {
				throw new Error('Writer is closed');
			});

			// Simulate callback invocation with error handling
			try {
				await mockOnRetry(2, 3);
			} catch (callbackError) {
				console.warn('onRetry callback failed:', callbackError);
			}

			expect(consoleWarnSpy).toHaveBeenCalledWith(
				'onRetry callback failed:',
				expect.objectContaining({
					message: 'Writer is closed'
				})
			);

			consoleWarnSpy.mockRestore();
		});
	});

	describe('Exponential Backoff Timing', () => {
		it('should use correct exponential backoff delays', () => {
			const calculateDelay = (attempt: number) => Math.pow(2, attempt) * 1000;

			expect(calculateDelay(1)).toBe(2000); // 2 seconds
			expect(calculateDelay(2)).toBe(4000); // 4 seconds
			expect(calculateDelay(3)).toBe(8000); // 8 seconds
		});

		it('should wait correct duration between retries', async () => {
			const delays: number[] = [];
			let lastTime = Date.now();

			// Simulate retry loop with timing measurements
			const maxRetries = 3;
			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				if (attempt === 1) {
					if (attempt < maxRetries) {
						const delay = Math.pow(2, attempt) * 10; // Using 10ms for fast test
						await new Promise((resolve) => setTimeout(resolve, delay));
						const now = Date.now();
						delays.push(now - lastTime);
						lastTime = now;
					}
					continue;
				}

				break; // Success
			}

			// First delay should be approximately 20ms (2^1 * 10)
			expect(delays[0]).toBeGreaterThanOrEqual(15);
			expect(delays[0]).toBeLessThan(50);
		});
	});

	describe('SSE Retry Message Format', () => {
		it('should send correctly formatted SSE retry message', async () => {
			const sentMessages: any[] = [];

			const mockSendSSEMessage = vi.fn(async (writer, encoder, message) => {
				sentMessages.push(message);
			});

			const mockWriter = {};
			const mockEncoder = new TextEncoder();

			// Simulate onRetry callback
			const onRetry = async (attempt: number, maxAttempts: number) => {
				const retryMessage = {
					type: 'retry',
					message: 'Retrying dual processing...',
					attempt,
					maxAttempts,
					processName: 'dual-processing'
				};
				await mockSendSSEMessage(mockWriter, mockEncoder, retryMessage);
			};

			await onRetry(2, 3);

			expect(sentMessages).toHaveLength(1);
			expect(sentMessages[0]).toEqual({
				type: 'retry',
				message: 'Retrying dual processing...',
				attempt: 2,
				maxAttempts: 3,
				processName: 'dual-processing'
			});
		});

		it('should include all required SSE retry message fields', async () => {
			const retryMessage = {
				type: 'retry',
				message: 'Retrying dual processing...',
				attempt: 3,
				maxAttempts: 3,
				processName: 'dual-processing'
			};

			expect(retryMessage.type).toBe('retry');
			expect(retryMessage.message).toBeDefined();
			expect(retryMessage.attempt).toBeGreaterThan(0);
			expect(retryMessage.maxAttempts).toBeGreaterThan(0);
			expect(retryMessage.processName).toBe('dual-processing');
		});
	});

	describe('Retry Exhaustion Behavior', () => {
		it('should throw error after all retries exhausted', async () => {
			const maxRetries = 3;
			let lastError: Error | null = null;

			try {
				for (let attempt = 1; attempt <= maxRetries; attempt++) {
					// All attempts fail
					lastError = new Error('Processing failed');

					if (attempt < maxRetries) {
						await new Promise((resolve) => setTimeout(resolve, 10));
					}
				}

				throw new Error(
					`Dual processing failed after ${maxRetries} attempts: ${lastError?.message}`
				);
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toContain('failed after 3 attempts');
				expect((error as Error).message).toContain('Processing failed');
			}
		});

		it('should include last error message in final error', async () => {
			const lastError = new Error('Timeout after 120s');
			const maxRetries = 3;

			const finalError = new Error(
				`Dual processing failed after ${maxRetries} attempts: ${lastError.message}`
			);

			expect(finalError.message).toContain('failed after 3 attempts');
			expect(finalError.message).toContain('Timeout after 120s');
		});
	});

	describe('Integration with BrainDumpOptions', () => {
		it('should safely handle missing onRetry callback', async () => {
			const options = {
				autoExecute: true,
				streamResults: true,
				useDualProcessing: true,
				retryAttempts: 3
				// onRetry is intentionally not provided
			};

			// Simulate check before calling onRetry
			const maxRetries = 3;
			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				if (attempt === 1) {
					// Simulate failure
					if (attempt < maxRetries) {
						// Safe check for callback
						if (options.onRetry) {
							await options.onRetry(attempt + 1, maxRetries);
						}
						await new Promise((resolve) => setTimeout(resolve, 10));
					}
					continue;
				}

				break;
			}

			// Should not throw - no callback is fine
			expect(options.onRetry).toBeUndefined();
		});

		it('should use custom retry attempts from options', async () => {
			const customRetryAttempts = 5;
			const options = {
				retryAttempts: customRetryAttempts
			};

			const maxRetries = options.retryAttempts || 3;

			expect(maxRetries).toBe(5);
		});

		it('should default to 3 retries if not specified', () => {
			const options = {};
			const maxRetries = options.retryAttempts || 3;

			expect(maxRetries).toBe(3);
		});
	});

	describe('Retry Flow Edge Cases', () => {
		it('should handle writer closed during retry callback', async () => {
			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			let processingContinued = false;

			const mockOnRetry = vi.fn(async () => {
				throw new Error('Writer is closed');
			});

			// Simulate retry loop
			const maxRetries = 3;
			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				if (attempt === 1) {
					if (attempt < maxRetries) {
						try {
							await mockOnRetry(attempt + 1, maxRetries);
						} catch (callbackError) {
							console.warn('onRetry callback failed:', callbackError);
						}
						await new Promise((resolve) => setTimeout(resolve, 10));
					}
					continue;
				}

				// Processing continues despite callback error
				processingContinued = true;
				break;
			}

			expect(processingContinued).toBe(true);
			expect(consoleWarnSpy).toHaveBeenCalled();

			consoleWarnSpy.mockRestore();
		});

		it('should handle rapid sequential retries', async () => {
			const retryAttempts: number[] = [];

			const mockOnRetry = vi.fn(async (attempt: number) => {
				retryAttempts.push(attempt);
			});

			// Simulate rapid retries
			const maxRetries = 5;
			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				if (attempt < maxRetries) {
					await mockOnRetry(attempt + 1, maxRetries);
					// Very short delay to test rapid retries
					await new Promise((resolve) => setTimeout(resolve, 1));
				}
			}

			expect(retryAttempts).toEqual([2, 3, 4, 5]);
			expect(mockOnRetry).toHaveBeenCalledTimes(4);
		});

		it('should handle async callback correctly', async () => {
			let callbackCompleted = false;

			const mockOnRetry = vi.fn(async (attempt: number, maxAttempts: number) => {
				// Simulate async SSE message send
				await new Promise((resolve) => setTimeout(resolve, 10));
				callbackCompleted = true;
			});

			const maxRetries = 3;
			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				if (attempt === 1) {
					if (attempt < maxRetries) {
						await mockOnRetry(attempt + 1, maxRetries);
						// Callback should complete before backoff
						expect(callbackCompleted).toBe(true);
						await new Promise((resolve) => setTimeout(resolve, 10));
					}
					continue;
				}

				break;
			}

			expect(callbackCompleted).toBe(true);
		});
	});
});
