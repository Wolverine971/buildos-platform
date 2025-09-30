// apps/web/src/lib/utils/__tests__/brain-dump-processor.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BrainDumpOptions, BrainDumpProcessor } from '../braindump-processor';
// import type { BrainDumpOptions, ProjectWithRelations } from
// import type {
// 	ProjectWithRelations,
// } from '$lib/types/project';

// Mock dependencies
vi.mock('$lib/services/llm-pool', () => ({
	LLMPool: vi.fn().mockImplementation(() => ({
		makeRequest: vi.fn(),
		close: vi.fn()
	}))
}));

vi.mock('../activityLogger', () => ({
	ActivityLogger: vi.fn().mockImplementation(() => ({
		logActivity: vi.fn().mockResolvedValue(undefined)
	}))
}));

vi.mock('../operations-executor', () => ({
	OperationsExecutor: vi.fn().mockImplementation(() => ({
		executeOperations: vi.fn()
	})),
	OperationValidator: vi.fn().mockImplementation(() => ({
		validateOperation: vi.fn().mockReturnValue({ isValid: true, sanitizedData: {} })
	}))
}));

vi.mock('$lib/services/promptTemplate.service', () => ({
	PromptTemplateService: vi.fn().mockImplementation(() => ({
		getOptimizedNewProjectPrompt: vi.fn().mockReturnValue('New project prompt template'),
		getOptimizedExistingProjectPrompt: vi
			.fn()
			.mockReturnValue('Existing project prompt template'),
		getIntegratedQuestionsPrompt: vi.fn().mockReturnValue('Questions prompt template'),
		getTaskExtractionWithContextDecisionPrompt: vi
			.fn()
			.mockReturnValue('Task extraction with context decision prompt'),
		getTaskExtractionWithQuestionsPrompt: vi
			.fn()
			.mockReturnValue('Task extraction with questions prompt'),
		getProjectContextPrompt: vi.fn().mockReturnValue('Project context prompt template'),
		getTaskExtractionPrompt: vi.fn().mockReturnValue('Task extraction prompt template')
	}))
}));

type MockLLMPool = {
	makeRequest: ReturnType<typeof vi.fn>;
};

type MockActivityLogger = {
	logActivity: ReturnType<typeof vi.fn>;
};

type MockOperationsExecutor = {
	executeOperations: ReturnType<typeof vi.fn>;
};

// Mock Supabase client to match the expected interface
const createMockSupabase = () =>
	({
		from: vi.fn().mockReturnThis(),
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue({ data: null, error: null }),
		order: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis()
	}) as any; // Using any for test mocking convenience

