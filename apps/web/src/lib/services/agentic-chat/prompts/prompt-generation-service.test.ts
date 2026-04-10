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

		expect(prompt).toContain('## BuildOS Capabilities');
		expect(prompt).toContain('## Capability System');
		expect(prompt).toContain('## Skill Catalog');
		expect(prompt).toContain('## Tool Discovery Mode');
		expect(prompt).toContain('Think in three layers:');
		expect(prompt).toContain('1. Capability = what BuildOS can do for the user');
		expect(prompt).toContain(
			'project_creation: Project creation playbook for turning a user idea into the smallest valid BuildOS project payload with inferred name, type_key, props, and only the initial structure the user actually described.'
		);
		expect(prompt).toContain(
			'people_context: People context playbook for profile lookup, contact search and updates, candidate resolution, and safe handling of sensitive contact values.'
		);
		expect(prompt).toContain(
			'Start with the current context, BuildOS capabilities, and skill metadata to choose the most likely path before searching.'
		);
		expect(prompt).toContain(
			'If the workflow is multi-step or easy to get wrong, load the relevant skill first.'
		);
		expect(prompt).toContain(
			'Use the preloaded direct tools first whenever one already fits the job.'
		);
		expect(prompt).toContain(
			'Use tool_search only when the exact op is still unknown after context and skill guidance. Search for the operation you need, not workspace data.'
		);
		expect(prompt).toContain(
			'Good examples: {"capability":"overview"}, {"entity":"task","kind":"write","query":"update existing task state"}, or {"group":"onto","entity":"document","kind":"write","query":"move document in tree"}.'
		);
		expect(prompt).toContain(
			'Once you have an exact op, use tool_schema({ op: "<canonical op>" }) when the op is new in-turn or any write arguments are uncertain.'
		);
		expect(prompt).toContain(
			'After tool_schema, call the direct tool by name with concrete arguments. Do not route normal work through a generic executor.'
		);
		expect(prompt).toContain('Reuse exact IDs from context and prior tool results.');
		expect(prompt).toContain(
			'If required IDs or fields are still missing, resolve them with read/search ops or ask one concise question instead of guessing or sending incomplete writes.'
		);
		expect(prompt).not.toContain('Path heuristic:');
		expect(prompt).not.toContain('Good skill entry points:');
		expect(prompt).not.toContain('Canonical ontology CRUD/search family');
		expect(prompt).not.toContain('Gateway payload contract:');
		expect(prompt).not.toContain('Example update task:');
		expect(prompt).not.toContain('tool_batch');
	});

	it('does not add gateway discovery guidance when disabled', async () => {
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'false';
		const service = new PromptGenerationService();

		const prompt = await service.buildPlannerSystemPrompt({
			contextType: 'global'
		});

		expect(prompt).not.toContain('## Tool Discovery Mode');
		expect(prompt).not.toContain(
			'Use tool_search only when the exact op is still unknown after context and skill guidance.'
		);
	});
});
