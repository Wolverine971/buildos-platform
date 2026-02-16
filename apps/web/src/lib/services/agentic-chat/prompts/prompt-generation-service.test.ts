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
		expect(prompt).toContain('Canonical ontology CRUD/search family');
		expect(prompt).toContain('In tool_exec.op, use only canonical ops.');
		expect(prompt).toContain('Never use legacy op strings in tool_exec.op');
		expect(prompt).toContain(
			'Use targeted discovery first: tool_help("onto.<entity>") or tool_help("cal.event").'
		);
		expect(prompt).toContain(
			'For first-time or complex writes in a turn, call tool_help("<exact op>", { format: "full", include_schemas: true }) before tool_exec.'
		);
		expect(prompt).toContain(
			'For any onto.*.search op (including onto.search), always pass args.query and include args.project_id when known.'
		);
		expect(prompt).toContain('Calendar ops are under cal.event.* and cal.project.*');
		expect(prompt).not.toContain('tool_batch');
	});

	it('does not add gateway discovery guidance when disabled', async () => {
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'false';
		const service = new PromptGenerationService();

		const prompt = await service.buildPlannerSystemPrompt({
			contextType: 'global'
		});

		expect(prompt).not.toContain('## Tool Discovery Mode');
		expect(prompt).not.toContain('Canonical ontology CRUD/search family');
	});
});
