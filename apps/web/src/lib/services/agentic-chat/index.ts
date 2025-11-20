// apps/web/src/lib/services/agentic-chat/index.ts
/**
 * Agentic Chat Service Factory
 *
 * Provides helpers to instantiate the refactored agentic chat architecture.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ChatToolCall } from '@buildos/shared-types';
import { v4 as uuidv4 } from 'uuid';

import { SmartLLMService } from '$lib/services/smart-llm-service';
import { ChatCompressionService } from '$lib/services/chat-compression-service';
import { AgentContextService } from '$lib/services/agent-context-service';
import { AgentExecutorService } from '$lib/services/agent-executor-service';
import { ChatToolExecutor } from '$lib/services/agentic-chat/tools/core/tool-executor';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';

import { AgentPersistenceService } from './persistence/agent-persistence-service';
import { ToolExecutionService } from './execution/tool-execution-service';
import { ExecutorCoordinator } from './execution/executor-coordinator';
import { PlanOrchestrator } from './planning/plan-orchestrator';
import { ResponseSynthesizer } from './synthesis/response-synthesizer';
import { AgentChatOrchestrator } from './orchestration/agent-chat-orchestrator';
import { ChatSessionService } from './session/chat-session-service';
import type { AgentChatOrchestratorDependencies } from './orchestration/agent-chat-orchestrator';
import type { ToolExecutorFunction, StreamEvent } from './shared/types';

export interface AgenticChatFactoryOptions {
	httpReferer?: string;
	appName?: string;
	fetchFn?: typeof fetch;
}

/**
 * Create a configured AgentChatOrchestrator instance
 */
export function createAgentChatOrchestrator(
	supabase: SupabaseClient<Database>,
	options: AgenticChatFactoryOptions = {}
): AgentChatOrchestrator {
	const fetchFn = options.fetchFn ?? fetch;

	const llmService = new SmartLLMService({
		supabase,
		httpReferer: options.httpReferer,
		appName: options.appName ?? 'BuildOS Agentic Chat'
	});

	const compressionService = new ChatCompressionService(supabase);
	const contextService = new AgentContextService(supabase, compressionService);
	const persistenceService = new AgentPersistenceService(supabase);

	const sharedToolExecutor = createToolExecutor(supabase, fetchFn, llmService);
	const toolExecutionService = new ToolExecutionService(sharedToolExecutor);

	const executorService = new AgentExecutorService(supabase, llmService, fetchFn);
	const executorCoordinator = new ExecutorCoordinator(executorService, persistenceService);

	const planOrchestrator = new PlanOrchestrator(
		llmService,
		sharedToolExecutor,
		executorCoordinator,
		persistenceService
	);

	const responseSynthesizer = new ResponseSynthesizer(llmService);
	const errorLogger = ErrorLoggerService.getInstance(supabase);

	const dependencies: AgentChatOrchestratorDependencies = {
		planOrchestrator,
		toolExecutionService,
		responseSynthesizer,
		persistenceService,
		contextService,
		llmService,
		errorLogger // Now required, not optional
	};

	return new AgentChatOrchestrator(dependencies);
}

/**
 * Create a tool executor function backed by ChatToolExecutor
 */
function createToolExecutor(
	supabase: SupabaseClient<Database>,
	fetchFn: typeof fetch,
	llmService: SmartLLMService
): ToolExecutorFunction {
	return async (toolName, args, context) => {
		const toolExecutor = new ChatToolExecutor(
			supabase,
			context.userId,
			context.sessionId,
			fetchFn,
			llmService
		);

		const call: ChatToolCall = {
			id: uuidv4(),
			type: 'function',
			function: {
				name: toolName,
				arguments: JSON.stringify(args ?? {})
			}
		} as ChatToolCall;

		const result = await toolExecutor.execute(call);

		if (!result.success) {
			throw new Error(result.error || `Tool ${toolName} execution failed`);
		}

		return {
			data: result.result ?? null,
			streamEvents: Array.isArray(result.stream_events)
				? (result.stream_events as StreamEvent[])
				: undefined
		};
	};
}

export {
	AgentChatOrchestrator,
	AgentPersistenceService,
	ToolExecutionService,
	ExecutorCoordinator,
	PlanOrchestrator,
	ResponseSynthesizer,
	ChatSessionService
};
