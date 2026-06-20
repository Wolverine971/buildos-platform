// apps/web/src/routes/api/onto/braindumps/[id]/chat-session/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import type { Json } from '@buildos/shared-types';

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function compactTitle(value: string | null | undefined): string {
	const title = value?.trim() || 'Brain Dump';
	return title.length <= 80 ? title : `${title.slice(0, 77)}...`;
}

function resolveProjectId(metadata: unknown): string | null {
	if (!isRecord(metadata)) return null;
	return (
		readString(metadata.project_id) ||
		readString(metadata.projectId) ||
		readString(metadata.linked_project_id) ||
		readString(metadata.linkedProjectId)
	);
}

function buildSeedMessage(content: string): string {
	return `Original Brain Dump\n\n${content.trim()}`;
}

async function cleanupCreatedChatSession(
	supabase: { from: (table: string) => any },
	sessionId: string,
	userId: string,
	reason: string
): Promise<void> {
	const { error: messageDeleteError } = await supabase
		.from('chat_messages')
		.delete()
		.eq('session_id', sessionId)
		.eq('user_id', userId);

	if (messageDeleteError) {
		console.warn('Failed to clean up Brain Dump chat seed messages:', {
			sessionId,
			reason,
			error: messageDeleteError
		});
	}

	const { error: sessionDeleteError } = await supabase
		.from('chat_sessions')
		.delete()
		.eq('id', sessionId)
		.eq('user_id', userId);

	if (sessionDeleteError) {
		console.warn('Failed to clean up Brain Dump chat session:', {
			sessionId,
			reason,
			error: sessionDeleteError
		});
	}
}

export const POST: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const braindumpId = params.id;
	if (!braindumpId) {
		return ApiResponse.badRequest('Brain Dump id is required');
	}

	const supabase = locals.supabase;
	const { data: braindump, error: braindumpError } = await supabase
		.from('onto_braindumps')
		.select(
			'id, user_id, content, title, topics, summary, status, error_message, metadata, processed_at, chat_session_id, created_at, updated_at'
		)
		.eq('id', braindumpId)
		.eq('user_id', user.id)
		.single();

	if (braindumpError || !braindump) {
		return ApiResponse.notFound('Brain Dump not found');
	}

	if (braindump.chat_session_id) {
		const { data: existingSession, error: existingSessionError } = await supabase
			.from('chat_sessions')
			.select('*')
			.eq('id', braindump.chat_session_id)
			.eq('user_id', user.id)
			.maybeSingle();

		if (!existingSessionError && existingSession) {
			return ApiResponse.success({
				created: false,
				session: existingSession,
				chat_session_id: existingSession.id,
				braindump
			});
		}
	}

	const metadata = isRecord(braindump.metadata) ? braindump.metadata : {};
	const projectId = resolveProjectId(metadata);
	const now = new Date().toISOString();
	const sessionMetadata: Record<string, unknown> = {
		source: 'onto_braindump',
		source_id: braindump.id,
		source_kind: 'captured_context',
		braindump_id: braindump.id,
		project_id: projectId,
		original_created_at: braindump.created_at
	};
	if (projectId) {
		sessionMetadata.focus = {
			focusType: 'project-wide',
			focusEntityId: null,
			focusEntityName: null,
			projectId,
			projectName: readString(metadata.project_name) ?? 'Project'
		};
	}

	const { data: session, error: sessionError } = await supabase
		.from('chat_sessions')
		.insert({
			user_id: user.id,
			context_type: projectId ? 'project' : 'global',
			entity_id: projectId,
			status: 'active',
			chat_type: 'braindump',
			title: `Brain Dump: ${compactTitle(braindump.title ?? braindump.summary)}`,
			summary: braindump.summary,
			message_count: 1,
			last_message_at: now,
			agent_metadata: sessionMetadata as Json
		})
		.select('*')
		.single();

	if (sessionError || !session) {
		return ApiResponse.databaseError(
			sessionError ?? new Error('Failed to create Brain Dump chat session')
		);
	}

	const { error: messageError } = await supabase.from('chat_messages').insert({
		session_id: session.id,
		user_id: user.id,
		role: 'user',
		content: buildSeedMessage(braindump.content),
		created_at: now,
		metadata: {
			source: 'onto_braindump',
			braindump_id: braindump.id,
			seed_message: true,
			original_created_at: braindump.created_at
		} as Json
	});

	if (messageError) {
		await cleanupCreatedChatSession(
			supabase,
			session.id,
			user.id,
			'seed_message_insert_failed'
		);
		return ApiResponse.databaseError(messageError);
	}

	const nextMetadata = {
		...metadata,
		chat_session_id: session.id,
		last_opened_chat_at: now
	};
	const { data: updatedBraindump, error: updateError } = await supabase
		.from('onto_braindumps')
		.update({
			chat_session_id: session.id,
			metadata: nextMetadata,
			updated_at: now
		})
		.eq('id', braindump.id)
		.eq('user_id', user.id)
		.select(
			'id, user_id, content, title, topics, summary, status, error_message, metadata, processed_at, chat_session_id, created_at, updated_at'
		)
		.single();

	if (updateError || !updatedBraindump) {
		await cleanupCreatedChatSession(
			supabase,
			session.id,
			user.id,
			'braindump_link_update_failed'
		);
		return ApiResponse.databaseError(
			updateError ?? new Error('Failed to link Brain Dump chat session')
		);
	}

	return ApiResponse.created({
		created: true,
		session,
		chat_session_id: session.id,
		braindump: updatedBraindump
	});
};
