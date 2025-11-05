// apps/web/src/lib/services/agentic-chat/persistence/agent-persistence-service.test.ts
/**
 * Test Suite for AgentPersistenceService
 *
 * Tests all database operations for the agentic chat system.
 * Uses mocked Supabase client to ensure isolated unit tests.
 *
 * @see {@link /apps/web/docs/features/agentic-chat/REFACTORING_SPEC.md}
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { AgentPersistenceService } from './agent-persistence-service';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { PersistenceError } from '../shared/types';

describe('AgentPersistenceService', () => {
	let service: AgentPersistenceService;
	let mockSupabase: {
		from: Mock;
		rpc: Mock;
	};
	let mockTable: {
		insert: Mock;
		update: Mock;
		select: Mock;
		delete: Mock;
		eq: Mock;
		lt: Mock;
		single: Mock;
		order: Mock;
		limit: Mock;
	};

	beforeEach(() => {
		// Setup mock table operations
		mockTable = {
			insert: vi.fn(() => mockTable),
			update: vi.fn(() => mockTable),
			select: vi.fn(() => mockTable),
			delete: vi.fn(() => mockTable),
			eq: vi.fn(() => mockTable),
			lt: vi.fn(() => mockTable),
			single: vi.fn(() => Promise.resolve({ data: null, error: null })),
			order: vi.fn(() => mockTable),
			limit: vi.fn(() => mockTable)
		};

		// Setup mock Supabase client
		mockSupabase = {
			from: vi.fn(() => mockTable),
			rpc: vi.fn()
		};

		service = new AgentPersistenceService(mockSupabase as unknown as SupabaseClient<Database>);
	});

	describe('Agent Operations', () => {
		describe('createAgent', () => {
			it('should create a new agent and return its ID', async () => {
				const agentData = {
					user_id: 'user_123',
					session_id: 'session_123',
					type: 'planner' as const,
					status: 'active' as const,
					name: 'Test Planner',
					model: 'deepseek-chat',
					system_prompt: 'You are a planner',
					available_tools: ['tool1', 'tool2']
				};

				const expectedId = 'agent_123';
				mockTable.single.mockResolvedValueOnce({
					data: { id: expectedId, ...agentData },
					error: null
				});

				const id = await service.createAgent(agentData);

				expect(id).toBe(expectedId);
				expect(mockSupabase.from).toHaveBeenCalledWith('agents');
				expect(mockTable.insert).toHaveBeenCalledWith(expect.objectContaining(agentData));
				expect(mockTable.select).toHaveBeenCalled();
				expect(mockTable.single).toHaveBeenCalled();
			});

			it('should throw PersistenceError on database error', async () => {
				const agentData = {
					user_id: 'user_123',
					session_id: 'session_123',
					type: 'planner' as const,
					status: 'active' as const,
					name: 'Test Planner'
				};

				mockTable.single.mockResolvedValueOnce({
					data: null,
					error: { message: 'Database error', code: 'DB001' }
				});

				await expect(service.createAgent(agentData)).rejects.toThrow(PersistenceError);
			});

			it('should include optional fields when provided', async () => {
				const agentData = {
					user_id: 'user_123',
					session_id: 'session_123',
					type: 'executor' as const,
					status: 'active' as const,
					name: 'Test Executor',
					model: 'deepseek-coder',
					parent_agent_id: 'parent_123',
					max_tokens: 1500,
					temperature: 0.7,
					metadata: { task: 'analyze' }
				};

				mockTable.single.mockResolvedValueOnce({
					data: { id: 'agent_456', ...agentData },
					error: null
				});

				await service.createAgent(agentData);

				expect(mockTable.insert).toHaveBeenCalledWith(
					expect.objectContaining({
						parent_agent_id: 'parent_123',
						max_tokens: 1500,
						temperature: 0.7,
						metadata: { task: 'analyze' }
					})
				);
			});
		});

		describe('updateAgent', () => {
			it('should update agent status', async () => {
				mockTable.single.mockResolvedValueOnce({
					data: { id: 'agent_123' },
					error: null
				});

				await service.updateAgent('agent_123', { status: 'completed' });

				expect(mockSupabase.from).toHaveBeenCalledWith('agents');
				expect(mockTable.update).toHaveBeenCalledWith(
					expect.objectContaining({ status: 'completed' })
				);
				expect(mockTable.eq).toHaveBeenCalledWith('id', 'agent_123');
			});

			it('should update agent error state', async () => {
				mockTable.single.mockResolvedValueOnce({
					data: { id: 'agent_123' },
					error: null
				});

				await service.updateAgent('agent_123', {
					status: 'error',
					error_message: 'Task failed',
					ended_at: new Date().toISOString()
				});

				expect(mockTable.update).toHaveBeenCalledWith(
					expect.objectContaining({
						status: 'error',
						error_message: 'Task failed'
					})
				);
			});

			it('should throw PersistenceError on update failure', async () => {
				mockTable.single.mockResolvedValueOnce({
					data: null,
					error: { message: 'Update failed' }
				});

				await expect(
					service.updateAgent('agent_123', { status: 'completed' })
				).rejects.toThrow(PersistenceError);
			});
		});

		describe('getAgent', () => {
			it('should retrieve agent by ID', async () => {
				const agentData = {
					id: 'agent_123',
					user_id: 'user_123',
					type: 'planner',
					status: 'active'
				};

				mockTable.single.mockResolvedValueOnce({
					data: agentData,
					error: null
				});

				const agent = await service.getAgent('agent_123');

				expect(agent).toEqual(agentData);
				expect(mockSupabase.from).toHaveBeenCalledWith('agents');
				expect(mockTable.select).toHaveBeenCalledWith('*');
				expect(mockTable.eq).toHaveBeenCalledWith('id', 'agent_123');
			});

			it('should return null for non-existent agent', async () => {
				mockTable.single.mockResolvedValueOnce({
					data: null,
					error: null
				});

				const agent = await service.getAgent('non_existent');

				expect(agent).toBeNull();
			});
		});
	});

	describe('Plan Operations', () => {
		describe('createPlan', () => {
			it('should create a new plan', async () => {
				const planData = {
					agent_id: 'agent_123',
					user_id: 'user_123',
					user_message: 'Create a project plan',
					strategy: 'complex' as const,
					steps: [
						{ stepNumber: 1, description: 'Analyze requirements' },
						{ stepNumber: 2, description: 'Create tasks' }
					],
					status: 'pending' as const
				};

				mockTable.single.mockResolvedValueOnce({
					data: { id: 'plan_123', ...planData },
					error: null
				});

				const id = await service.createPlan(planData);

				expect(id).toBe('plan_123');
				expect(mockSupabase.from).toHaveBeenCalledWith('agent_plans');
				expect(mockTable.insert).toHaveBeenCalledWith(
					expect.objectContaining({
						steps: planData.steps
					})
				);
			});

			it('should handle plan with metadata', async () => {
				const planData = {
					agent_id: 'agent_123',
					user_id: 'user_123',
					user_message: 'Complex analysis',
					strategy: 'complex' as const,
					steps: [],
					status: 'executing' as const,
					metadata: {
						estimatedDuration: 5000,
						requiredTools: ['tool1', 'tool2']
					}
				};

				mockTable.single.mockResolvedValueOnce({
					data: { id: 'plan_456', ...planData },
					error: null
				});

				await service.createPlan(planData);

				expect(mockTable.insert).toHaveBeenCalledWith(
					expect.objectContaining({
						metadata: planData.metadata
					})
				);
			});
		});

		describe('updatePlan', () => {
			it('should update plan status', async () => {
				mockTable.single.mockResolvedValueOnce({
					data: { id: 'plan_123' },
					error: null
				});

				await service.updatePlan('plan_123', {
					status: 'completed',
					completed_at: new Date().toISOString()
				});

				expect(mockTable.update).toHaveBeenCalledWith(
					expect.objectContaining({
						status: 'completed',
						completed_at: expect.any(String)
					})
				);
			});

			it('should update plan steps', async () => {
				const updatedSteps = [
					{ stepNumber: 1, status: 'completed', result: { data: 'result1' } },
					{ stepNumber: 2, status: 'executing' }
				];

				mockTable.single.mockResolvedValueOnce({
					data: { id: 'plan_123' },
					error: null
				});

				await service.updatePlan('plan_123', { steps: updatedSteps });

				expect(mockTable.update).toHaveBeenCalledWith(
					expect.objectContaining({ steps: updatedSteps })
				);
			});
		});

		describe('updatePlanStep', () => {
			it('should update a specific plan step', async () => {
				// First get the current plan
				const currentPlan = {
					id: 'plan_123',
					steps: [
						{ stepNumber: 1, status: 'completed', description: 'Step 1' },
						{ stepNumber: 2, status: 'pending', description: 'Step 2' },
						{ stepNumber: 3, status: 'pending', description: 'Step 3' }
					]
				};

				mockTable.single
					.mockResolvedValueOnce({ data: currentPlan, error: null }) // For getPlan
					.mockResolvedValueOnce({ data: { id: 'plan_123' }, error: null }); // For updatePlan

				await service.updatePlanStep('plan_123', 2, {
					status: 'completed',
					result: { success: true }
				});

				expect(mockTable.update).toHaveBeenCalledWith(
					expect.objectContaining({
						steps: expect.arrayContaining([
							currentPlan.steps[0],
							expect.objectContaining({
								stepNumber: 2,
								status: 'completed',
								description: 'Step 2',
								result: { success: true }
							}),
							currentPlan.steps[2]
						])
					})
				);
			});

			it('should throw error if step not found', async () => {
				const currentPlan = {
					id: 'plan_123',
					steps: [{ stepNumber: 1, status: 'completed', description: 'Step 1' }]
				};

				mockTable.single.mockResolvedValueOnce({ data: currentPlan, error: null });

				await expect(
					service.updatePlanStep('plan_123', 999, { status: 'completed' })
				).rejects.toThrow('Step 999 not found in plan');
			});
		});
	});

	describe('Session Operations', () => {
		describe('createChatSession', () => {
			it('should create a new chat session', async () => {
				const sessionData = {
					agent_id: 'agent_123',
					user_id: 'user_123',
					context: { contextType: 'project', entityId: 'proj_123' },
					status: 'active' as const,
					message_count: 0,
					total_tokens: 0
				};

				mockTable.single.mockResolvedValueOnce({
					data: { id: 'session_123', ...sessionData },
					error: null
				});

				const id = await service.createChatSession(sessionData);

				expect(id).toBe('session_123');
				expect(mockSupabase.from).toHaveBeenCalledWith('agent_chat_sessions');
			});
		});

		describe('updateChatSession', () => {
			it('should update session message count and tokens', async () => {
				mockTable.single.mockResolvedValueOnce({
					data: { id: 'session_123' },
					error: null
				});

				await service.updateChatSession('session_123', {
					message_count: 5,
					total_tokens: 1500
				});

				expect(mockTable.update).toHaveBeenCalledWith(
					expect.objectContaining({
						message_count: 5,
						total_tokens: 1500
					})
				);
			});

			it('should close session', async () => {
				mockTable.single.mockResolvedValueOnce({
					data: { id: 'session_123' },
					error: null
				});

				await service.updateChatSession('session_123', {
					status: 'completed',
					ended_at: new Date().toISOString()
				});

				expect(mockTable.update).toHaveBeenCalledWith(
					expect.objectContaining({
						status: 'completed',
						ended_at: expect.any(String)
					})
				);
			});
		});
	});

	describe('Message Operations', () => {
		describe('saveMessage', () => {
			it('should save a user message', async () => {
				const messageData = {
					session_id: 'session_123',
					agent_id: 'agent_123',
					user_id: 'user_123',
					role: 'user' as const,
					content: 'Hello, agent',
					metadata: { timestamp: Date.now() }
				};

				mockTable.single.mockResolvedValueOnce({
					data: { id: 'msg_123', ...messageData },
					error: null
				});

				const id = await service.saveMessage(messageData);

				expect(id).toBe('msg_123');
				expect(mockSupabase.from).toHaveBeenCalledWith('agent_chat_messages');
				expect(mockTable.insert).toHaveBeenCalledWith(expect.objectContaining(messageData));
			});

			it('should save an assistant message with tool calls', async () => {
				const messageData = {
					session_id: 'session_123',
					agent_id: 'agent_123',
					user_id: 'user_123',
					role: 'assistant' as const,
					content: 'Let me help you with that',
					tool_calls: [{ id: 'call_1', function: { name: 'search', arguments: '{}' } }]
				};

				mockTable.single.mockResolvedValueOnce({
					data: { id: 'msg_456', ...messageData },
					error: null
				});

				await service.saveMessage(messageData);

				expect(mockTable.insert).toHaveBeenCalledWith(
					expect.objectContaining({
						tool_calls: messageData.tool_calls
					})
				);
			});
		});

		describe('getMessages', () => {
			it('should retrieve messages for a session', async () => {
				const messages = [
					{ id: 'msg_1', role: 'user', content: 'Hello' },
					{ id: 'msg_2', role: 'assistant', content: 'Hi there' },
					{ id: 'msg_3', role: 'user', content: 'How are you?' }
				];

				// Mock the promise resolution directly
				mockTable.limit.mockResolvedValueOnce({
					data: messages,
					error: null
				});

				const result = await service.getMessages('session_123');

				expect(result).toEqual(messages);
				expect(mockSupabase.from).toHaveBeenCalledWith('agent_chat_messages');
				expect(mockTable.select).toHaveBeenCalledWith('*');
				expect(mockTable.eq).toHaveBeenCalledWith('session_id', 'session_123');
				expect(mockTable.order).toHaveBeenCalledWith('created_at', { ascending: true });
				expect(mockTable.limit).toHaveBeenCalledWith(50);
			});

			it('should apply custom limit', async () => {
				mockTable.limit.mockResolvedValueOnce({
					data: [],
					error: null
				});

				await service.getMessages('session_123', 100);

				expect(mockTable.limit).toHaveBeenCalledWith(100);
			});

			it('should handle empty result', async () => {
				mockTable.limit.mockResolvedValueOnce({
					data: [],
					error: null
				});

				const result = await service.getMessages('session_123');

				expect(result).toEqual([]);
			});
		});
	});

	describe('Transaction Support', () => {
		it('should execute operations in transaction when available', async () => {
			// This would require a more complex mock setup for transactions
			// For now, we verify that the service can handle transaction context
			expect(service).toHaveProperty('executeInTransaction');
		});
	});

	describe('Error Handling', () => {
		it('should handle network errors gracefully', async () => {
			mockTable.single.mockRejectedValueOnce(new Error('Network error'));

			await expect(
				service.createAgent({
					user_id: 'user_123',
					session_id: 'session_123',
					type: 'planner',
					status: 'active'
				})
			).rejects.toThrow('Network error');
		});

		it('should provide meaningful error messages', async () => {
			mockTable.single.mockResolvedValueOnce({
				data: null,
				error: {
					message: 'unique constraint violation',
					code: '23505',
					details: 'Key already exists'
				}
			});

			try {
				await service.createAgent({
					user_id: 'user_123',
					session_id: 'session_123',
					type: 'planner',
					status: 'active'
				});
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error).toBeInstanceOf(PersistenceError);
				if (error instanceof PersistenceError) {
					expect(error.code).toBe('PERSISTENCE_ERROR');
					expect(error.details).toHaveProperty('operation', 'createAgent');
				}
			}
		});
	});

	describe('Cleanup Operations', () => {
		it('should clean up old sessions', async () => {
			// Mock the delete chain to return a promise
			const deleteResult = Promise.resolve({
				data: null,
				error: null
			});

			// Override eq to return the result
			mockTable.eq.mockReturnValueOnce(deleteResult);

			await service.cleanupOldSessions(30); // 30 days

			expect(mockSupabase.from).toHaveBeenCalledWith('agent_chat_sessions');
			expect(mockTable.delete).toHaveBeenCalled();
			expect(mockTable.lt).toHaveBeenCalled();
			expect(mockTable.eq).toHaveBeenCalledWith('status', 'completed');
		});
	});
});
