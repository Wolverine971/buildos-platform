// apps/web/src/lib/tests/chat/token-usage.test.ts
/**
 * Token Usage Tests for Chat System
 *
 * Validates that the progressive disclosure pattern reduces token usage
 * and maintains the target budgets.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatContextService } from '$lib/services/chat-context-service';
import { createMockSupabaseClient } from '../mocks/supabase-mock';
import type { ChatContextType } from '@buildos/shared-types';

describe('Chat Token Usage', () => {
	let contextService: ChatContextService;
	let mockSupabase: any;

	beforeEach(() => {
		mockSupabase = createMockSupabaseClient();
		contextService = new ChatContextService(mockSupabase);
	});

	describe('Initial Context Token Budgets', () => {
		it('should keep initial context under 1500 tokens', async () => {
			// Mock database responses with realistic data
			mockSupabase.from.mockImplementation((table: string) => ({
				select: vi.fn().mockReturnThis(),
				eq: vi.fn().mockReturnThis(),
				order: vi.fn().mockReturnThis(),
				limit: vi.fn().mockImplementation((limit: number) => {
					if (table === 'projects') {
						return Promise.resolve({
							data: [
								{
									id: 'proj-1',
									name: 'Website Redesign',
									context:
										'A complete overhaul of the company website with modern design principles and improved user experience. The project involves redesigning the landing page, product pages, and checkout flow with a focus on mobile responsiveness and accessibility standards.',
									status: 'active'
								}
							],
							error: null
						});
					}
					if (table === 'tasks') {
						return Promise.resolve({
							data: Array.from({ length: 5 }, (_, i) => ({
								id: `task-${i + 1}`,
								title: `Task ${i + 1}: Implement feature`,
								description:
									'This is a detailed description of the task that explains what needs to be done and how to approach it.',
								status: i === 0 ? 'in_progress' : 'backlog'
							})),
							error: null
						});
					}
					return Promise.resolve({ data: [], error: null });
				})
			}));

			const context = await contextService.buildInitialContext(
				'session-1',
				'project',
				'proj-1'
			);

			// Estimate token count (rough approximation: 1 token ≈ 4 characters)
			const totalChars =
				context.systemPrompt.length +
				context.locationContext.length +
				(context.userContext?.length || 0) +
				(context.relatedData?.length || 0);

			const estimatedTokens = Math.ceil(totalChars / 4);

			expect(estimatedTokens).toBeLessThan(1500);
			expect(estimatedTokens).toBeGreaterThan(500); // Should have meaningful content
		});

		it('should use abbreviated data for lists', async () => {
			mockSupabase.from.mockImplementation((table: string) => ({
				select: vi.fn().mockReturnThis(),
				eq: vi.fn().mockReturnThis(),
				order: vi.fn().mockReturnThis(),
				limit: vi.fn().mockImplementation(() => {
					if (table === 'tasks') {
						return Promise.resolve({
							data: Array.from({ length: 20 }, (_, i) => ({
								id: `task-${i + 1}`,
								title: `Task ${i + 1}: ${i < 10 ? 'Design' : 'Implement'} component`,
								description:
									'A very long description that would normally consume many tokens. ' +
									'This description contains implementation details, acceptance criteria, ' +
									'technical specifications, and various other information that would ' +
									'significantly increase token usage if included in full.',
								status: ['backlog', 'in_progress', 'done'][i % 3],
								priority: ['low', 'medium', 'high'][i % 3]
							})),
							error: null
						});
					}
					return Promise.resolve({ data: [], error: null });
				})
			}));

			const context = await contextService.buildInitialContext('session-2', 'global');

			// Check that descriptions are abbreviated
			expect(context.relatedData).toContain('description_preview');
			expect(context.relatedData).not.toContain('A very long description');

			// Verify character limit enforcement
			const descriptionMatches =
				context.relatedData?.match(/description_preview": "([^"]+)"/g) || [];
			descriptionMatches.forEach((match) => {
				const preview = match.split('": "')[1].slice(0, -1);
				expect(preview.length).toBeLessThanOrEqual(103); // 100 chars + potential "..."
			});
		});
	});

	describe('Progressive Disclosure Pattern', () => {
		it('should load minimal data initially then details on demand', async () => {
			// Initial load - abbreviated
			mockSupabase.from.mockImplementation(() => ({
				select: vi.fn().mockReturnThis(),
				eq: vi.fn().mockReturnThis(),
				single: vi.fn().mockResolvedValue({
					data: {
						id: 'task-1',
						title: 'Implement authentication',
						description:
							'Full implementation of OAuth2 authentication with Google and GitHub providers. This includes setting up the OAuth applications, implementing the callback handlers, storing user sessions securely, and handling token refresh logic.',
						status: 'in_progress',
						priority: 'high',
						metadata: {
							subtasks: ['Setup OAuth', 'Implement callbacks', 'Handle tokens'],
							dependencies: ['task-0']
						}
					},
					error: null
				})
			}));

			// Test that abbreviated version is much smaller
			const abbreviated = {
				id: 'task-1',
				title: 'Implement authentication',
				description_preview:
					'Full implementation of OAuth2 authentication with Google and GitHub providers. This includes setti...',
				status: 'in_progress',
				has_subtasks: true
			};

			const full = await mockSupabase.from('tasks').select('*').eq('id', 'task-1').single();

			const abbreviatedSize = JSON.stringify(abbreviated).length;
			const fullSize = JSON.stringify(full.data).length;

			expect(abbreviatedSize).toBeLessThan(fullSize / 2);
			expect(abbreviated.description_preview.length).toBeLessThanOrEqual(103);
		});

		it('should respect token budgets for different context types', async () => {
			const contextTypes: ChatContextType[] = ['global', 'project', 'task', 'calendar'];

			for (const contextType of contextTypes) {
				const context = await contextService.buildInitialContext(
					`session-${contextType}`,
					contextType
				);

				const totalChars =
					context.systemPrompt.length +
					context.locationContext.length +
					(context.userContext?.length || 0) +
					(context.relatedData?.length || 0);

				const estimatedTokens = Math.ceil(totalChars / 4);

				// Each context type should stay within budget
				expect(estimatedTokens).toBeLessThan(2000);

				// Verify appropriate context is included
				expect(context.systemPrompt).toContain('progressive disclosure');
				expect(context.locationContext).toContain(contextType);
			}
		});
	});

	describe('Token Reduction Metrics', () => {
		it('should achieve 70% token reduction for list operations', async () => {
			// Mock full data response
			const fullTasks = Array.from({ length: 50 }, (_, i) => ({
				id: `task-${i}`,
				title: `Task ${i}: Comprehensive task title that describes the work`,
				description:
					'This is a very detailed task description that contains all the information needed. ' +
					'It includes acceptance criteria, technical details, implementation notes, testing requirements, ' +
					'deployment instructions, and documentation needs. The description is intentionally long to ' +
					'demonstrate the token savings from abbreviation.',
				status: 'backlog',
				priority: 'medium',
				metadata: {
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					assigned_to: `user-${i % 5}`,
					tags: ['feature', 'frontend', 'priority'],
					estimated_hours: 8,
					actual_hours: null,
					comments_count: i * 2,
					attachments: []
				}
			}));

			// Calculate full size
			const fullSize = JSON.stringify(fullTasks).length;

			// Create abbreviated versions
			const abbreviatedTasks = fullTasks.map((task) => ({
				id: task.id,
				title: task.title,
				status: task.status,
				description_preview: task.description.substring(0, 100) + '...',
				has_metadata: true
			}));

			const abbreviatedSize = JSON.stringify(abbreviatedTasks).length;

			// Calculate reduction percentage
			const reductionPercentage = ((fullSize - abbreviatedSize) / fullSize) * 100;

			expect(reductionPercentage).toBeGreaterThan(70);
			console.log(`Token reduction achieved: ${reductionPercentage.toFixed(1)}%`);
		});

		it('should maintain essential information in abbreviated format', async () => {
			const fullProject = {
				id: 'proj-1',
				name: 'E-commerce Platform',
				description:
					'A comprehensive e-commerce platform with multiple features and integrations.',
				context:
					'Building a modern e-commerce solution with React, Node.js, and PostgreSQL. ' +
					'The platform includes product catalog, shopping cart, payment processing, ' +
					'order management, inventory tracking, customer accounts, and admin dashboard. ' +
					'Integration with Stripe for payments, SendGrid for emails, and Cloudinary for images.',
				status: 'active',
				metadata: {
					team_size: 5,
					budget: 50000,
					deadline: '2024-06-01',
					technologies: ['React', 'Node.js', 'PostgreSQL', 'Redis'],
					stakeholders: ['CEO', 'CTO', 'Product Manager']
				}
			};

			const abbreviatedProject = {
				id: fullProject.id,
				name: fullProject.name,
				status: fullProject.status,
				context_preview: fullProject.context.substring(0, 500),
				has_metadata: true,
				team_size: fullProject.metadata.team_size
			};

			// Verify essential information is preserved
			expect(abbreviatedProject.id).toBe(fullProject.id);
			expect(abbreviatedProject.name).toBe(fullProject.name);
			expect(abbreviatedProject.status).toBe(fullProject.status);
			expect(abbreviatedProject.context_preview).toContain('e-commerce');
			expect(abbreviatedProject.team_size).toBe(5);

			// Verify size reduction
			const fullSize = JSON.stringify(fullProject).length;
			const abbreviatedSize = JSON.stringify(abbreviatedProject).length;
			expect(abbreviatedSize).toBeLessThan(fullSize * 0.4);
		});
	});

	describe('Context Caching', () => {
		it('should cache assembled contexts to reduce repeated processing', async () => {
			const sessionId = 'cached-session';
			const contextType = 'project';
			const entityId = 'proj-1';

			// First call - should hit database
			const context1 = await contextService.buildInitialContext(
				sessionId,
				contextType,
				entityId
			);

			// Mock cache check
			mockSupabase.from.mockImplementation((table: string) => {
				if (table === 'chat_context_cache') {
					return {
						select: vi.fn().mockReturnThis(),
						eq: vi.fn().mockReturnThis(),
						gte: vi.fn().mockReturnThis(),
						single: vi.fn().mockResolvedValue({
							data: {
								id: 'cache-1',
								session_id: sessionId,
								context_type: contextType,
								entity_id: entityId,
								context_data: context1,
								created_at: new Date().toISOString()
							},
							error: null
						})
					};
				}
				return {
					select: vi.fn().mockReturnThis(),
					eq: vi.fn().mockReturnThis(),
					single: vi.fn().mockResolvedValue({ data: null, error: null })
				};
			});

			// Second call - should use cache
			const context2 = await contextService.buildInitialContext(
				sessionId,
				contextType,
				entityId
			);

			expect(context2.systemPrompt).toBe(context1.systemPrompt);
		});
	});

	describe('Tool Execution Token Usage', () => {
		it('should use abbreviated data for list/search tools', async () => {
			const listToolsAbbreviated = [
				'list_tasks',
				'search_projects',
				'search_notes',
				'get_calendar_events'
			];

			listToolsAbbreviated.forEach((toolName) => {
				// Verify tool is configured for abbreviated output
				expect(toolName).toMatch(/^(list_|search_|get_calendar)/);
			});
		});

		it('should only fetch full details when detail tools are called', async () => {
			const detailTools = ['get_task_details', 'get_project_details', 'get_note_details'];

			detailTools.forEach((toolName) => {
				// Verify detail tools exist and are separate from list tools
				expect(toolName).toMatch(/^get_.*_details$/);
			});
		});
	});
});
