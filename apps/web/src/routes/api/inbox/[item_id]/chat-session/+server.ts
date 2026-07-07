// apps/web/src/routes/api/inbox/[item_id]/chat-session/+server.ts
import type { RequestHandler } from './$types';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { createInboxChatSession } from '$lib/server/inbox-chat-session.service';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import type { InboxIndexRow, InboxSourceType } from '@buildos/shared-agent-ops/inbox-index';

const SUPPORTED_SOURCE_TYPES = new Set<InboxSourceType>([
	'agent_run',
	'project_suggestion',
	'project_audit',
	'calendar_suggestion'
]);

function readString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function loadInboxItem(params: {
	supabase: any;
	itemId: string;
}): Promise<InboxIndexRow | null> {
	const { data, error } = await params.supabase
		.from('inbox_items')
		.select('*')
		.eq('id', params.itemId)
		.maybeSingle();
	if (error) throw error;
	return (data ?? null) as InboxIndexRow | null;
}

export const POST: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized('Authentication required');

	const itemId = readString(params.item_id);
	if (!itemId) return ApiResponse.badRequest('Inbox item id is required');

	let item: InboxIndexRow | null = null;
	try {
		item = await loadInboxItem({
			supabase: locals.supabase as any,
			itemId
		});
	} catch (error) {
		return ApiResponse.databaseError(error);
	}

	if (!item) return ApiResponse.notFound('Inbox item');
	if (!SUPPORTED_SOURCE_TYPES.has(item.source_type)) {
		return ApiResponse.error(
			'Inbox item does not support chat yet',
			HttpStatus.UNPROCESSABLE_ENTITY,
			'UNSUPPORTED_INBOX_SOURCE'
		);
	}

	if (item.source_type === 'project_suggestion' || item.source_type === 'project_audit') {
		if (!PROJECT_LOOPS_ENABLED) return ApiResponse.notFound('Inbox item');
		if (!item.project_id) {
			return ApiResponse.badRequest(
				item.source_type === 'project_audit'
					? 'Project audit is missing project_id'
					: 'Project suggestion is missing project_id'
			);
		}

		const access = await requireProjectMemberAccess({
			locals,
			user,
			projectId: item.project_id,
			requiredAccess: item.source_type === 'project_audit' ? 'read' : 'write'
		});
		if (!access.ok) return access.response;
	} else if (item.user_id !== user.id) {
		return ApiResponse.forbidden('Inbox item is owned by another user');
	}

	try {
		const result = await createInboxChatSession({
			supabase: locals.supabase as any,
			item,
			userId: user.id
		});
		return result.created ? ApiResponse.created(result) : ApiResponse.success(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to open inbox chat';
		if (message === 'Inbox source not found') return ApiResponse.notFound('Inbox source');
		if (message.startsWith('Unsupported inbox source')) {
			return ApiResponse.error(
				message,
				HttpStatus.UNPROCESSABLE_ENTITY,
				'UNSUPPORTED_INBOX_SOURCE'
			);
		}
		return ApiResponse.databaseError(error);
	}
};
