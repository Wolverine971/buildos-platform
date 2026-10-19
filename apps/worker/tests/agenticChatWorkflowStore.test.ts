// apps/worker/tests/agenticChatWorkflowStore.test.ts
// Real PostgREST builders with a scripted fetch: no network or database calls.
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
	AGENTIC_CHAT_DOCUMENT_READ_POLICY_REF,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import {
	buildDocumentReadSnapshotV2,
	hashSpecialistSnapshotV2
} from '@buildos/agentic-chat-runtime/specialists';
import { describe, expect, it, vi } from 'vitest';
import {
	SupabaseAgenticChatWorkflowStore,
	type AgenticChatWorkflowStoreClient
} from '../src/workers/agentic-chat/workflow/workflow-store';

const TURN_RUN_ID = '10000000-0000-4000-8000-000000000001';
const TABLES = [
	'chat_turn_workflow_runs',
	'chat_turn_workflow_steps',
	'chat_turn_workflow_dispatches',
	'chat_turn_specialist_snapshots',
	'chat_turn_document_read_batches'
];

async function harness(beforeResponse?: (table: string) => void) {
	const run = {
		turn_run_id: TURN_RUN_ID,
		user_id: 'user-1',
		session_id: 'session-1',
		project_id: 'project-1',
		request_hash: 'a'.repeat(64),
		policy_ref: AGENTIC_CHAT_DOCUMENT_READ_POLICY_REF,
		phase: 'specialists',
		max_spend_micro_usd: 1000,
		synthesis_headroom_micro_usd: 100,
		max_physical_dispatches: 4,
		max_step_attempts: 2,
		whole_run_lifetime_ms: 30000,
		recovery_count: 0
	};
	const snapshot = buildDocumentReadSnapshotV2();
	const result = {
		version: 'agentic_chat_document_read_result_v1',
		documents: [{ id: 'document-1', text: 'Saved evidence.' }]
	};
	const rows: Record<string, unknown> = {
		chat_turn_workflow_runs: run,
		chat_turn_workflow_steps: [],
		chat_turn_workflow_dispatches: [],
		chat_turn_specialist_snapshots: {
			...run,
			snapshot,
			snapshot_hash: await hashSpecialistSnapshotV2(snapshot)
		},
		chat_turn_document_read_batches: {
			request_hash: run.request_hash,
			result,
			result_hash: createHash('sha256')
				.update(canonicalizeAgenticChatJson(result))
				.digest('hex')
		}
	};
	const requests: Array<{ table: string; signal: RequestInit['signal'] }> = [];
	const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
		const table = new URL(String(input)).pathname.split('/').at(-1)!;
		if (!(table in rows)) throw new Error(`Unexpected fixture table ${table}`);
		requests.push({ table, signal: init?.signal });
		beforeResponse?.(table);
		return new Response(JSON.stringify(rows[table]), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	});
	const client = createClient('https://fixture.supabase.test', 'fixture-key', {
		global: { fetch },
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
	return {
		store: new SupabaseAgenticChatWorkflowStore(
			client as unknown as AgenticChatWorkflowStoreClient
		),
		requests
	};
}

describe('SupabaseAgenticChatWorkflowStore read deadlines', () => {
	it('forwards the deadline to every workflow read, including nested snapshot and saved evidence reads', async () => {
		const { store, requests } = await harness();
		const signal = new AbortController().signal;
		await expect(store.loadRun(TURN_RUN_ID, signal)).resolves.toMatchObject({
			turnRunId: TURN_RUN_ID,
			specialistSnapshot: { profileVersion: 2 },
			documentReadResult: { documents: [{ id: 'document-1', text: 'Saved evidence.' }] }
		});
		expect(requests).toHaveLength(TABLES.length);
		expect(requests).toEqual(
			expect.arrayContaining(TABLES.map((table) => ({ table, signal })))
		);
	});

	it('does not start workflow reads after the deadline has already expired', async () => {
		const { store, requests } = await harness();
		const controller = new AbortController();
		const reason = new Error('Workflow read deadline expired');
		controller.abort(reason);
		await expect(store.loadRun(TURN_RUN_ID, controller.signal)).rejects.toBe(reason);
		expect(requests).toEqual([]);
	});

	it('does not start more reads when a late workflow response arrives after abort', async () => {
		const controller = new AbortController();
		const reason = new Error('Workflow read deadline expired');
		const { store, requests } = await harness((table) => {
			if (table === 'chat_turn_workflow_runs') controller.abort(reason);
		});
		await expect(store.loadRun(TURN_RUN_ID, controller.signal)).rejects.toBe(reason);
		expect(requests.map((request) => request.table)).toEqual(['chat_turn_workflow_runs']);
	});
});
