// apps/web/src/lib/server/chat-pending-change.test.ts
import { describe, expect, it, vi } from 'vitest';
import { loadPendingChangeView, readInScopePendingTurnContract } from './chat-pending-change';

const PROJECT = '445dd429-db93-4878-90a9-b3ab1627a9f2';
const OTHER_PROJECT = 'f85b6c5f-59fb-4e4c-8654-748f793d8f4b';
const DOC = '1cad2618-3188-43ac-98ff-e715a8a8013d';

function stored(patch: Record<string, unknown> = {}) {
	return {
		version: 1,
		contract: {
			version: 1,
			source: 'declared',
			outcomes: [
				{
					id: 'implicit_8',
					action: 'update',
					entityKind: 'document',
					targetIds: [DOC],
					requiredFields: ['edits'],
					minimumSuccessfulEffects: 1
				}
			]
		},
		contextType: 'project',
		projectId: PROJECT,
		originatingTurnRunId: '6b335d49-378a-4817-9e59-9a2ec182c1e4',
		createdAt: '2026-09-23T19:41:33.910Z',
		finishedReason: 'mutation_unfulfilled',
		...patch
	};
}

function session(pending: unknown, patch: Record<string, unknown> = {}) {
	return {
		context_type: 'project',
		entity_id: PROJECT,
		agent_metadata: { fastchat_pending_turn_contract: pending },
		...patch
	};
}

describe('readInScopePendingTurnContract', () => {
	it('returns the commission the next turn in this chat would carry', () => {
		expect(readInScopePendingTurnContract(session(stored()))?.contract.outcomes).toHaveLength(
			1
		);
	});

	it('ignores a commission from another scope, a cleared one, or none', () => {
		expect(
			readInScopePendingTurnContract(session(stored({ projectId: OTHER_PROJECT })))
		).toBeNull();
		expect(
			readInScopePendingTurnContract(
				session(stored(), { context_type: 'global', entity_id: null })
			)
		).toBeNull();
		expect(readInScopePendingTurnContract(session(null))).toBeNull();
		expect(
			readInScopePendingTurnContract({ ...session(null), agent_metadata: null })
		).toBeNull();
	});

	it('matches a global chat to a global commission', () => {
		expect(
			readInScopePendingTurnContract(
				session(stored({ contextType: 'global', projectId: null }), {
					context_type: 'global',
					entity_id: null
				})
			)
		).not.toBeNull();
	});
});

describe('loadPendingChangeView', () => {
	it('names the target with the caller’s client and skips lookups when nothing is owed', async () => {
		const query = {
			select: vi.fn().mockReturnThis(),
			in: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue({
				data: [{ id: DOC, title: 'Chapter 3 outline', project_id: PROJECT }],
				error: null
			})
		};
		const supabase = { from: vi.fn(() => query) };

		await expect(loadPendingChangeView(supabase, session(stored()))).resolves.toEqual({
			key: '6b335d49-378a-4817-9e59-9a2ec182c1e4@2026-09-23T19:41:33.910Z',
			createdAt: '2026-09-23T19:41:33.910Z',
			items: ['Update doc "Chapter 3 outline"']
		});
		expect(supabase.from).toHaveBeenCalledWith('onto_documents');

		supabase.from.mockClear();
		await expect(loadPendingChangeView(supabase, session(null))).resolves.toBeNull();
		expect(supabase.from).not.toHaveBeenCalled();
	});
});
