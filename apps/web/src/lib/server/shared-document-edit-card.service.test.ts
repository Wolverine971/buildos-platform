// apps/web/src/lib/server/shared-document-edit-card.service.test.ts
//
// The confirm card's click is the only consent for editing a parent's shared
// document from a child chat. These tests hold the resolver to that: the edit
// comes only from the ledger, ownership/session/expiry/turn are enforced, the
// claim is single-use under concurrency, and apply/copy run the exact edit
// through the chat's document update with the previewed version.
import { describe, expect, it, vi } from 'vitest';
import type { ProjectFamilyV1 } from '@buildos/shared-types';
import {
	resolveSharedDocumentEditCard,
	sharedDocumentEditResolutionId,
	type SharedDocumentEditCardDeps
} from './shared-document-edit-card.service';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [USER, SESSION, CHILD, PARENT, DOC, FOLDER, CARD, TURN, MESSAGE, ACTOR, COPY] = Array.from(
	{ length: 11 },
	(_, n) => id(n + 1)
) as [string, string, string, string, string, string, string, string, string, string, string];
const VERSION = '2026-09-30T12:00:00.123456+00:00';
const PROPOSED_AT = '2026-09-30T12:01:00.000Z';
const NOW = new Date('2026-09-30T12:05:00.000Z');
const EDIT = { document_id: DOC, edits: [{ old_text: '$1,500', new_text: '$1,800' }] };

type Row = Record<string, any>;

/** Minimal PostgREST-shaped fake: filters, unique ids, and the ledger's transition rules. */
function fakeDb(tables: Record<string, Row[]>) {
	const writes: Array<{ table: string; op: string; row?: Row }> = [];
	function from(table: string) {
		const rows = (tables[table] ??= []);
		const filters: Array<(row: Row) => boolean> = [];
		let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
		let payload: Row | null = null;
		const matching = () => rows.filter((row) => filters.every((f) => f(row)));
		const run = async () => {
			if (op === 'insert') {
				if (rows.some((row) => row.id === payload!.id))
					return { data: null, error: { code: '23505', message: 'duplicate key' } };
				const row = {
					state: 'reserved',
					reserved_at: NOW.toISOString(),
					started_at: null,
					finished_at: null,
					downstream_receipt: null,
					...payload
				};
				rows.push(row);
				writes.push({ table, op, row });
				return { data: row, error: null };
			}
			if (op === 'update') {
				for (const row of matching()) {
					if (
						table === 'chat_turn_effects' &&
						['succeeded', 'failed'].includes(row.state)
					)
						return { data: null, error: { message: 'terminal is immutable' } };
					Object.assign(row, payload);
					writes.push({ table, op, row: { ...row } });
				}
				return { data: null, error: null };
			}
			if (op === 'delete') {
				for (const row of matching()) rows.splice(rows.indexOf(row), 1);
				writes.push({ table, op });
				return { data: null, error: null };
			}
			return { data: matching(), error: null };
		};
		const query: any = {
			select: () => query,
			insert: (row: Row) => ((op = 'insert'), (payload = row), query),
			update: (patch: Row) => ((op = 'update'), (payload = patch), query),
			delete: () => ((op = 'delete'), query),
			eq: (key: string, value: unknown) => (filters.push((row) => row[key] === value), query),
			in: (key: string, values: unknown[]) => (
				filters.push((row) => values.includes(row[key])),
				query
			),
			is: (key: string, value: unknown) => (
				filters.push((row) => (row[key] ?? null) === value),
				query
			),
			maybeSingle: async () => {
				const result = await run();
				if (result.error) return result;
				const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
				return { data: data ? { ...data } : null, error: null };
			},
			single: async () => {
				const result = await run();
				return { data: result.data, error: result.error };
			},
			then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
				run().then(resolve, reject)
		};
		return query;
	}
	return { from, tables, writes };
}

function cardReceipt() {
	return {
		status: 'confirmation_required',
		requires_user_action: true,
		confirmation_kind: 'shared_document_edit_v1',
		card_version: 2,
		card_id: CARD,
		source_user_message_id: MESSAGE,
		pending_edit: {
			document_id: DOC,
			child_project_id: CHILD,
			parent_project_id: PARENT,
			shared_folder_id: FOLDER,
			shared_with_count: 5,
			document_version: VERSION,
			arguments: EDIT
		},
		client_action: {
			kind: 'confirm_shared_document_edit',
			action_id: CARD,
			card_id: CARD,
			session_id: SESSION,
			document_id: DOC,
			document_title: 'Rate card',
			parent_project_id: PARENT,
			parent_name: 'Wayne Strategies',
			child_project_id: CHILD,
			shared_with_count: 5,
			change: null,
			field_changes: [],
			expires_at: '2026-10-01T12:01:00.000Z'
		},
		message: 'Nothing has changed yet.'
	};
}

