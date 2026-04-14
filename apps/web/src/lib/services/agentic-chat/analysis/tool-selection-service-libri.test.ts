// apps/web/src/lib/services/agentic-chat/analysis/tool-selection-service-libri.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

import { ChatStrategy } from '$lib/types/agent-chat-enhancement';
import { getAllEnabledTools } from '$lib/services/agentic-chat/tools/core/tools.config';
import { ToolSelectionService } from './tool-selection-service';
import type { StrategyAnalyzer } from './strategy-analyzer';

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('ToolSelectionService Libri gating', () => {
	it('does not allow LLM selection to add Libri in calendar context', async () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');
		const analyzer = {
			analyzeUserIntent: vi.fn(async () => ({
				primary_strategy: ChatStrategy.PLANNER_STREAM,
				confidence: 0.9,
				reasoning: 'LLM requested Libri, but calendar context should not expose it.',
				needs_clarification: false,
				estimated_steps: 1,
				required_tools: [],
				can_complete_directly: true,
				tool_selection: {
					selected_tools: ['resolve_libri_resource'],
					reasoning: 'requested',
					is_fallback: false
				}
			})),
			estimateRequiredTools: vi.fn(() => [])
		} as unknown as StrategyAnalyzer;
		const service = new ToolSelectionService(analyzer);

		const result = await service.selectTools({
			message: 'tell me about James Clear',
			plannerContext: {
				systemPrompt: '',
				conversationHistory: [],
				locationContext: '',
				availableTools: getAllEnabledTools(),
				metadata: {
					sessionId: 'session-1',
					contextType: 'calendar',
					totalTokens: 0,
					hasOntology: false
				}
			},
			serviceContext: {
				sessionId: 'session-1',
				userId: 'user-1',
				contextType: 'calendar',
				conversationHistory: []
			},
			toolCatalog: getAllEnabledTools()
		});

		const names = result.tools.map((tool) => tool.function?.name).filter(Boolean);
		expect(names).not.toContain('resolve_libri_resource');
		expect(result.metadata.defaultToolNames).not.toContain('resolve_libri_resource');
		expect(analyzer.analyzeUserIntent).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				availableTools: expect.not.arrayContaining([
					expect.objectContaining({
						function: expect.objectContaining({ name: 'resolve_libri_resource' })
					})
				])
			}),
			expect.objectContaining({ contextType: 'calendar' }),
			undefined,
			undefined,
			expect.objectContaining({
				toolCatalog: expect.not.arrayContaining([
					expect.objectContaining({
						function: expect.objectContaining({ name: 'resolve_libri_resource' })
					})
				])
			})
		);
	});
});
