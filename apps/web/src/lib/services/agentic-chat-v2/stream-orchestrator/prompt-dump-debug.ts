// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/prompt-dump-debug.ts
import type { ChatToolDefinition } from '@buildos/shared-types';
import type { FastChatHistoryMessage } from '../types';
import { pruneLocalPromptDumps, shouldWriteLocalPromptDump } from '../prompt-dump-files';
import {
	buildPromptCostBreakdown,
	type PromptCostBreakdown,
	type PromptSectionCost
} from '../prompt-cost-breakdown';
import { isGatewayExecToolName } from '$lib/services/agentic-chat/tools/core/gateway-exec-utils';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseToolArguments } from './tool-arguments';
import type { FastChatDebugContext, FastToolExecution, LLMStreamPassMetadata } from './shared';

const MAX_TOOL_ARG_PREVIEW_CHARS = 400;

export function writeInitialPromptDump(params: {
	dev: boolean;
	sessionId: string;
	normalizedContext: string;
	entityId?: string | null;
	projectId?: string | null;
	history: FastChatHistoryMessage[];
	message: string;
	systemPrompt: string;
	tools?: ChatToolDefinition[];
	debugContext?: FastChatDebugContext;
}): string | null {
	if (
		!shouldWriteLocalPromptDump({
			dev: params.dev,
			sessionId: params.sessionId,
			historyCount: params.history.length,
			message: params.message
		})
	) {
		return null;
	}

	try {
		const dumpDir = join(process.cwd(), '.prompt-dumps');
		pruneLocalPromptDumps({ dumpDir });
		mkdirSync(dumpDir, { recursive: true });
		const dumpTimestamp = new Date();
		const ts = dumpTimestamp.toISOString().replace(/[:.]/g, '-');
		const dumpPath = join(dumpDir, `fastchat-${ts}.txt`);
		const toolNames = (params.tools ?? []).map((tool) => tool.function?.name).filter(Boolean);
		const promptCostBreakdown = buildPromptCostBreakdown({
			systemPrompt: params.systemPrompt,
			history: params.history,
			userMessage: params.message,
			tools: params.tools
		});

		const lines: string[] = [
			`========================================`,
			`FASTCHAT V2 PROMPT DUMP`,
			`Timestamp: ${dumpTimestamp.toISOString()}`,
			`Session:   ${params.sessionId}`,
			`Context:   ${params.normalizedContext}`,
			`Entity ID: ${params.entityId ?? 'none'}`,
			`Project:   ${params.projectId ?? 'none'}`,
			`Tools (${toolNames.length}): ${toolNames.join(', ') || 'none'}`,
			`History messages: ${params.history.length}`,
			`Gateway mode: ${params.debugContext?.gatewayEnabled ? 'enabled' : 'disabled'}`,
			`History strategy: ${params.debugContext?.historyStrategy ?? 'raw_history'}`,
			`History compressed: ${params.debugContext?.historyCompressed ? 'yes' : 'no'}`,
			`History raw/model counts: ${
				typeof params.debugContext?.rawHistoryCount === 'number'
					? params.debugContext.rawHistoryCount
					: params.history.length
			}/${typeof params.debugContext?.historyForModelCount === 'number' ? params.debugContext.historyForModelCount : params.history.length}`,
			`History tail kept: ${
				typeof params.debugContext?.tailMessagesKept === 'number'
					? params.debugContext.tailMessagesKept
					: params.history.length
			}`,
			`Continuity hint used: ${params.debugContext?.continuityHintUsed ? 'yes' : 'no'}`,
			`User message length: ${params.message.length} chars`,
			`System prompt length: ${params.systemPrompt.length} chars (~${Math.ceil(params.systemPrompt.length / 4)} tokens)`,
			`Provider payload estimate: ${promptCostBreakdown.provider_payload_estimate.chars} chars (~${promptCostBreakdown.provider_payload_estimate.est_tokens} tokens)`,
			`========================================`,
			``,
			`────────────────────────────────────────`,
			`PROMPT COST BREAKDOWN (ESTIMATED)`,
			`────────────────────────────────────────`,
			...formatPromptCostBreakdown(promptCostBreakdown),
			``,
			`────────────────────────────────────────`,
			`SYSTEM PROMPT`,
			`────────────────────────────────────────`,
			``,
			params.systemPrompt,
			``,
			`────────────────────────────────────────`,
			`CONVERSATION HISTORY (${params.history.length} messages)`,
			`────────────────────────────────────────`,
			``
		];

		for (const msg of params.history) {
			lines.push(`[${msg.role.toUpperCase()}]`);
			lines.push(msg.content);
			if (msg.tool_calls?.length) {
				lines.push(`  tool_calls: ${JSON.stringify(msg.tool_calls, null, 2)}`);
			}
			if (msg.tool_call_id) {
				lines.push(`  tool_call_id: ${msg.tool_call_id}`);
			}
			lines.push(``);
		}

		lines.push(`────────────────────────────────────────`);
		lines.push(`CURRENT USER MESSAGE`);
		lines.push(`────────────────────────────────────────`);
		lines.push(``);
		lines.push(params.message);
		lines.push(``);

		lines.push(`════════════════════════════════════════`);
		lines.push(`END OF DUMP`);
		lines.push(`════════════════════════════════════════`);

		writeFileSync(dumpPath, lines.join('\n'), 'utf-8');
		console.log(`[FastChat] Prompt dumped to ${dumpPath}`);
		return dumpPath;
	} catch {
		return null;
	}
}

