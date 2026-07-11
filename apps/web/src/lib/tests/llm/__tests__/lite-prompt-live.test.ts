// apps/web/src/lib/tests/llm/__tests__/lite-prompt-live.test.ts
//
// ⚠️ Live LLM smoke tests — every test makes a REAL OpenRouter API call and
// costs money. Excluded from `pnpm test`; run explicitly with `pnpm test:llm`.
//
// These validate that the CURRENT lite_seed_v1 prompts (post prompt-quality
// audit 2026-07-10) still steer the production default model correctly:
// tool selection on the project_create fork, grounded answers on global,
// and the final-response contract (no phantom headers, no prompt echo).
import { describe, expect, it } from 'vitest';
import { PRIVATE_OPENROUTER_API_KEY } from '$env/static/private';
import { getDefaultToolsForContextType } from '$lib/services/agentic-chat/tools/core/tools.config';
import {
	buildGlobalTestEnvelope,
	buildProjectCreateTestEnvelope,
	runLiteTurn
} from '../helpers/lite-turn-runner';

// Regression phrases that must never appear in user-visible assistant text:
// self-correction spirals, prompt scaffolding echoes, and the phantom headers
// removed 2026-04-17 that weak models used to mirror back.
const FORBIDDEN_ASSISTANT_PATTERNS = [
	'No, wait',
	'Prompt variant:',
	'lite_seed_v1',
	'Final-response rules',
	'Communication pattern',
	'# BuildOS Agentic Chat'
];

function expectCleanAssistantText(text: string): void {
	for (const pattern of FORBIDDEN_ASSISTANT_PATTERNS) {
		expect(text).not.toContain(pattern);
	}
}

describe('lite prompt live smoke (real LLM calls — costs money)', () => {
	it('has an OpenRouter API key configured', () => {
		expect(
			PRIVATE_OPENROUTER_API_KEY,
			'PRIVATE_OPENROUTER_API_KEY must be set in apps/web/.env to run LLM tests'
		).toBeTruthy();
	});

	it('global: responds to a workspace question with grounded text or on-surface tool calls', async () => {
		const envelope = buildGlobalTestEnvelope();
		const result = await runLiteTurn({
			systemPrompt: envelope.systemPrompt,
			userMessage: 'Give me a quick rundown of what is on my plate right now.',
			contextType: 'global'
		});

		// Pass 1 must produce something: prose grounded in the loaded projects,
		// tool calls, or both.
		expect(result.assistantText.length + result.toolCalls.length).toBeGreaterThan(0);

		// Any tool call must target a tool that is actually on the global surface.
		const surface = new Set(
			getDefaultToolsForContextType('global').map((tool) => tool.function.name)
		);
		for (const call of result.toolCalls) {
			expect(surface.has(call.function.name), `off-surface tool: ${call.function.name}`).toBe(
				true
			);
		}

		// If it answered in prose, the answer should be grounded in the loaded
		// data — at least one fixture project mentioned — and contract-clean.
		if (result.toolCalls.length === 0) {
			const text = result.assistantText;
			const mentionsFixture =
				text.includes('Launch Alpha') || text.includes('Newsletter Relaunch');
			expect(mentionsFixture, `expected a fixture project mention in: ${text}`).toBe(true);
		}
		expectCleanAssistantText(result.assistantText);
	});

	it('project_create: calls create_onto_project with a usable name and type_key', async () => {
		const envelope = buildProjectCreateTestEnvelope();
		const result = await runLiteTurn({
			systemPrompt: envelope.systemPrompt,
			userMessage:
				'I want to start a rooftop garden consulting side business. Set up the project — first steps are building a pricing sheet and finding my first three clients.',
			contextType: 'project_create'
		});

		const createCall = result.toolCalls.find(
			(call) => call.function.name === 'create_onto_project'
		);
		expect(
			createCall,
			`expected a create_onto_project call, got tools=[${result.toolCalls
				.map((call) => call.function.name)
				.join(', ')}] text="${result.assistantText.slice(0, 300)}"`
		).toBeDefined();

		const args = JSON.parse(createCall!.function.arguments) as {
			project?: { name?: string; type_key?: string };
		};
		expect(args.project?.name ?? '').not.toHaveLength(0);
		expect(args.project?.type_key ?? '').toMatch(/^project\./);
		expectCleanAssistantText(result.assistantText);
	});

	it('global: keeps the final-response contract on a pure prose pass (no tools)', async () => {
		const envelope = buildGlobalTestEnvelope();
		const result = await runLiteTurn({
			systemPrompt: envelope.systemPrompt,
			userMessage: 'In one or two sentences, what can you help me with here?',
			contextType: 'global',
			tools: []
		});

		expect(result.assistantText.trim().length).toBeGreaterThan(0);
		expectCleanAssistantText(result.assistantText);
	});
});
