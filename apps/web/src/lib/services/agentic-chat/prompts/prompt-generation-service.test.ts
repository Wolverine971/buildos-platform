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
			'Use targeted discovery first unless the exact op and args are already known in-turn.'
		);
		expect(prompt).toContain(
			'Fetch a skill only when the workflow is multi-step, stateful, or easy to get wrong.'
		);
		expect(prompt).toContain(
			'Good skill entry points: calendar/event work or project calendar mapping -> cal.skill; project document tree, unlinked docs, or task docs -> onto.document.skill; plan creation or plan restructuring -> onto.plan.skill.'
		);
		expect(prompt).toContain('contacts -> util.contact');
		expect(prompt).toContain(
			'User profile context is NOT preloaded. If personalization is needed, call tool_help({ path: "util.profile" }) and then util.profile.overview.'
		);
		expect(prompt).toContain('Contact method values are sensitive and redacted by default.');
		expect(prompt).toContain(
			'For first-time or complex writes in a turn, call tool_help({ path: "<exact op>", format: "full", include_schemas: true }) before tool_exec.'
		);
		expect(prompt).toContain(
			'Gateway payload contract: tool_help({ path: "<path>", format?: "short|full", include_schemas?: boolean }) and tool_exec({ op: "<canonical op>", args: { ... } }).'
		);
		expect(prompt).toContain(
			'CRUD ID contract: onto.<entity>.get|update|delete require args.<entity>_id as an exact UUID.'
		);
		expect(prompt).toContain(
			'Example update task: tool_exec({ op: "onto.task.update", args: { task_id: "11111111-1111-4111-8111-111111111111", title: "Updated title" } }).'
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