function formatPromptCostBreakdown(cost: PromptCostBreakdown): string[] {
	const sectionOrder = [
		'instructions',
		'context',
		'tools_text_block',
		'context_payload',
		'skill_catalog',
		'capabilities',
		'execution_protocol',
		'agent_behavior',
		'data_rules',
		'history',
		'user'
	];

	return [
		formatPromptCostLine('system_prompt', cost.system_prompt),
		formatPromptCostLine('model_messages', cost.model_messages),
		formatPromptCostLine('tool_definitions', cost.tool_definitions),
		formatPromptCostLine('provider_payload_estimate', cost.provider_payload_estimate),
		'',
		'Sections:',
		...sectionOrder.map((key) =>
			formatPromptCostLine(`  ${key}`, cost.sections[key] ?? { chars: 0, est_tokens: 0 })
		)
	];
}

function formatPromptCostLine(label: string, cost: PromptSectionCost): string {
	return `${label}: ${cost.chars} chars (~${cost.est_tokens} tokens)`;
}

export function appendRuntimeMetadataToPromptDump(
	promptDumpPath: string | null,
	params: {
		llmPasses: LLMStreamPassMetadata[];
		finishedReason?: string;
		toolRounds: number;
		toolCallsMade: number;
		toolExecutions: FastToolExecution[];
		cancelled?: boolean;
	}
): void {
	if (!promptDumpPath) return;

	try {
		const lines: string[] = [
			'',
			'────────────────────────────────────────',
			'LLM ROUTING (ACTUAL)',
			'────────────────────────────────────────'
		];

		if (params.llmPasses.length === 0) {
			lines.push('No stream completion metadata captured.');
		} else {
			for (const pass of params.llmPasses) {
				lines.push(
					`Pass ${pass.pass}: model=${pass.model ?? 'unknown'}, provider=${pass.provider ?? 'unknown'}, request_id=${pass.requestId ?? 'unknown'}`
				);
				lines.push(
					`  finish_reason=${pass.finishedReason ?? 'unknown'}, cache_status=${pass.cacheStatus ?? 'unknown'}, reasoning_tokens=${pass.reasoningTokens ?? 'unknown'}`
				);
				lines.push(
					`  usage: prompt=${pass.promptTokens ?? 'unknown'}, completion=${pass.completionTokens ?? 'unknown'}, total=${pass.totalTokens ?? 'unknown'}`
				);
				lines.push(`  system_fingerprint=${pass.systemFingerprint ?? 'unknown'}`);
			}
		}

		lines.push('');
		lines.push(
			`Run summary: finished_reason=${params.finishedReason ?? 'unknown'}, tool_rounds=${params.toolRounds}, tool_calls=${params.toolCallsMade}`
		);
		if (params.cancelled) {
			lines.push('Run summary: cancelled=true');
		}
		if (Array.isArray(params.toolExecutions) && params.toolExecutions.length > 0) {
			lines.push('');
			lines.push('────────────────────────────────────────');
			lines.push('TOOL EXECUTIONS (ACTUAL)');
			lines.push('────────────────────────────────────────');
			params.toolExecutions.forEach((execution, index) => {
				const toolName = execution.toolCall.function?.name?.trim() ?? 'unknown';
				const rawArgs = execution.toolCall.function?.arguments;
				const parsed = parseToolArguments(execution.toolCall.function?.arguments);
				const op =
					isGatewayExecToolName(toolName) && typeof parsed.args.op === 'string'
						? parsed.args.op
						: undefined;
				const success = execution.result.success === true ? 'ok' : 'error';
				const error =
					typeof execution.result.error === 'string' &&
					execution.result.error.trim().length > 0
						? execution.result.error.trim()
						: null;
				lines.push(
					`${index + 1}. ${toolName}${op ? ` (${op})` : ''} => ${success}${
						error ? ` | ${error}` : ''
					}`
				);
				lines.push(`   raw_args: ${toSingleLinePreview(rawArgs)}`);
				if (parsed.error) {
					lines.push(`   parsed_error: ${parsed.error}`);
				} else {
					lines.push(`   parsed_args: ${toSingleLinePreview(parsed.args)}`);
				}
			});
		}
		lines.push('');
		appendFileSync(promptDumpPath, `${lines.join('\n')}\n`, 'utf-8');
	} catch {
		// Ignore dump append failures.
	}
}

function toSingleLinePreview(value: unknown, maxChars = MAX_TOOL_ARG_PREVIEW_CHARS): string {
	if (value === undefined || value === null) {
		return 'null';
	}

	const raw = typeof value === 'string' ? value : JSON.stringify(value);
	const normalized = raw.replace(/\s+/g, ' ').trim();
	if (normalized.length <= maxChars) {
		return normalized;
	}
	return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}
