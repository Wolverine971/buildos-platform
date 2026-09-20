// apps/web/src/routes/api/agent/v2/capabilities/+server.ts
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { resolveAgenticChatWorkflowV4AdmissionPolicy } from '$lib/services/agentic-chat-v2/worker-turn-workflow-admission.server';
import { ApiResponse } from '$lib/utils/api-response';

/** UI hint only: admission rechecks the rollout policy on every submission. */
export const GET: RequestHandler = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	const policy = resolveAgenticChatWorkflowV4AdmissionPolicy({
		AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED: env.AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED,
		AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED: env.AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED,
		AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS: env.AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS
	});
	const response = user?.id
		? ApiResponse.success({
				documentOrganization:
					policy.enabled &&
					policy.specialistWorkflowsEnabled === true &&
					policy.cohortUserIds.includes(user.id.toLowerCase()),
				projectReview:
					policy.enabled && policy.cohortUserIds.includes(user.id.toLowerCase())
			})
		: ApiResponse.unauthorized();
	response.headers.set('Cache-Control', 'private, no-store');
	return response;
};
