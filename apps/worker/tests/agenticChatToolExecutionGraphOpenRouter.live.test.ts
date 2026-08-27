// apps/worker/tests/agenticChatToolExecutionGraphOpenRouter.live.test.ts
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

const model = process.env.OPENROUTER_TOOL_GRAPH_MODEL?.trim();
const apiKey = process.env.PRIVATE_OPENROUTER_API_KEY?.trim();
const requestedRuns = Number.parseInt(process.env.OPENROUTER_TOOL_GRAPH_RUNS || '1', 10);
const runs = Number.isSafeInteger(requestedRuns) && requestedRuns > 0 ? requestedRuns : 1;
const requestedMinimumPassRate = Number.parseFloat(
	process.env.OPENROUTER_TOOL_GRAPH_MIN_PASS_RATE || '1'
);
const minimumPassRate =
	Number.isFinite(requestedMinimumPassRate) &&
	requestedMinimumPassRate > 0 &&
	requestedMinimumPassRate <= 1
		? requestedMinimumPassRate
		: 1;

type OpenRouterToolCall = {
	id: string;
	type: 'function';
	function: { name: string; arguments: string | Record<string, unknown> };
};

type OpenRouterMessage = {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | null;
	tool_call_id?: string;
	tool_calls?: OpenRouterToolCall[];
};

function normalizeToolCall(call: OpenRouterToolCall): ToolGraphModelToolCall {
	const raw = call.function.arguments;
	const parsed = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`OpenRouter returned invalid arguments for ${call.function.name}`);
	}
	return {
		function: {
			name: call.function.name,
			arguments: parsed as Record<string, unknown>
		}
	};
}

async function openRouterChat(messages: OpenRouterMessage[]): Promise<OpenRouterMessage> {
	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://build-os.com',
			'X-Title': 'BuildOS Tool Graph Evaluation'
		},
		body: JSON.stringify({
			model,
			messages,
			tools: TOOL_GRAPH_MODEL_TOOLS,
			tool_choice: 'auto',
			parallel_tool_calls: true,
			temperature: 0,
			usage: { include: true },
			provider: {
				data_collection: 'deny',
				zdr: true,
				allow_fallbacks: true
			}
		}),
		signal: AbortSignal.timeout(120_000)
	});
	const payload = (await response.json()) as {
		error?: { message?: string };
		choices?: Array<{ message?: OpenRouterMessage }>;
	};
	if (!response.ok || payload.error) {
		throw new Error(payload.error?.message || `OpenRouter failed with HTTP ${response.status}`);
	}
	const message = payload.choices?.[0]?.message;
	if (!message) throw new Error('OpenRouter returned no assistant message');
	return message;
}

async function runScenario(userPrompt: string): Promise<ToolGraphModelTrace> {
	const messages: OpenRouterMessage[] = [
		{ role: 'system', content: TOOL_GRAPH_MODEL_SYSTEM_PROMPT },
		{ role: 'user', content: userPrompt }
	];
	const toolCallRounds: ToolGraphModelToolCall[][] = [];
	let finalContent = '';

	for (let round = 0; round < 4; round += 1) {
		const assistant = await openRouterChat(messages);
		messages.push(assistant);
		const rawCalls = assistant.tool_calls ?? [];
		if (rawCalls.length === 0) {
			finalContent = assistant.content ?? '';
			break;
		}
		const calls = rawCalls.map(normalizeToolCall);
		toolCallRounds.push(calls);
		for (const [index, call] of calls.entries()) {
			messages.push({
				role: 'tool',
				tool_call_id: rawCalls[index]!.id,
				content: JSON.stringify(fixtureToolResult(call))
			});
		}
	}

	return { toolCallRounds, finalContent };
}

describe.runIf(Boolean(model && apiKey))(
	'opt-in OpenRouter tool execution graph capability',
	() => {
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
					model,
					passCount,
					runs,
					passRate: passCount / runs,
					attempts
				};
				if (passCount / runs < minimumPassRate) {
					throw new Error(
						`OpenRouter tool-graph capability failed:\n${JSON.stringify(report, null, 2)}`
					);
				}
				expect(passCount / runs).toBeGreaterThanOrEqual(minimumPassRate);
			},
			180_000 * runs
		);
	}
);
