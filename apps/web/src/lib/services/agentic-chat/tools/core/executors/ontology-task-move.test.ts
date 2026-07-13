// apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-task-move.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { OntologyWriteExecutor } from './ontology-write-executor';
import type { ExecutorContext } from './types';

const TASK_ID = 'd32bb5db-fc5a-4970-a341-88473ac7abdd';
const SOURCE_ID = '2dcdb7d3-e1c5-4619-8d2a-6e733dae71cf';
const DESTINATION_ID = '31021625-1377-4715-9fb4-f93102974628';

function jsonResponse(data: Record<string, unknown>) {
	return {
		ok: true,
		status: 200,
		statusText: 'OK',
		headers: { get: () => 'application/json' },
		json: async () => ({ success: true, data }),
		text: async () => JSON.stringify({ success: true, data })
	};
}

describe('OntologyWriteExecutor moveOntoTask', () => {
	let fetchFn: ReturnType<typeof vi.fn>;
	let executor: OntologyWriteExecutor;

	beforeEach(() => {
		fetchFn = vi.fn();
		const supabase = {
			auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) }
		} as unknown as SupabaseClient<Database>;
		const context: ExecutorContext = {
			supabase,
			userId: 'user-1',
			sessionId: 'session-1',
			fetchFn: fetchFn as unknown as typeof fetch,
			getActorId: async () => 'actor-1',
			getAdminSupabase: () => supabase as any,
			getAuthHeaders: async () => ({})
		};
		executor = new OntologyWriteExecutor(context);
	});

	it('preserves a confirmation preview as user action, without a context shift', async () => {
		fetchFn.mockResolvedValue(
			jsonResponse({
				status: 'confirmation_required',
				requires_user_action: true,
				confirmation_token: 'preview-token',
				message: 'Confirm one relationship detachment.'
			})
		);

		const result = await executor.moveOntoTask({
			task_id: TASK_ID,
			expected_source_project_id: SOURCE_ID,
			destination_project_id: DESTINATION_ID
		});

		expect(result).toMatchObject({
			status: 'confirmation_required',
			requires_user_action: true,
			confirmation_token: 'preview-token'
		});
		expect(result).not.toHaveProperty('context_shift');
	});

	it('focuses the destination after a completed move', async () => {
		fetchFn.mockResolvedValue(
			jsonResponse({
				status: 'moved',
				requires_user_action: false,
				task: { id: TASK_ID, title: 'Move me', project_id: DESTINATION_ID },
				destination_project: { id: DESTINATION_ID, name: 'Cadre' }
			})
		);

		const result = await executor.moveOntoTask({
			task_id: TASK_ID,
			expected_source_project_id: SOURCE_ID,
			destination_project_id: DESTINATION_ID,
			confirmation_token: 'confirmed-token'
		});

		expect(result).toMatchObject({
			status: 'moved',
			message: 'Moved task "Move me" to "Cadre"',
			context_shift: {
				new_context: 'project',
				entity_id: DESTINATION_ID,
				entity_name: 'Cadre'
			}
		});
		expect(fetchFn).toHaveBeenCalledWith(
			`/api/onto/tasks/${TASK_ID}/move`,
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					expected_source_project_id: SOURCE_ID,
					destination_project_id: DESTINATION_ID,
					confirmation_token: 'confirmed-token'
				})
			})
		);
	});
});