function family(overrides: Partial<ProjectFamilyV1['parent'] & object> = {}): ProjectFamilyV1 {
	return {
		project_id: CHILD,
		parent: {
			id: PARENT,
			name: 'Wayne Strategies',
			state_key: 'active',
			can_write: true,
			shared_folder_document_id: FOLDER,
			child_count: 5,
			can_detach: false,
			...overrides
		},
		shelf: [
			{
				id: DOC,
				title: 'Rate card',
				description: null,
				type_key: 'document.default',
				state_key: 'draft',
				updated_at: VERSION,
				tree_parent_id: null,
				depth: 0
			}
		],
		children: [],
		own_shared_folder_document_id: null,
		child_count: 0
	};
}

function fixture() {
	const admin = fakeDb({
		chat_turn_effects: [
			{
				id: CARD,
				turn_run_id: TURN,
				session_id: SESSION,
				user_id: USER,
				execution_generation: 1,
				tool_name: 'update_onto_document',
				operation_name: 'onto.document.update',
				state: 'succeeded',
				reserved_at: '2026-09-30T12:00:30.000Z',
				started_at: '2026-09-30T12:00:31.000Z',
				finished_at: PROPOSED_AT,
				downstream_receipt: cardReceipt()
			}
		],
		chat_turn_runs: [{ id: TURN, user_id: USER, status: 'completed' }],
		chat_tool_executions: [
			{ id: 'exec-1', effect_id: CARD, session_id: SESSION, result: cardReceipt() }
		]
	});
	const userDb = fakeDb({
		onto_documents: [
			{ id: DOC, project_id: PARENT, updated_at: VERSION, deleted_at: null },
			{ id: id(77), project_id: CHILD, updated_at: VERSION, deleted_at: null }
		],
		onto_projects: [{ id: CHILD, name: 'Redline' }]
	});
	const rpc = vi.fn(async (name: string) =>
		name === 'ensure_actor_for_user'
			? { data: ACTOR, error: null }
			: { data: true, error: null }
	);
	const userClient = { from: userDb.from, rpc } as never;
	const deps = {
		runGatewayWriteOp: vi.fn(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
			return { ok: true, data: {} };
		}),
		copyInheritedDocument: vi.fn(async () => ({
			status: 'copied' as const,
			document: { id: COPY, title: 'Rate card' },
			warnings: []
		})),
		getProjectFamily: vi.fn(async () => family()),
		sleep: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
		now: () => NOW
	} satisfies Partial<SharedDocumentEditCardDeps>;
	const resolve = (
		choice: 'apply' | 'copy' | 'cancel',
		overrides: { userId?: string; sessionId?: string } = {}
	) =>
		resolveSharedDocumentEditCard({
			cardId: CARD,
			sessionId: overrides.sessionId ?? SESSION,
			choice,
			userId: overrides.userId ?? USER,
			userClient,
			admin: admin as never,
			deps: deps as never
		});
	const resolutionRow = () =>
		admin.tables.chat_turn_effects!.find(
			(row) => row.id === sharedDocumentEditResolutionId(CARD)
		);
	return { admin, userDb, rpc, deps, resolve, resolutionRow };
}

