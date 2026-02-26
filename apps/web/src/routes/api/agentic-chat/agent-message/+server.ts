// apps/web/src/routes/api/agentic-chat/agent-message/+server.ts
// Generates an actionable message from a selected agent to send into the BuildOS agent chat.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { buildActionableInsightSystemPrompt } from '$lib/services/agentic-chat/prompts/actionable-insight-agent';
import type { EnsureActorResponse } from '$lib/types/onto-api';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createLogger } from '$lib/utils/logger';
import { sanitizeLogData } from '$lib/utils/logging-helpers';
import type { ErrorSeverity } from '$lib/types/error-logging';

type HistoryItem = { role: 'agent' | 'buildos'; content: string };

interface AgentMessageRequest {
	goal: string;
	projectId: string;
	agentId: string;
	history?: HistoryItem[];
}

type AgentMessageOperationType =
	| 'agent_message_parse'
	| 'agent_message_validate'
	| 'agent_message_actor_resolution'
	| 'agent_message_access_check'
	| 'agent_message_access_denied'
	| 'agent_message_project_lookup'
	| 'agent_message_generate'
	| 'agent_message_empty_response';

const logger = createLogger('API:AgentMessage');
const AGENT_MESSAGE_ENDPOINT = '/api/agentic-chat/agent-message';
const AGENT_MESSAGE_METHOD = 'POST';

