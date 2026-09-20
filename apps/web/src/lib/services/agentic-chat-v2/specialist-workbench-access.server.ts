// apps/web/src/lib/services/agentic-chat-v2/specialist-workbench-access.server.ts
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { parseChatWorkflowPrototypeUsers } from '@buildos/shared-types';

export async function requireSpecialistWorkbenchUser(locals: Pick<App.Locals, 'safeGetSession'>) {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Sign in to use the specialist workbench.');
	if (
		!parseChatWorkflowPrototypeUsers(env.AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS).includes(
			user.id
		)
	)
		error(404, 'Not found.');
	return user.id;
}
