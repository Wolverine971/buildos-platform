// apps/web/src/lib/services/agentic-chat-v2/turn-input-artifact-store.test.ts
import { requireTestValue } from '$lib/test-helpers/require-test-value';
import { describe, expect, it, vi } from 'vitest';
import {
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
	hashTurnInputArtifactContentV1,
	validateTurnInputArtifactV1,
	type TurnInputArtifactContentV1,
	type TurnInputArtifactV1
} from '@buildos/shared-types';
import {
	readVerifiedTurnInputArtifact,
	writeTurnInputArtifact
} from './turn-input-artifact-store.server';

type ArtifactRow = Record<string, unknown>;

const IDS = {
	artifact: 'a5000000-0000-4000-8000-000000000001',
	turn: 'a4000000-0000-4000-8000-000000000001',
	session: 'a1000000-0000-4000-8000-000000000001',
	user: 'a2000000-0000-4000-8000-000000000001',
	prepared: 'a3000000-0000-4000-8000-000000000001',
	historyMessage: 'a6000000-0000-4000-8000-000000000001',
	admittedMessage: 'a7000000-0000-4000-8000-000000000001'
} as const;

const CREATED_AT = '2026-08-01T12:00:00.000Z';
const RETAIN_UNTIL = '2026-08-08T12:00:00.000Z';

function contentFixture(): TurnInputArtifactContentV1 {
	return {
		artifactVersion: AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
		historySource: 'admission_window',
		history: [
			{
				sourceMessageId: IDS.historyMessage,
				role: 'user',
				content: 'Earlier question',
				attachments: [],
				toolCalls: [],
				toolCallId: null
			},
			{
				sourceMessageId: null,
				role: 'assistant',
				content: 'Earlier answer',
				attachments: [],
				toolCalls: [],
				toolCallId: null
			}
		],
		prepared: {
			sourcePreparedPromptId: IDS.prepared,
			contextPayload: { contextType: 'global', data: {} },
			conversationSummary: 'Earlier context',
			surfaceProfile: 'global',
			systemPrompt: 'System prompt',
			promptSections: [{ id: 'context', text: 'Trusted context' }],
			toolSurface: { names: ['get_workspace_overview'] },
			sessionSnapshot: { summary: 'Earlier context', agent_metadata: {} },
			contextUsageSnapshot: {
				estimatedTokens: 20,
				tokenBudget: 15_000,
				usagePercent: 0,
				tokensRemaining: 14_980,
				status: 'ok',
				lastCompressedAt: null,
				lastCompression: null
			}
		}
	};
}

async function storedRowFixture(
	overrides: Partial<ArtifactRow> = {},
	content: TurnInputArtifactContentV1 = contentFixture()
): Promise<ArtifactRow> {
	const artifact: TurnInputArtifactV1 = {
		...content,
		createdAt: CREATED_AT,
		retainUntil: RETAIN_UNTIL,
		contentHash: await hashTurnInputArtifactContentV1(content)
	};
	const validation = await validateTurnInputArtifactV1(artifact, {
		excludedMessageId: IDS.admittedMessage
	});
	if (!validation.ok) throw new Error(`Invalid test fixture: ${validation.code}`);

	return {
		id: IDS.artifact,
		turn_run_id: IDS.turn,
		session_id: IDS.session,
		user_id: IDS.user,
		source_prepared_prompt_id: IDS.prepared,
		artifact_version: artifact.artifactVersion,
		history_source: artifact.historySource,
		history: artifact.history,
		prepared: artifact.prepared,
		content_hash: artifact.contentHash,
		history_bytes: validation.historyBytes,
		content_bytes: validation.contentBytes,
		created_at: artifact.createdAt,
		retain_until: artifact.retainUntil,
		...overrides
	};
}

