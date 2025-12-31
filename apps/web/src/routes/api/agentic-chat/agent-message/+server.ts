// apps/web/src/routes/api/agentic-chat/agent-message/+server.ts
// Generates an actionable message from a selected agent to send into the BuildOS agent chat.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { buildActionableInsightSystemPrompt } from '$lib/services/agentic-chat/prompts/actionable-insight-agent';
import type { EnsureActorResponse } from '$lib/types/onto-api';

type HistoryItem = { role: 'agent' | 'buildos'; content: string };

interface AgentMessageRequest {
	goal: string;
	projectId: string;
	agentId: string;
	history?: HistoryItem[];
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	let body: AgentMessageRequest;
	try {
		body = await request.json();
	} catch (err) {
		return ApiResponse.badRequest('Invalid JSON body');
	}

	const goal = body?.goal?.trim();
	const projectId = body?.projectId?.trim();
	const agentId = body?.agentId?.trim();
	const history = body?.history ?? [];

	if (!goal || !projectId || !agentId) {
		return ApiResponse.badRequest('agentId, projectId, and goal are required');
	}

	// Currently only actionable insight agent is supported for this bridge
	if (agentId !== 'actionable_insight_agent') {
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
		return ApiResponse.internalError(new Error('Failed to resolve actor for user'));
	}

	const actorId = actorData as EnsureActorResponse;

	const { data: project, error: projectError } = await locals.supabase
		.from('onto_projects')
		.select('id, name, props')
		.eq('id', projectId)
		.eq('created_by', actorId)
		.single();

	if (projectError || !project) {
		return ApiResponse.notFound('Project');
	}

	const projectName = project.name ?? 'Project';
	const systemPrompt = buildActionableInsightSystemPrompt({
		projectName,
		projectId: project.id,
		projectSummary: (project.props as any)?.description,
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

		return ApiResponse.success({
			message: (message ?? '').trim()
		});
	} catch (err) {
		return ApiResponse.internalError(err as Error, 'Failed to generate agent message');
	}
};
