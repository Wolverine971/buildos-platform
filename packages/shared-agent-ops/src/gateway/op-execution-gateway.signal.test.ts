// packages/shared-agent-ops/src/gateway/op-execution-gateway.signal.test.ts
//
// A real supabase-js client over a fetch that never answers: the write deadline
// must reach the HTTP request itself, not just stop the caller from waiting.
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { bindGatewayClientSignal } from './op-execution-gateway.signal';
import { runGatewayWriteOp } from './op-execution-gateway.worker';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const PROJECT_ID = '10000000-0000-4000-8000-000000000002';
const DOCUMENT_ID = '10000000-0000-4000-8000-000000000003';

type SentRequest = { method: string; url: string; signal: AbortSignal | null };

/** Every request hangs until its own signal aborts; requests without one hang forever. */
function hangingClient() {
	const sent: SentRequest[] = [];
	const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
		const signal = init?.signal ?? null;
		sent.push({ method: init?.method ?? 'GET', url: String(input), signal });
		return new Promise<Response>((_resolve, reject) => {
			signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
		});
	});
	const client = createClient('http://localhost:54321', 'service-role-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { fetch: fetch as unknown as typeof globalThis.fetch }
	});
	return { client, sent };
}

describe('bindGatewayClientSignal', () => {
	it('cancels the HTTP request of a write when the signal aborts', async () => {
		const { client, sent } = hangingClient();
		const deadline = new AbortController();
		const bound = bindGatewayClientSignal(client, deadline.signal);

		// A PostgREST builder sends its request once something awaits it.
		const pending = Promise.resolve(
			bound
				.from('onto_documents')
				.update({ title: 'New title' })
				.eq('id', DOCUMENT_ID)
				.select('id, title')
				.single()
		);
		await vi.waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0]).toMatchObject({ method: 'PATCH' });
		expect(sent[0]?.signal?.aborted).toBe(false);

		deadline.abort(new Error('write deadline passed'));
		const result = await pending;

		expect(sent[0]?.signal?.aborted).toBe(true);
		expect(result.data).toBeNull();
		expect(result.error?.message).toContain('write deadline passed');
	});

	it('binds reads, RPCs, and other schemas too', async () => {
		const { client, sent } = hangingClient();
		const deadline = new AbortController();
		const bound = bindGatewayClientSignal(client, deadline.signal);

		const pending = Promise.all([
			bound.from('onto_documents').select('id').eq('id', DOCUMENT_ID).maybeSingle(),
			bound.rpc('ensure_actor_for_user', { p_user_id: USER_ID }),
			bound.schema('public').from('onto_projects').select('id')
		]);
		await vi.waitFor(() => expect(sent).toHaveLength(3));
		deadline.abort(new Error('write deadline passed'));
		const results = await pending;

		expect(sent.map((request) => request.signal?.aborted)).toEqual([true, true, true]);
		expect(results.every((result) => result.error !== null)).toBe(true);
	});

	it('reports every request that can change data, and no reads', () => {
		const { client } = hangingClient();
		const onMutatingRequest = vi.fn();
		const bound = bindGatewayClientSignal(client, new AbortController().signal, {
			onMutatingRequest
		});

		bound.from('onto_documents').select('id');
		bound.from('onto_documents').select('id', { count: 'exact', head: true });
		expect(onMutatingRequest).not.toHaveBeenCalled();

		bound.from('onto_tasks').insert({ title: 'a' } as never);
		bound.from('onto_tasks').upsert({ title: 'b' } as never);
		bound.from('onto_tasks').update({ title: 'c' } as never);
		bound.from('onto_tasks').delete();
		bound.rpc('get_onto_project_summaries_v1' as never, {} as never);
		bound
			.schema('public')
			.from('onto_goals')
			.update({ name: 'd' } as never);

		expect(onMutatingRequest.mock.calls.map(([request]) => request)).toEqual([
			{ kind: 'insert', target: 'onto_tasks' },
			{ kind: 'upsert', target: 'onto_tasks' },
			{ kind: 'update', target: 'onto_tasks' },
			{ kind: 'delete', target: 'onto_tasks' },
			{ kind: 'rpc', target: 'get_onto_project_summaries_v1' },
			{ kind: 'update', target: 'onto_goals' }
		]);
	});

	it('returns the client unchanged without a signal, and does not rebind', () => {
		const { client } = hangingClient();
		const signal = new AbortController().signal;
		expect(bindGatewayClientSignal(client, undefined)).toBe(client);
		const bound = bindGatewayClientSignal(client, signal);
		expect(bound).not.toBe(client);
		expect(bindGatewayClientSignal(bound, signal)).toBe(bound);
	});
});

describe('runGatewayWriteOp signal', () => {
	it('cancels a stuck update_onto_document at the HTTP layer', async () => {
		const { client, sent } = hangingClient();
		const deadline = new AbortController();

		const pending = runGatewayWriteOp({
			admin: client,
			userId: USER_ID,
			scope: {
				mode: 'read_write',
				allowed_ops: ['onto.document.update'],
				project_ids: [PROJECT_ID],
				write_project_ids: [PROJECT_ID]
			},
			op: 'onto.document.update',
			args: { document_id: DOCUMENT_ID, content: 'New body' },
			signal: deadline.signal
		});
		await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0));
		expect(sent.every((request) => request.signal?.aborted === false)).toBe(true);

		deadline.abort(new Error('write deadline passed'));
		const result = await pending;

		expect(result.ok).toBe(false);
		expect(sent.length).toBeGreaterThan(0);
		expect(sent.every((request) => request.signal?.aborted === true)).toBe(true);
	});
});
