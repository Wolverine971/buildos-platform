// apps/web/src/lib/tests/agentic-e2e/book-loop.live.test.ts
// Book dogfood loop: sends ONE project-chat turn against the cloned book project in the
// isolated QA database and records the reply, tool calls, and a before/after row diff.
// Driven by scripts/book-loop/turn.sh; never runs in normal suites.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loginAndGetCookie } from './harness/auth';
import { provisionTestUser } from './harness/test-user';
import { createAgenticE2EWorkerClient } from './harness/worker-client';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

const TABLES = [
	'onto_documents',
	'onto_tasks',
	'onto_goals',
	'onto_plans',
	'onto_milestones',
	'onto_risks',
	'onto_edges'
] as const;
const IGNORED = new Set(['updated_at', 'search_vector', 'embedding', 'content_embedding']);
type Row = Record<string, unknown>;

function label(row: Row) {
	return String(
		row.title ?? row.name ?? `${row.rel ?? ''} ${row.src_kind ?? ''}→${row.dst_kind ?? ''}`
	);
}

function diffRows(before: Row[], after: Row[]) {
	const old = new Map(before.map((row) => [row.id, row]));
	const now = new Map(after.map((row) => [row.id, row]));
	const created = after
		.filter((row) => !old.has(row.id))
		.map((row) => ({ id: row.id, label: label(row), row }));
	const removed = before
		.filter((row) => !now.has(row.id))
		.map((row) => ({ id: row.id, label: label(row) }));
	const updated = after
		.filter((row) => old.has(row.id))
		.map((row) => {
			const prior = old.get(row.id)!;
			const changes = Object.fromEntries(
				Object.keys(row)
					.filter((key) => !IGNORED.has(key))
					.filter((key) => JSON.stringify(row[key]) !== JSON.stringify(prior[key]))
					.map((key) => [key, { before: prior[key], after: row[key] }])
			);
			return { id: row.id, label: label(row), changes };
		})
		.filter((entry) => Object.keys(entry.changes).length > 0);
	return { created, updated, removed };
}

describe.runIf(process.env.BOOK_LOOP === 'true')('book dogfood loop', () => {
	it('runs one book turn', async () => {
		// prod: DJ's real project on build-os.com, as DJ (2026-09-23). Guarded by an explicit
		// project confirmation; never provisions (that would rewrite the user's timezone).
		const prod = process.env.BOOK_LOOP_TARGET === 'prod';
		if (prod && process.env.BOOK_LOOP_PROD_CONFIRM !== process.env.BOOK_LOOP_PROJECT_ID)
			throw new Error('Prod turns require BOOK_LOOP_PROD_CONFIRM=<project id>');
		if (!prod && process.env.AGENTIC_GATE_DATABASE_ISOLATED !== 'true')
			throw new Error('Isolated database required');
		const baseUrl = process.env.AGENTIC_E2E_BASE_URL!;
		const email = process.env.AGENTIC_TEST_USER_EMAIL!;
		const password = process.env.AGENTIC_TEST_USER_PASSWORD!;
		const projectId = process.env.BOOK_LOOP_PROJECT_ID!;
		const message = process.env.BOOK_LOOP_MESSAGE!;
		const out = process.env.BOOK_LOOP_OUT!;
		expect(projectId && message && out).toBeTruthy();

		const { userId, cookie } = await loginAndGetCookie({ baseUrl, email, password });
		const db = prod
			? { admin: createAdminSupabaseClient(), userId }
			: await provisionTestUser({ userId, email });
		async function snapshot() {
			const rows = {} as Record<(typeof TABLES)[number], Row[]>;
			for (const table of TABLES) {
				const { data, error } = await db.admin
					.from(table)
					.select('*')
					.eq('project_id', projectId)
					.order('id');
				if (error) throw error;
				// Soft-deleted rows stay in the snapshot so deletes show up as `deleted_at` changes.
				rows[table] = (data ?? []) as Row[];
			}
			const { data, error } = await db.admin
				.from('onto_projects')
				.select('*')
				.eq('id', projectId)
				.single();
			if (error) throw error;
			return { project: data as Row, rows };
		}

		const before = await snapshot();
		const client = await createAgenticE2EWorkerClient({
			baseUrl,
			cookie,
			email,
			password,
			userId
		});
		let result;
		try {
			result = await client.runTurn({
				contextType: 'project',
				entityId: projectId,
				sessionId: process.env.BOOK_LOOP_SESSION_ID || undefined,
				message
			});
		} finally {
			await client.close();
		}
		const after = await snapshot();

		const diff = Object.fromEntries(
			TABLES.map((table) => [table, diffRows(before.rows[table], after.rows[table])])
		);
		const projectDiff = diffRows([before.project], [after.project]).updated[0]?.changes ?? {};
		mkdirSync(dirname(out), { recursive: true });
		writeFileSync(
			out,
			JSON.stringify(
				{
					message,
					sessionId: result.sessionId,
					completed: result.completed,
					finishedReason: result.finishedReason,
					errors: result.errors,
					assistantText: result.assistantText,
					toolCalls: result.toolCalls,
					toolResults: result.toolResults,
					skillActivity: result.skillActivity,
					usage: result.usage,
					totalDurationMs: result.timing.totalDurationMs,
					projectChanges: projectDiff,
					diff,
					documentsAfter: after.rows.onto_documents.map((d) => ({
						id: d.id,
						title: d.title,
						type_key: d.type_key,
						content: d.content
					}))
				},
				null,
				2
			)
		);
		expect(result.completed).toBe(true);
	}, 600_000);
});
