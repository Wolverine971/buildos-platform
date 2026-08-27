// apps/worker/tests/agenticChatToolExecutionGraphOllama.live.test.ts
import { describe, expect, it } from 'vitest';
import {
	TOOL_GRAPH_MODEL_SCENARIOS,
	TOOL_GRAPH_MODEL_SYSTEM_PROMPT,
	TOOL_GRAPH_MODEL_TOOLS,
	fixtureToolResult,
	gradeToolGraphModelTrace,
	type ToolGraphModelToolCall,
	type ToolGraphModelTrace
} from './fixtures/agenticChatToolExecutionGraphModelScenarios';

const ollamaModel = process.env.OLLAMA_TOOL_GRAPH_MODEL?.trim();
const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434').replace(
	/\/$/,
	''
);
const requestedRuns = Number.parseInt(process.env.OLLAMA_TOOL_GRAPH_RUNS || '1', 10);
const runs = Number.isSafeInteger(requestedRuns) && requestedRuns > 0 ? requestedRuns : 1;
const requestedMinimumPassRate = Number.parseFloat(
	process.env.OLLAMA_TOOL_GRAPH_MIN_PASS_RATE || '1'
);
const minimumPassRate =
	Number.isFinite(requestedMinimumPassRate) &&
	requestedMinimumPassRate > 0 &&
	requestedMinimumPassRate <= 1
		? requestedMinimumPassRate
		: 1;

type OllamaMessage = {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string;
	thinking?: string;
	tool_name?: string;
	tool_calls?: ToolGraphModelToolCall[];
};

type OllamaChatResponse = {
	message?: OllamaMessage;
	done?: boolean;
	done_reason?: string;
	model?: string;
};

async function ollamaChat(messages: OllamaMessage[]): Promise<OllamaMessage> {
	const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: ollamaModel,
			messages,
			tools: TOOL_GRAPH_MODEL_TOOLS,
			stream: false,
			options: { temperature: 0 }
		}),
		signal: AbortSignal.timeout(120_000)
	});
	const payload = (await response.json()) as OllamaChatResponse & { error?: string };
	if (!response.ok || payload.error) {
		throw new Error(payload.error || `Ollama chat failed with HTTP ${response.status}`);
	}
	if (!payload.message) throw new Error('Ollama returned no assistant message');
	return payload.message;
}

async function runScenario(userPrompt: string): Promise<ToolGraphModelTrace> {
	const messages: OllamaMessage[] = [
		{ role: 'system', content: TOOL_GRAPH_MODEL_SYSTEM_PROMPT },
		{ role: 'user', content: userPrompt }
	];
	const toolCallRounds: ToolGraphModelToolCall[][] = [];
	let finalContent = '';

	for (let round = 0; round < 4; round += 1) {
		const assistant = await ollamaChat(messages);
		messages.push(assistant);
		const calls = assistant.tool_calls ?? [];
		if (calls.length === 0) {
			finalContent = assistant.content ?? '';
			break;
		}
		toolCallRounds.push(calls);
		for (const call of calls) {
			messages.push({
				role: 'tool',
				tool_name: call.function.name,
				content: JSON.stringify(fixtureToolResult(call))
			});
		}
	}

	return { toolCallRounds, finalContent };
}

describe.runIf(Boolean(ollamaModel))('opt-in Ollama tool execution graph capability', () => {
	it.each(TOOL_GRAPH_MODEL_SCENARIOS)(
		'$id: $title',
		async (scenario) => {
			const attempts = [];
			for (let index = 0; index < runs; index += 1) {
				const trace = await runScenario(scenario.userPrompt);
				attempts.push({ trace, grade: gradeToolGraphModelTrace(scenario, trace) });
			}
			const passCount = attempts.filter((attempt) => attempt.grade.passed).length;
			const report = {
				scenario: scenario.id,
				model: ollamaModel,
				passCount,
				runs,
				passRate: passCount / runs,
				attempts
			};
			if (passCount / runs < minimumPassRate) {
				throw new Error(
					`Ollama tool-graph capability failed:\n${JSON.stringify(report, null, 2)}`
				);
			}
			expect(passCount / runs).toBeGreaterThanOrEqual(minimumPassRate);
		},
		180_000 * runs
	);
});