async function logAgentMessageError(params: {
	errorLogger: ErrorLoggerService;
	error: unknown;
	userId?: string;
	projectId?: string;
	operationType: AgentMessageOperationType;
	metadata?: Record<string, unknown>;
	severity?: ErrorSeverity;
}): Promise<void> {
	const sanitizedMetadata = params.metadata ? sanitizeLogData(params.metadata) : undefined;
	const metadata =
		sanitizedMetadata &&
		typeof sanitizedMetadata === 'object' &&
		!Array.isArray(sanitizedMetadata)
			? (sanitizedMetadata as Record<string, unknown>)
			: sanitizedMetadata !== undefined
				? { value: sanitizedMetadata }
				: undefined;

	try {
		await params.errorLogger.logError(
			params.error,
			{
				userId: params.userId,
				projectId: params.projectId,
				endpoint: AGENT_MESSAGE_ENDPOINT,
				httpMethod: AGENT_MESSAGE_METHOD,
				operationType: params.operationType,
				metadata
			},
			params.severity
		);
	} catch (loggingError) {
		logger.error('Failed to log agent message error', {
			error: loggingError,
			operationType: params.operationType,
			userId: params.userId,
			projectId: params.projectId
		});
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Authentication required');
	}
	const errorLogger = ErrorLoggerService.getInstance(locals.supabase);

	let body: AgentMessageRequest;
	try {
		body = await request.json();
	} catch (error) {
		logger.warn('Invalid JSON body for agent message request', {
			userId: user.id,
			error
		});
		await logAgentMessageError({
			errorLogger,
			error,
			userId: user.id,
			operationType: 'agent_message_parse',
			severity: 'warning',
			metadata: {
				parseStage: 'request_json'
			}
		});
		return ApiResponse.badRequest('Invalid JSON body');
	}

	const goal = body?.goal?.trim();
	const projectId = body?.projectId?.trim();
	const agentId = body?.agentId?.trim();
	const history = Array.isArray(body?.history) ? body.history : [];

	if (!goal || !projectId || !agentId) {
		const validationError = new Error('agentId, projectId, and goal are required');
		await logAgentMessageError({
			errorLogger,
			error: validationError,
			userId: user.id,
			projectId,
			operationType: 'agent_message_validate',
			severity: 'warning',
			metadata: {
				hasGoal: Boolean(goal),
				hasProjectId: Boolean(projectId),
				hasAgentId: Boolean(agentId),
				historyCount: history.length
			}
		});
		return ApiResponse.badRequest('agentId, projectId, and goal are required');
	}

	// Currently only actionable insight agent is supported for this bridge
	if (agentId !== 'actionable_insight_agent') {
		await logAgentMessageError({
			errorLogger,
			error: new Error('Unsupported agent'),
			userId: user.id,
			projectId,
			operationType: 'agent_message_validate',
			severity: 'warning',
			metadata: {
				agentId
			}
		});
		return ApiResponse.badRequest('Unsupported agent');
	}

	// Resolve actor -> project ownership
	const { data: actorData, error: actorError } = await locals.supabase.rpc(
		'ensure_actor_for_user',
		{
			p_user_id: user.id
		}
	);

	if (actorError || !actorData) {
		logger.error('Failed to resolve actor for user', {
			error: actorError,
			userId: user.id,
			actorIdMissing: !actorData
		});
		await logAgentMessageError({
			errorLogger,
			error: actorError ?? new Error('Actor data missing'),
			userId: user.id,
			projectId,
			operationType: 'agent_message_actor_resolution',
			metadata: {
				actorIdMissing: !actorData
			}
		});
		return ApiResponse.internalError(new Error('Failed to resolve actor for user'));
	}

	const actorId = actorData as EnsureActorResponse;

	const { data: hasAccess, error: accessError } = await locals.supabase.rpc(
		'current_actor_has_project_access',
		{
			p_project_id: projectId,
			p_required_access: 'write'
		}
	);

	if (accessError) {
		logger.error('Failed to check project access', {
			error: accessError,
			userId: user.id,
			projectId,
			actorId
		});
		await logAgentMessageError({
			errorLogger,
			error: accessError,
			userId: user.id,
			projectId,
			operationType: 'agent_message_access_check',
			metadata: {
				actorId
			}
		});
		return ApiResponse.error('Failed to verify project access', 500);
	}

	if (!hasAccess) {
		await logAgentMessageError({
			errorLogger,
			error: new Error('Project access denied'),
			userId: user.id,
			projectId,
			operationType: 'agent_message_access_denied',
			severity: 'warning',
			metadata: {
				actorId,
				requiredAccess: 'write'
			}
		});
		return ApiResponse.forbidden('You do not have access to this project');
	}

	const { data: project, error: projectError } = await locals.supabase
		.from('onto_projects')
		.select('id, name, props')
		.eq('id', projectId)
		.single();

	if (projectError || !project) {
		if (projectError) {
			logger.error('Failed to load project for agent message', {
				error: projectError,
				userId: user.id,
				projectId
			});
		}
		await logAgentMessageError({
			errorLogger,
			error: projectError ?? new Error('Project not found'),
			userId: user.id,
			projectId,
			operationType: 'agent_message_project_lookup',
			severity: projectError ? 'error' : 'warning',
			metadata: {
				projectFound: Boolean(project)
			}
		});
		return ApiResponse.notFound('Project');
	}

	const projectProps =
		project.props && typeof project.props === 'object'
			? (project.props as Record<string, unknown>)
			: undefined;

	const projectName = project.name ?? 'Project';
	const systemPrompt = buildActionableInsightSystemPrompt({
		projectName,
		projectId: project.id,
		projectSummary:
			typeof projectProps?.description === 'string' ? projectProps.description : undefined,
		goal
	});

	const priorAgentMessages = history
		.filter((item) => item?.role === 'agent' && typeof item.content === 'string')
		.map((item) => item.content.trim())
		.filter(Boolean);
	const priorBuildOSMessages = history
		.filter((item) => item?.role === 'buildos' && typeof item.content === 'string')
		.map((item) => item.content.trim())
		.filter(Boolean);

	const promptSections = [
		`Goal: ${goal}`,
		priorAgentMessages.length
			? `Your previous messages:\n${priorAgentMessages.join('\n---\n')}`
			: '',
		priorBuildOSMessages.length
			? `BuildOS replies so far:\n${priorBuildOSMessages.join('\n---\n')}`
			: '',
		'Write the next concise message to send into the BuildOS agentic chat to progress the goal. Keep it actionable and avoid chit-chat.'
	]
		.filter(Boolean)
		.join('\n\n');

	try {
		const llm = new SmartLLMService({ supabase: locals.supabase });
		const message = await llm.generateText({
			systemPrompt,
			prompt: promptSections,
			temperature: 0.2,
			maxTokens: 320,
			operationType: 'agent_to_agent_turn',
			userId: user.id,
			projectId: project.id
		});
		const trimmedMessage = (message ?? '').trim();

		if (!trimmedMessage) {
			await logAgentMessageError({
				errorLogger,
				error: new Error('LLM returned empty agent message'),
				userId: user.id,
				projectId: project.id,
				operationType: 'agent_message_empty_response',
				severity: 'warning',
				metadata: {
					goalLength: goal.length,
					priorAgentMessages: priorAgentMessages.length,
					priorBuildOSMessages: priorBuildOSMessages.length
				}
			});
			return ApiResponse.error('Failed to generate agent message', 500, 'AGENT_EMPTY_MESSAGE');
		}

		return ApiResponse.success({
			message: trimmedMessage
		});
	} catch (error) {
		logger.error('Failed to generate agent message', {
			error,
			userId: user.id,
			projectId: project.id,
			agentId,
			goalLength: goal.length,
			priorAgentMessages: priorAgentMessages.length,
			priorBuildOSMessages: priorBuildOSMessages.length
		});
		await logAgentMessageError({
			errorLogger,
			error,
			userId: user.id,
			projectId: project.id,
			operationType: 'agent_message_generate',
			metadata: {
				agentId,
				goalLength: goal.length,
				priorAgentMessages: priorAgentMessages.length,
				priorBuildOSMessages: priorBuildOSMessages.length
			}
		});
		return ApiResponse.internalError(error as Error, 'Failed to generate agent message');
	}
};