describe('resolveSharedDocumentEditCard', () => {
	it('applies the exact ledger-held edit to the parent, guarded by the previewed version', async () => {
		const f = fixture();
		const result = await f.resolve('apply');
		expect(result).toMatchObject({
			ok: true,
			alreadyResolved: false,
			resolution: {
				card_id: CARD,
				choice: 'apply',
				outcome: 'applied',
				parent_name: 'Wayne Strategies',
				shared_with_count: 5,
				copy: null
			}
		});
		expect(f.deps.runGatewayWriteOp).toHaveBeenCalledTimes(1);
		expect(f.deps.runGatewayWriteOp).toHaveBeenCalledWith({
			admin: expect.objectContaining({ rpc: f.rpc }),
			userId: USER,
			scope: {
				mode: 'read_write',
				allowed_ops: ['onto.document.update'],
				project_ids: [PARENT],
				write_project_ids: [PARENT]
			},
			op: 'onto.document.update',
			args: EDIT,
			chatSessionId: SESSION,
			documentWriteGuard: { documentId: DOC, projectId: PARENT, updatedAt: VERSION }
		});
		// Recorded in the ledger and mirrored onto the card's tool result.
		expect(f.resolutionRow()).toMatchObject({
			state: 'succeeded',
			tool_name: 'shared_document_edit_card',
			turn_run_id: TURN,
			downstream_receipt: { outcome: 'applied' }
		});
		expect(f.admin.tables.chat_tool_executions![0]!.result.card_resolution).toMatchObject({
			outcome: 'applied'
		});
		// The ledger requires reserved <= started <= finished.
		const ledger = f.resolutionRow()!;
		expect(Date.parse(ledger.started_at)).toBeGreaterThan(Date.parse(ledger.reserved_at));
		expect(Date.parse(ledger.finished_at)).toBeGreaterThan(Date.parse(ledger.started_at));
	});

	it('copies into the child at the previewed version and applies the same edit to the copy', async () => {
		const f = fixture();
		const result = await f.resolve('copy');
		expect(result).toMatchObject({
			ok: true,
			resolution: {
				outcome: 'copied',
				copy: {
					document_id: COPY,
					project_id: CHILD,
					project_name: 'Redline',
					edit_applied: true
				}
			}
		});
		expect(f.deps.copyInheritedDocument).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: USER,
				actorId: ACTOR,
				projectId: CHILD,
				parentId: PARENT,
				documentId: DOC,
				changeSource: 'chat',
				expectedUpdatedAt: VERSION
			})
		);
		expect(f.deps.runGatewayWriteOp).toHaveBeenCalledWith(
			expect.objectContaining({
				scope: expect.objectContaining({
					project_ids: [CHILD],
					write_project_ids: [CHILD]
				}),
				args: { ...EDIT, document_id: COPY }
			})
		);
		expect(f.rpc).toHaveBeenCalledWith('current_actor_has_project_member_access', {
			p_project_id: CHILD,
			p_required_access: 'write'
		});
	});

	it('reports a copy whose edit could not be applied', async () => {
		const f = fixture();
		f.deps.runGatewayWriteOp.mockResolvedValueOnce({
			ok: false,
			error: { code: 'VALIDATION_ERROR', message: 'old_text was not found' }
		} as never);
		const result = await f.resolve('copy');
		expect(result).toMatchObject({
			ok: true,
			resolution: { outcome: 'copied', copy: { edit_applied: false } }
		});
	});

	it('cancels without touching any document', async () => {
		const f = fixture();
		await expect(f.resolve('cancel')).resolves.toMatchObject({
			ok: true,
			resolution: { outcome: 'cancelled', choice: 'cancel' }
		});
		expect(f.deps.runGatewayWriteOp).not.toHaveBeenCalled();
		expect(f.deps.copyInheritedDocument).not.toHaveBeenCalled();
		expect(f.resolutionRow()).toMatchObject({ state: 'succeeded' });
	});

	it.each([
		['another user', { userId: id(90) }],
		['another session', { sessionId: id(91) }]
	])('hides the card from %s', async (_label, overrides) => {
		const f = fixture();
		await expect(f.resolve('apply', overrides)).resolves.toMatchObject({
			ok: false,
			status: 404,
			code: 'CARD_NOT_FOUND'
		});
		expect(f.deps.runGatewayWriteOp).not.toHaveBeenCalled();
		expect(f.resolutionRow()).toBeUndefined();
	});

	it('refuses a retired typed-yes preview', async () => {
		const f = fixture();
		f.admin.tables.chat_turn_effects![0]!.downstream_receipt = {
			status: 'confirmation_required',
			confirmation_kind: 'shared_document_edit_v1',
			confirmation_token: CARD
		};
		await expect(f.resolve('apply')).resolves.toMatchObject({ status: 404 });
	});

	it('expires 24 hours after the card was shown', async () => {
		const f = fixture();
		f.admin.tables.chat_turn_effects![0]!.finished_at = '2026-09-29T12:04:59.000Z';
		await expect(f.resolve('apply')).resolves.toMatchObject({
			ok: false,
			status: 410,
			code: 'CARD_EXPIRED'
		});
		expect(f.deps.runGatewayWriteOp).not.toHaveBeenCalled();
	});

	it('waits for the reply that showed the card to finish', async () => {
		const f = fixture();
		f.admin.tables.chat_turn_runs![0]!.status = 'running';
		await expect(f.resolve('apply')).resolves.toMatchObject({
			status: 409,
			code: 'TURN_IN_PROGRESS'
		});
		expect(f.resolutionRow()).toBeUndefined();
	});

	it('returns the recorded result to a second click instead of acting again', async () => {
		const f = fixture();
		await f.resolve('apply');
		const again = await f.resolve('copy');
		expect(again).toMatchObject({
			ok: true,
			alreadyResolved: true,
			resolution: { choice: 'apply', outcome: 'applied' }
		});
		expect(f.deps.runGatewayWriteOp).toHaveBeenCalledTimes(1);
		expect(f.deps.copyInheritedDocument).not.toHaveBeenCalled();
	});

	it('lets exactly one of two concurrent clicks act; the other gets its result', async () => {
		const f = fixture();
		const [first, second] = await Promise.all([f.resolve('apply'), f.resolve('copy')]);
		const results = [first, second];
		expect(results.every((result) => result.ok)).toBe(true);
		expect(results.filter((result) => result.ok && result.alreadyResolved)).toHaveLength(1);
		const outcomes = results.map((result) => (result.ok ? result.resolution.outcome : null));
		expect(outcomes[0]).toBe(outcomes[1]);
		expect(
			f.deps.runGatewayWriteOp.mock.calls.length +
				f.deps.copyInheritedDocument.mock.calls.length
		).toBe(1);
	});

	it('resolves as stale when the shared copy changed since the preview, writing nothing', async () => {
		const f = fixture();
		f.userDb.tables.onto_documents![0]!.updated_at = '2026-09-30T12:03:00+00:00';
		await expect(f.resolve('apply')).resolves.toMatchObject({
			ok: true,
			resolution: { outcome: 'stale' }
		});
		expect(f.deps.runGatewayWriteOp).not.toHaveBeenCalled();
		expect(f.resolutionRow()).toMatchObject({
			state: 'failed',
			failure_code: 'shared_document_changed'
		});
	});

	it('resolves as stale when the version guard trips at write time (never rebases)', async () => {
		const f = fixture();
		f.deps.runGatewayWriteOp.mockResolvedValueOnce({
			ok: false,
			error: {
				code: 'CONFLICT',
				message: 'changed',
				details: { confirmation_changed: true }
			}
		} as never);
		await expect(f.resolve('apply')).resolves.toMatchObject({
			ok: true,
			resolution: { outcome: 'stale' }
		});
		expect(f.deps.runGatewayWriteOp).toHaveBeenCalledTimes(1);
	});

	it('resolves as stale when the document left the shared shelf', async () => {
		const f = fixture();
		f.deps.getProjectFamily.mockResolvedValue({ ...family(), shelf: [] });
		await expect(f.resolve('copy')).resolves.toMatchObject({
			ok: true,
			resolution: { outcome: 'stale' }
		});
		expect(f.deps.copyInheritedDocument).not.toHaveBeenCalled();
	});

	it('keeps the card open when the user cannot write to the parent', async () => {
		const f = fixture();
		f.deps.getProjectFamily.mockResolvedValue(family({ can_write: false }));
		await expect(f.resolve('apply')).resolves.toMatchObject({
			ok: false,
			status: 403,
			code: 'PARENT_WRITE_REQUIRED'
		});
		expect(f.deps.runGatewayWriteOp).not.toHaveBeenCalled();
		expect(f.resolutionRow()).toBeUndefined();
		// Another choice still works.
		await expect(f.resolve('cancel')).resolves.toMatchObject({
			ok: true,
			resolution: { outcome: 'cancelled' }
		});
	});

	it('keeps the card open when the user cannot write to the child', async () => {
		const f = fixture();
		f.rpc.mockImplementation(async (name: string) =>
			name === 'ensure_actor_for_user'
				? { data: ACTOR, error: null }
				: { data: false, error: null }
		);
		await expect(f.resolve('copy')).resolves.toMatchObject({
			ok: false,
			status: 403,
			code: 'PROJECT_WRITE_REQUIRED'
		});
		expect(f.deps.copyInheritedDocument).not.toHaveBeenCalled();
		expect(f.resolutionRow()).toBeUndefined();
	});

	it('releases the claim when the write is refused without writing', async () => {
		const f = fixture();
		f.deps.runGatewayWriteOp.mockResolvedValueOnce({
			ok: false,
			error: { code: 'FORBIDDEN', message: 'no access' }
		} as never);
		await expect(f.resolve('apply')).resolves.toMatchObject({ ok: false, status: 403 });
		expect(f.resolutionRow()).toBeUndefined();
	});

	it('records an unknown outcome when the write may have happened', async () => {
		const f = fixture();
		f.deps.runGatewayWriteOp.mockRejectedValueOnce(new Error('socket hang up'));
		await expect(f.resolve('apply')).resolves.toMatchObject({
			ok: true,
			resolution: { outcome: 'unknown' }
		});
		expect(f.resolutionRow()).toMatchObject({ state: 'uncertain' });
	});
});
