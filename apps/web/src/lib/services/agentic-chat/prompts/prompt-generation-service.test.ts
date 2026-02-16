// apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

import { PromptGenerationService } from './prompt-generation-service';

afterEach(() => {
	delete mockEnv.AGENTIC_CHAT_TOOL_GATEWAY;
});

describe('PromptGenerationService gateway tool instructions', () => {
	it('adds gateway discovery guidance when enabled', async () => {
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'true';
		const service = new PromptGenerationService();

		const prompt = await service.buildPlannerSystemPrompt({
			contextType: 'global'
		});

		expect(prompt).toContain('## Tool Discovery Mode');
		expect(prompt).toContain('Gateway query pattern (default)');
		expect(prompt).toContain(
			'For any onto.*.search op (including onto.search), use args.query.'
		);
		expect(prompt).toContain('Calendar events are under cal.event.* (not onto.event.*).');
		expect(prompt).not.toContain('tool_batch');
	});

	it('does not add gateway discovery guidance when disabled', async () => {
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'false';
		const service = new PromptGenerationService();

		const prompt = await service.buildPlannerSystemPrompt({
			contextType: 'global'
		});

		expect(prompt).not.toContain('## Tool Discovery Mode');
		expect(prompt).not.toContain('Gateway query pattern (default)');
	});
});
