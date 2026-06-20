// apps/web/src/routes/api/chat/sessions/[id]/server.test.ts
import { describe, expect, it, vi } from 'vitest';

import { GET } from './+server';

function createQuery(result: unknown) {
	return {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue(result),
		single: vi.fn().mockResolvedValue(result)
	};
}

describe('GET /api/chat/sessions/[id]', () => {
	it('returns persisted tool executions when restoring a chat session', async () => {
		const session = {
			id: 'session-1',
			user_id: 'user-1',
			context_type: 'global',
			entity_id: null,
			title: 'History fix',
			auto_title: null,
			summary: null
		};
		const messages = [
			{
				id: 'assistant-1',
				session_id: 'session-1',
				user_id: 'user-1',
				role: 'assistant',
				content: 'Created the task.',
				created_at: '2026-03-28T10:01:00.000Z',
				metadata: null,
				tool_calls: null,
				tool_call_id: null
			}
		];
		const toolExecutions = [
			{
				id: 'exec-1',
				session_id: 'session-1',
				message_id: 'assistant-1',
				tool_name: 'create_onto_task',
				gateway_op: null,
				sequence_index: 1,
				arguments: { title: 'Fix history restore' },
				result: { task: { id: 'task-1', title: 'Fix history restore' } },
				execution_time_ms: 123,
				success: true,
				error_message: null,
				created_at: '2026-03-28T10:00:30.000Z'
			},
			{
				id: 'exec-2',
				session_id: 'session-1',
				message_id: 'assistant-1',
				tool_name: 'update_onto_document',
				gateway_op: 'onto.document.update',
				sequence_index: 2,
				arguments: { document_id: 'doc-1' },
				result: { ok: true },
				execution_time_ms: 57,
				success: true,
				error_message: null,
				affected_entities: [{ kind: 'document', id: 'doc-1', operation: 'updated' }],
				created_at: '2026-03-28T10:00:40.000Z'
			}
		];
		const turnRuns = [
			{
				id: 'turn-run-1',
				session_id: 'session-1',
				user_id: 'user-1',
				stream_run_id: 'stream-1',
				client_turn_id: 'turn-1',
				status: 'completed',
				finished_reason: 'stop',
				request_message: 'Create a task.',
				assistant_message_id: 'assistant-1',
				started_at: '2026-03-28T10:00:00.000Z',
				finished_at: '2026-03-28T10:01:00.000Z',
				created_at: '2026-03-28T10:00:00.000Z',
				updated_at: '2026-03-28T10:01:00.000Z'
			}
		];

		const sessionQuery = createQuery({ data: session, error: null });
		const messagesQuery = createQuery({ data: messages, error: null });
		const attachmentsQuery = createQuery({ data: [], error: null });
		const toolExecutionsQuery = createQuery({ data: toolExecutions, error: null });
		const turnRunsQuery = createQuery({ data: turnRuns, error: null });
		const tasksQuery = createQuery({
			data: [
				{
					id: 'task-1',
					title: 'Fix history restore',
					project_id: 'project-1'
				}
			],
			error: null
		});
		const projectsQuery = createQuery({
			data: [
				{
					id: 'project-1',
					name: 'Launch Project'
				}
			],
			error: null
		});
		const documentsQuery = createQuery({
			data: [
				{
					id: 'doc-1',
					title: 'Launch Notes',
					project_id: 'project-1'
				}
			],
			error: null
		});
		const turnEventsQuery = createQuery({
			data: [
				{
					id: 'event-1',
					session_id: 'session-1',
					user_id: 'user-1',
					turn_run_id: 'turn-run-1',
					stream_run_id: 'stream-1',
					event_type: 'tool_started',
					phase: 'tool',
					payload: { message: 'Creating task' },
					sequence_index: 1,
					created_at: '2026-03-28T10:00:20.000Z'
				}
			],
			error: null
		});
		const supabase = {
			from: vi.fn((table: string) => {
				if (table === 'chat_sessions') return sessionQuery;
				if (table === 'chat_messages') return messagesQuery;
				if (table === 'chat_message_attachments') return attachmentsQuery;
				if (table === 'chat_tool_executions') return toolExecutionsQuery;
				if (table === 'chat_turn_runs') return turnRunsQuery;
				if (table === 'chat_turn_events') return turnEventsQuery;
				if (table === 'onto_tasks') return tasksQuery;
				if (table === 'onto_projects') return projectsQuery;
				if (table === 'onto_documents') return documentsQuery;
				throw new Error(`Unexpected table ${table}`);
			})
		};

		const response = await GET({
			params: { id: 'session-1' },
			url: new URL('http://localhost/api/chat/sessions/session-1'),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.data.messages).toEqual(messages);
		expect(payload.data.toolExecutions).toEqual(toolExecutions);
		expect(payload.data.turnRuns).toEqual(turnRuns);
		expect(payload.data.timelineItems).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'turn_run:turn-run-1',
					kind: 'status',
					status: 'completed'
				}),
				expect.objectContaining({
					id: 'turn_event:event-1',
					kind: 'step',
					title: 'Creating task'
				}),
				expect.objectContaining({
					id: 'tool_execution:exec-1',
					kind: 'tool',
					tool: expect.objectContaining({ name: 'create_onto_task' })
				}),
				expect.objectContaining({
					id: 'entity_change:exec-1:task:task-1',
					kind: 'change',
					entityRefs: [
						expect.objectContaining({
							kind: 'task',
							id: 'task-1',
							title: 'Fix history restore',
							projectId: 'project-1',
							url: '/projects/project-1?entity=task&entity_id=task-1',
							operation: 'created'
						})
					],
					projectRef: expect.objectContaining({
						id: 'project-1',
						title: 'Launch Project',
						url: '/projects/project-1'
					})
				}),
				expect.objectContaining({
					id: 'entity_change:exec-2:document:doc-1',
					kind: 'change',
					summary: 'Launch Notes',
					entityRefs: [
						expect.objectContaining({
							kind: 'document',
							id: 'doc-1',
							title: 'Launch Notes',
							projectId: 'project-1',
							url: '/projects/project-1?doc=doc-1',
							operation: 'updated'
						})
					],
					projectRef: expect.objectContaining({
						id: 'project-1',
						title: 'Launch Project',
						url: '/projects/project-1'
					})
				}),
				expect.objectContaining({
					id: 'message:assistant-1',
					kind: 'message'
				})
			])
		);
		expect(supabase.from).toHaveBeenCalledWith('chat_tool_executions');
		expect(supabase.from).toHaveBeenCalledWith('chat_message_attachments');
		expect(supabase.from).toHaveBeenCalledWith('chat_turn_runs');
		expect(supabase.from).toHaveBeenCalledWith('chat_turn_events');
		expect(supabase.from).toHaveBeenCalledWith('onto_tasks');
		expect(supabase.from).toHaveBeenCalledWith('onto_documents');
		expect(supabase.from).toHaveBeenCalledWith('onto_projects');
		expect(toolExecutionsQuery.eq).toHaveBeenCalledWith('session_id', 'session-1');
		expect(turnRunsQuery.eq).toHaveBeenCalledWith('session_id', 'session-1');
		expect(turnRunsQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
		expect(turnEventsQuery.eq).toHaveBeenCalledWith('session_id', 'session-1');
		expect(turnEventsQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
		expect(tasksQuery.in).toHaveBeenCalledWith('id', ['task-1']);
		expect(documentsQuery.in).toHaveBeenCalledWith('id', ['doc-1']);
		expect(projectsQuery.in).toHaveBeenCalledWith('id', ['project-1']);
	});

	it('hydrates persisted image attachments when restoring a chat session', async () => {
		const session = {
			id: 'session-1',
			user_id: 'user-1',
			context_type: 'project',
			entity_id: 'project-1',
			title: 'Image chat',
			auto_title: null,
			summary: null
		};
		const messages = [
			{
				id: 'message-1',
				session_id: 'session-1',
				user_id: 'user-1',
				role: 'user',
				content: 'Attached 1 image',
				created_at: '2026-05-15T10:00:00.000Z',
				metadata: { attachment_only: true },
				tool_calls: null,
				tool_call_id: null
			}
		];
		const attachments = [
			{
				message_id: 'message-1',
				asset_id: 'asset-1',
				project_id: 'project-1',
				attachment_kind: 'onto_asset',
				media_type: 'image',
				role: 'analysis_target',
				display_order: 0,
				metadata: {},
				asset: {
					id: 'asset-1',
					project_id: 'project-1',
					original_filename: 'screenshot.png',
					content_type: 'image/png',
					file_size_bytes: 2048,
					width: 1200,
					height: 900,
					checksum_sha256: 'a'.repeat(64),
					ocr_status: 'complete',
					extraction_summary: 'Screenshot of the settings page.',
					extracted_text: 'Settings'
				}
			}
		];

		const supabase = {
			from: vi.fn((table: string) => {
				if (table === 'chat_sessions') return createQuery({ data: session, error: null });
				if (table === 'chat_messages') return createQuery({ data: messages, error: null });
				if (table === 'chat_message_attachments') {
					return createQuery({ data: attachments, error: null });
				}
				if (table === 'chat_tool_executions') return createQuery({ data: [], error: null });
				if (table === 'chat_turn_runs') return createQuery({ data: [], error: null });
				if (table === 'chat_turn_events') return createQuery({ data: [], error: null });
				throw new Error(`Unexpected table ${table}`);
			})
		};

		const response = await GET({
			params: { id: 'session-1' },
			url: new URL('http://localhost/api/chat/sessions/session-1'),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.data.messages[0].attachments).toEqual([
			expect.objectContaining({
				attachment_kind: 'onto_asset',
				media_type: 'image',
				asset_id: 'asset-1',
				file_name: 'screenshot.png',
				ocr_status: 'complete',
				extracted_text_preview: 'Settings',
				metadata: {
					preview_url: '/api/onto/assets/asset-1/render?width=160'
				}
			})
		]);
	});
});
