// apps/web/src/routes/api/admin/chat/lite-prompt-preview/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { buildLitePromptPreviewMock } = vi.hoisted(() => ({
	buildLitePromptPreviewMock: vi.fn()
}));

vi.mock('$lib/services/agentic-chat-lite/preview', () => ({
	buildLitePromptPreview: buildLitePromptPreviewMock,
	LitePromptPreviewInputError: class LitePromptPreviewInputError extends Error {}
}));

import { POST } from './+server';

function createSupabase({ isAdmin = true } = {}) {
	return {
		from: vi.fn().mockImplementation((table: string) => {
			if (table !== 'admin_users') throw new Error(`Unexpected table: ${table}`);
			return {
				select: vi.fn().mockReturnThis(),
				eq: vi.fn().mockReturnThis(),
				single: vi.fn().mockResolvedValue({
					data: isAdmin ? { user_id: 'admin-1' } : null,
					error: isAdmin ? null : { message: 'not found' }
				})
			};
		})
	};
}

describe('POST /api/admin/chat/lite-prompt-preview', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		buildLitePromptPreviewMock.mockResolvedValue({
			prompt_variant: 'lite_seed_v1',
			lite: {
				system_prompt: '# BuildOS Lite Agentic Chat Prompt',
				sections: [{ id: 'identity_mission' }],
				context_inventory: {},
				tools_summary: {},
				cost_breakdown: {},
				tool_surface_report: {}
			}
		});
	});

	it('returns a lite prompt preview for admin users', async () => {
		const body = {
			context_type: 'global',
			sample_message: 'Preview this prompt.',
			include_current_v2: true
		};
		const response = await POST({
			request: new Request('http://localhost/api/admin/chat/lite-prompt-preview', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			}),
			locals: {
				supabase: createSupabase({ isAdmin: true }),
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.prompt_variant).toBe('lite_seed_v1');
		expect(buildLitePromptPreviewMock).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'admin-1',
				input: body
			})
		);
	});

	it('rejects unauthenticated users', async () => {
		const response = await POST({
			request: new Request('http://localhost/api/admin/chat/lite-prompt-preview', {
				method: 'POST',
				body: JSON.stringify({ context_type: 'global' })
			}),
			locals: {
				supabase: createSupabase({ isAdmin: true }),
				safeGetSession: vi.fn().mockResolvedValue({ user: null })
			}
		} as any);

		expect(response.status).toBe(401);
		expect(buildLitePromptPreviewMock).not.toHaveBeenCalled();
	});

	it('rejects non-admin users without building a preview', async () => {
		const response = await POST({
			request: new Request('http://localhost/api/admin/chat/lite-prompt-preview', {
				method: 'POST',
				body: JSON.stringify({ context_type: 'global' })
			}),
			locals: {
				supabase: createSupabase({ isAdmin: false }),
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(403);
		expect(payload.message).toContain('Admin access required');
		expect(buildLitePromptPreviewMock).not.toHaveBeenCalled();
	});
});