describe('BrainDumpProcessor', () => {
	let processor: BrainDumpProcessor;
	let mockLLMPool: MockLLMPool;
	let mockActivityLogger: MockActivityLogger;
	let mockOperationsExecutor: MockOperationsExecutor;
	let mockSupabase: ReturnType<typeof createMockSupabase>;

	beforeEach(() => {
		// Setup mock Supabase client
		mockSupabase = createMockSupabase();

		// Create processor instance
		processor = new BrainDumpProcessor(mockSupabase);

		// Access mocked services
		mockLLMPool = (processor as unknown as { llmPool: MockLLMPool }).llmPool;
		mockActivityLogger = (processor as unknown as { activityLogger: MockActivityLogger })
			.activityLogger;
		mockOperationsExecutor = (
			processor as unknown as { operationsExecutor: MockOperationsExecutor }
		).operationsExecutor;
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('processBrainDump', () => {
		const mockUserId = 'test-user-123';
		const mockBrainDump = 'Create a new project for building a mobile app with React Native';

		it('should process a brain dump for a new project', async () => {
			// Setup mock LLM response for new project
			const mockLLMResponse = {
				result: {
					title: 'Mobile App Development',
					summary: 'React Native mobile app project',
					insights: 'User wants to build a mobile application',
					operations: [
						{
							table: 'projects',
							operation: 'create',
							data: {
								name: 'Mobile App Project',
								description: 'React Native mobile application',
								context:
									'## Project Overview\nBuilding a mobile app with React Native',
								executive_summary: 'Mobile app development project',
								tags: ['mobile', 'react-native'],
								status: 'active'
							}
						}
					]
				}
			};

			mockLLMPool.makeRequest.mockResolvedValue(mockLLMResponse);

			const options: BrainDumpOptions = {
				autoExecute: false,
				streamResults: false
			};

			const result = await processor.processBrainDump({
				brainDump: mockBrainDump,
				userId: mockUserId,
				options,
				brainDumpId: 'test-brain-dump-id-1'
			});

			// Assertions
			expect(result).toBeDefined();
			expect(result.operations).toHaveLength(1);
			expect(result.operations[0].table).toBe('projects');
			expect(result.operations[0].operation).toBe('create');
			expect(result.title).toBe('Mobile App Development');
			expect(result.summary).toBe('React Native mobile app project');

			// Verify LLM was called
			expect(mockLLMPool.makeRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: mockUserId,
					responseFormat: 'json',
					temperature: 0.3
				})
			);

			// Verify activity logging
			expect(mockActivityLogger.logActivity).toHaveBeenCalledWith(
				mockUserId,
				'brain_dump_processing_started',
				expect.any(Object)
			);
		});

		it('should process a brain dump for an existing project', async () => {
			const mockProjectId = 'existing-project-123';
			const mockExistingProject: Partial<ProjectWithRelations> = {
				id: mockProjectId,
				name: 'Existing Project',
				status: 'active',
				context: '## Current Context\nThis is an existing project',
				executive_summary: 'Existing project summary',
				tags: ['existing'],
				tasks: [],
				notes: [],
				phases: []
			};

			// Mock project data fetching
			mockSupabase.single.mockResolvedValueOnce({
				data: mockExistingProject,
				error: null
			});

			// Mock tasks fetching
			mockSupabase.order.mockResolvedValueOnce({
				data: [],
				error: null
			});

			// For existing projects, synthesis API returns operations array
			const mockSynthesisResponse = {
				result: {
					title: 'Update for existing project',
					summary: 'Adding authentication feature',
					insights: 'User wants to add authentication',
					operations: [
						{
							table: 'tasks',
							operation: 'create',
							data: {
								title: 'Implement authentication',
								description: 'Add authentication feature',
								status: 'pending',
								priority: 'high',
								project_id: mockProjectId
							}
						}
					]
				}
			};

			mockLLMPool.makeRequest.mockResolvedValueOnce(mockSynthesisResponse);

			const options: BrainDumpOptions = {
				autoExecute: false,
				streamResults: false
			};

			const result = await processor.processBrainDump({
				brainDump: 'Add authentication feature to the project',
				userId: mockUserId,
				selectedProjectId: mockProjectId,
				options,
				brainDumpId: 'test-brain-dump-id-2'
			});

			// Assertions
			expect(result).toBeDefined();
			expect(result.operations).toHaveLength(1);
			expect(result.operations[0].table).toBe('tasks');
			expect(result.operations[0].operation).toBe('create');
		});

		it('should use dual processing for large brain dumps', async () => {
			const largeBrainDump = 'a'.repeat(3000); // Create a large brain dump

			// Mock responses for dual processing
			const mockContextResponse = {
				result: {
					title: 'Large Project',
					summary: 'Processing large brain dump',
					insights: 'Complex project with multiple aspects',
					projectCreate: {
						name: 'Large Project',
						description: 'A complex project',
						context: '## Project Context\nDetailed project information',
						executive_summary: 'Large scale project',
						tags: ['complex'],
						status: 'active'
					}
				}
			};

			const mockTasksResponse = {
				result: {
					tasks: [
						{
							title: 'Task 1',
							description: 'First task',
							status: 'pending',
							priority: 'high'
						},
						{
							title: 'Task 2',
							description: 'Second task',
							status: 'pending',
							priority: 'medium'
						}
					],
					notes: [
						{
							title: 'Note 1',
							content: 'Important note'
						}
					]
				}
			};

			mockLLMPool.makeRequest
				.mockResolvedValueOnce(mockContextResponse)
				.mockResolvedValueOnce(mockTasksResponse);

			const options: BrainDumpOptions = {
				autoExecute: false,
				streamResults: false,
				useDualProcessing: true
			};

			const result = await processor.processBrainDump({
				brainDump: largeBrainDump,
				userId: mockUserId,
				options,
				brainDumpId: 'test-brain-dump-id-3'
			});

			// Assertions
			expect(result).toBeDefined();
			expect(result.operations).toBeDefined();
			expect(result.operations.length).toBeGreaterThan(0);

			// Verify dual processing was triggered
			expect(mockLLMPool.makeRequest).toHaveBeenCalledTimes(2);
			expect(mockActivityLogger.logActivity).toHaveBeenCalledWith(
				mockUserId,
				'brain_dump_dual_processing_started',
				expect.any(Object)
			);
		}, 10000);
	});

	describe('error handling', () => {
		const mockUserId = 'test-user-123';

		it('should handle LLM request failures gracefully', async () => {
			// Mock LLM failure
			mockLLMPool.makeRequest.mockRejectedValue(new Error('LLM service unavailable'));

			const options: BrainDumpOptions = {
				autoExecute: false,
				streamResults: false
			};

			await expect(
				processor.processBrainDump({
					brainDump: 'Test brain dump',
					userId: mockUserId,
					options,
					brainDumpId: 'test-brain-dump-id-4'
				})
			).rejects.toThrow('Brain dump processing failed');

			// Verify error logging
			expect(mockActivityLogger.logActivity).toHaveBeenCalledWith(
				mockUserId,
				'brain_dump_processing_failed',
				expect.objectContaining({
					error: expect.stringContaining('LLM service unavailable')
				})
			);
		});

		it('should handle invalid JSON responses from LLM', async () => {
			// Mock invalid JSON response
			mockLLMPool.makeRequest.mockResolvedValue({
				result: 'invalid json string'
			});

			const options: BrainDumpOptions = {
				autoExecute: false,
				streamResults: false
			};

			await expect(
				processor.processBrainDump({
					brainDump: 'Test brain dump',
					userId: mockUserId,
					options,
					brainDumpId: 'test-brain-dump-id-5'
				})
			).rejects.toThrow();
		});

		it('should retry dual processing on failure', async () => {
			// First attempt fails, second succeeds
			const mockContextResponse = {
				result: {
					title: 'Retry Test',
					summary: 'Testing retry logic',
					insights: 'Retry mechanism test',
					operations: [
						{
							table: 'projects',
							operation: 'create',
							data: {
								name: 'Retry Project',
								description: 'Testing retries',
								context: '## Retry Test',
								executive_summary: 'Retry test project',
								tags: ['test'],
								status: 'active'
							}
						}
					]
				}
			};

			const mockTasksResponse = {
				result: {
					operations: [],
					tasks: [],
					notes: []
				}
			};

			// First attempt fails
			mockLLMPool.makeRequest
				.mockRejectedValueOnce(new Error('Temporary failure'))
				// Skip task extraction when context fails
				// Second attempt succeeds
				.mockResolvedValueOnce(mockContextResponse)
				.mockResolvedValueOnce(mockTasksResponse);

			const options: BrainDumpOptions = {
				autoExecute: false,
				streamResults: false,
				useDualProcessing: true,
				retryAttempts: 2
			};

			const result = await processor.processBrainDump({
				brainDump: 'a'.repeat(3000), // Large dump to trigger dual processing
				userId: mockUserId,
				options,
				brainDumpId: 'test-brain-dump-id-6'
			});

			// Should succeed after retry
			expect(result).toBeDefined();
			expect(result.operations).toBeDefined();
			expect(result.operations.length).toBeGreaterThanOrEqual(0);

			// Verify retry logging
			expect(mockActivityLogger.logActivity).toHaveBeenCalledWith(
				mockUserId,
				'brain_dump_dual_processing_retry',
				expect.objectContaining({
					attempt: 1
				})
			);
		}, 10000);
	});

	describe('auto-execution', () => {
		const mockUserId = 'test-user-123';

		it('should auto-execute operations when enabled', async () => {
			// Setup mock LLM response
			const mockLLMResponse = {
				result: {
					title: 'Auto Execute Test',
					summary: 'Testing auto execution',
					insights: 'Auto execution test',
					operations: [
						{
							table: 'projects',
							operation: 'create',
							data: {
								name: 'Auto Execute Project',
								description: 'Testing auto execution',
								status: 'active'
							}
						}
					]
				}
			};

			mockLLMPool.makeRequest.mockResolvedValue(mockLLMResponse);

			// Mock successful execution
			mockOperationsExecutor.executeOperations.mockResolvedValue({
				successful: [{ id: 'op-1', result: { id: 'created-project-id' } }],
				failed: []
			});

			const options: BrainDumpOptions = {
				autoExecute: true,
				streamResults: false
			};

			const result = await processor.processBrainDump({
				brainDump: 'Create a test project',
				userId: mockUserId,
				options,
				brainDumpId: 'test-brain-dump-id-7'
			});

			// Assertions
			expect(result).toBeDefined();
			expect(result.operations).toBeDefined();
			expect(result.operations).toHaveLength(1);

			// Verify operations were executed with brainDumpId
			expect(mockOperationsExecutor.executeOperations).toHaveBeenCalled();
			const callArgs = mockOperationsExecutor.executeOperations.mock.calls[0][0];
			expect(callArgs.operations).toBeInstanceOf(Array);
			expect(callArgs.brainDumpId).toBe('test-brain-dump-id-7');
			expect(callArgs.userId).toBe(mockUserId);
		});
	});

	describe('threshold calculation', () => {
		it('should calculate dual processing threshold correctly', async () => {
			// Import the shared threshold function and constants dynamically
			const thresholdModule = await import('$lib/constants/brain-dump-thresholds');
			const { shouldUseDualProcessing, BRAIN_DUMP_THRESHOLDS } = thresholdModule;

			// Test small brain dump
			const smallResult = shouldUseDualProcessing(20, 0);
			expect(smallResult).toBe(false);

			// Test large brain dump (threshold is 500)
			const largeResult = shouldUseDualProcessing(550, 0);
			expect(largeResult).toBe(true);

			// Test with existing project context
			// 450 + 400 = 850, which exceeds combined threshold of 800
			const combinedResult = shouldUseDualProcessing(450, 400);
			expect(combinedResult).toBe(true);

			// Verify the thresholds are as expected
			expect(BRAIN_DUMP_THRESHOLDS.BRAIN_DUMP_THRESHOLD).toBe(500);
			expect(BRAIN_DUMP_THRESHOLDS.COMBINED_THRESHOLD).toBe(800);
		});
	});
});