function createSupabaseMock(
	params: {
		row?: ArtifactRow | null;
		selectError?: unknown;
		insertError?: unknown;
	} = {}
) {
	const insertedRows: ArtifactRow[] = [];
	const filters: Array<[string, unknown]> = [];
	const selectCalls: string[] = [];

	const from = vi.fn((table: string) => {
		if (table !== 'chat_turn_input_artifacts') {
			throw new Error(`Unexpected table: ${table}`);
		}

		const builder = {
			insert: vi.fn(async (row: ArtifactRow) => {
				insertedRows.push(row);
				return { data: null, error: params.insertError ?? null };
			}),
			select: vi.fn((columns: string) => {
				selectCalls.push(columns);
				return builder;
			}),
			eq: vi.fn((column: string, value: unknown) => {
				filters.push([column, value]);
				return builder;
			}),
			maybeSingle: vi.fn(async () => ({
				data: params.row ?? null,
				error: params.selectError ?? null
			}))
		};
		return builder;
	});

	return { supabase: { from }, from, insertedRows, filters, selectCalls };
}

describe('turn input artifact store', () => {
	it('canonicalizes, hashes, counts, and writes one immutable artifact row', async () => {
		const mock = createSupabaseMock();
		const stored = await writeTurnInputArtifact({
			supabase: mock.supabase as any,
			id: IDS.artifact,
			turnRunId: IDS.turn,
			sessionId: IDS.session,
			userId: IDS.user,
			content: contentFixture(),
			excludedMessageId: IDS.admittedMessage,
			createdAt: CREATED_AT,
			retainUntil: RETAIN_UNTIL
		});

		expect(mock.insertedRows).toHaveLength(1);
		expect(mock.insertedRows[0]).toMatchObject({
			id: IDS.artifact,
			turn_run_id: IDS.turn,
			session_id: IDS.session,
			user_id: IDS.user,
			source_prepared_prompt_id: IDS.prepared,
			artifact_version: AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
			history_source: 'admission_window',
			content_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
			history_bytes: stored.historyBytes,
			content_bytes: stored.contentBytes,
			created_at: CREATED_AT,
			retain_until: RETAIN_UNTIL
		});
		expect(stored.artifact.contentHash).toBe(requireTestValue(mock.insertedRows[0]).content_hash);
		expect(stored.sourcePreparedPromptId).toBe(IDS.prepared);
	});

	it('rejects a frozen history that includes the newly admitted message', async () => {
		const mock = createSupabaseMock();
		const content = contentFixture();
		content.history.push({
			sourceMessageId: IDS.admittedMessage,
			role: 'user',
			content: 'Current question',
			attachments: [],
			toolCalls: [],
			toolCallId: null
		});

		await expect(
			writeTurnInputArtifact({
				supabase: mock.supabase as any,
				id: IDS.artifact,
				turnRunId: IDS.turn,
				sessionId: IDS.session,
				userId: IDS.user,
				content,
				excludedMessageId: IDS.admittedMessage,
				createdAt: CREATED_AT,
				retainUntil: RETAIN_UNTIL
			})
		).rejects.toMatchObject({ code: 'admitted_message_in_history' });
		expect(mock.insertedRows).toEqual([]);
	});

	it('loads only the exact artifact/turn/session/user scope and re-verifies content', async () => {
		const row = await storedRowFixture();
		const mock = createSupabaseMock({ row });

		const stored = await readVerifiedTurnInputArtifact({
			supabase: mock.supabase as any,
			id: IDS.artifact,
			turnRunId: IDS.turn,
			sessionId: IDS.session,
			userId: IDS.user,
			excludedMessageId: IDS.admittedMessage,
			nowMs: Date.parse(CREATED_AT) + 1
		});

		expect(mock.filters).toEqual([
			['id', IDS.artifact],
			['turn_run_id', IDS.turn],
			['session_id', IDS.session],
			['user_id', IDS.user]
		]);
		expect(mock.selectCalls[0]).not.toContain('*');
		expect(stored.artifact.history).toEqual(contentFixture().history);
		expect(stored.contentBytes).toBe(row.content_bytes);
	});

	it('fails closed when canonical content no longer matches the stored hash', async () => {
		const row = await storedRowFixture({
			history: [{ ...(contentFixture().history[0] as object), content: 'Tampered' }]
		});
		const mock = createSupabaseMock({ row });

		await expect(
			readVerifiedTurnInputArtifact({
				supabase: mock.supabase as any,
				id: IDS.artifact,
				turnRunId: IDS.turn,
				sessionId: IDS.session,
				userId: IDS.user,
				excludedMessageId: IDS.admittedMessage,
				nowMs: Date.parse(CREATED_AT) + 1
			})
		).rejects.toMatchObject({ code: 'hash_mismatch' });
	});

	it.each([
		['history byte count', { history_bytes: 1 }, 'history_bytes_mismatch'],
		['content byte count', { content_bytes: 1 }, 'content_bytes_mismatch'],
		['prepared lineage', { source_prepared_prompt_id: null }, 'source_lineage_mismatch']
	])('fails closed on a mismatched stored %s', async (_label, overrides, code) => {
		const mock = createSupabaseMock({ row: await storedRowFixture(overrides) });

		await expect(
			readVerifiedTurnInputArtifact({
				supabase: mock.supabase as any,
				id: IDS.artifact,
				turnRunId: IDS.turn,
				sessionId: IDS.session,
				userId: IDS.user,
				excludedMessageId: IDS.admittedMessage,
				nowMs: Date.parse(CREATED_AT) + 1
			})
		).rejects.toMatchObject({ code });
	});

	it('does not execute from an expired retained artifact', async () => {
		const mock = createSupabaseMock({ row: await storedRowFixture() });

		await expect(
			readVerifiedTurnInputArtifact({
				supabase: mock.supabase as any,
				id: IDS.artifact,
				turnRunId: IDS.turn,
				sessionId: IDS.session,
				userId: IDS.user,
				excludedMessageId: IDS.admittedMessage,
				nowMs: Date.parse(RETAIN_UNTIL)
			})
		).rejects.toMatchObject({ code: 'artifact_expired' });
	});

	it("preserves the validator's typed malformed-attachment failure for stored JSON", async () => {
		const mock = createSupabaseMock({
			row: await storedRowFixture({ history: [null] })
		});

		await expect(
			readVerifiedTurnInputArtifact({
				supabase: mock.supabase as any,
				id: IDS.artifact,
				turnRunId: IDS.turn,
				sessionId: IDS.session,
				userId: IDS.user,
				excludedMessageId: IDS.admittedMessage,
				nowMs: Date.parse(CREATED_AT) + 1
			})
		).rejects.toMatchObject({ code: 'invalid_attachments' });
	});

	it('converts malformed write content into a typed failure before insertion', async () => {
		const mock = createSupabaseMock();
		const content = contentFixture();
		(content as unknown as { history: unknown[] }).history = [null];

		await expect(
			writeTurnInputArtifact({
				supabase: mock.supabase as any,
				id: IDS.artifact,
				turnRunId: IDS.turn,
				sessionId: IDS.session,
				userId: IDS.user,
				content,
				excludedMessageId: IDS.admittedMessage,
				createdAt: CREATED_AT,
				retainUntil: RETAIN_UNTIL
			})
		).rejects.toMatchObject({ code: 'invalid_content' });
		expect(mock.insertedRows).toEqual([]);
	});

	it('surfaces database read/write errors without returning unverified content', async () => {
		const writeMock = createSupabaseMock({ insertError: { message: 'insert failed' } });
		await expect(
			writeTurnInputArtifact({
				supabase: writeMock.supabase as any,
				id: IDS.artifact,
				turnRunId: IDS.turn,
				sessionId: IDS.session,
				userId: IDS.user,
				content: contentFixture(),
				excludedMessageId: IDS.admittedMessage,
				createdAt: CREATED_AT,
				retainUntil: RETAIN_UNTIL
			})
		).rejects.toMatchObject({ code: 'database_error' });

		const readMock = createSupabaseMock({ selectError: { message: 'select failed' } });
		await expect(
			readVerifiedTurnInputArtifact({
				supabase: readMock.supabase as any,
				id: IDS.artifact,
				turnRunId: IDS.turn,
				sessionId: IDS.session,
				userId: IDS.user,
				excludedMessageId: IDS.admittedMessage
			})
		).rejects.toMatchObject({ code: 'database_error' });
	});
});
