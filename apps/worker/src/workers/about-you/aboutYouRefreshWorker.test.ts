// apps/worker/src/workers/about-you/aboutYouRefreshWorker.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ABOUT_YOU_TYPE_KEY,
	parseAboutYouDocument,
	renderAboutYouDocument
} from '@buildos/shared-agent-ops/ontology/about-you';

const gateway = vi.hoisted(() => ({ runGatewayWriteOp: vi.fn() }));
vi.mock('@buildos/shared-agent-ops/gateway/op-execution-gateway', () => gateway);
vi.mock('@buildos/shared-agent-ops/ontology/ontology-projects.service', () => ({
	ensureWorkspaceProjectId: vi.fn(async () => 'ws-1'),
	ensureActorId: vi.fn(async () => 'actor-1')
}));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../lib/services/smart-llm-service', () => ({ SmartLLMService: class {} }));

import { processAboutYouRefreshJob, readAboutYouState } from './aboutYouRefreshWorker';

const USER = '255735ad-a34b-4ca9-942c-397ed8cc1435';
const NOW = new Date('2026-10-23T20:00:00Z');

type Row = Record<string, unknown>;

/** A tiny in-memory stand-in for the supabase-js query builder (only what the job uses). */
function fakeDb(tables: Record<string, Row[]>, rpc: Record<string, unknown> = {}) {
	const from = (table: string) => {
		let rows = [...(tables[table] ?? [])];
		let limit = Infinity;
		const builder = {
			select: () => builder,
			eq: (column: string, value: unknown) => {
				rows = rows.filter((row) => row[column] === value);
				return builder;
			},
			is: (column: string, value: unknown) => {
				rows = rows.filter((row) => (row[column] ?? null) === value);
				return builder;
			},
			gt: (column: string, value: string) => {
				rows = rows.filter((row) => String(row[column]) > value);
				return builder;
			},
			in: (column: string, values: unknown[]) => {
				rows = rows.filter((row) => values.includes(row[column]));
				return builder;
			},
			order: (column: string, options: { ascending: boolean }) => {
				rows.sort(
					(a, b) =>
						String(a[column]).localeCompare(String(b[column])) *
						(options.ascending ? 1 : -1)
				);
				return builder;
			},
			limit: (count: number) => {
				limit = count;
				return builder;
			},
			maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
			then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
				resolve({ data: rows.slice(0, limit), error: null })
		};
		return builder;
	};
	return {
		from,
		rpc: async (name: string) => ({ data: rpc[name] ?? null, error: null })
	};
}

function job(data: Record<string, unknown> = {}) {
	return {
		id: 'job-1',
		data: { userId: USER, ...data },
		signal: new AbortController().signal,
		log: vi.fn(async () => undefined)
	} as never;
}

function messages(count: number, text = 'I work late into the night, after the baby sleeps') {
	return Array.from({ length: count }, (_, index) => ({
		id: `m${index}`,
		user_id: USER,
		role: 'user',
		session_id: 's1',
		content: `${text} (${index})`,
		created_at: new Date(Date.UTC(2026, 9, 20, 1, index)).toISOString()
	}));
}

const baseTables = (extra: Record<string, Row[]> = {}) => ({
	queue_jobs: [],
	onto_documents: [],
	chat_messages: messages(4),
	chat_sessions: [{ id: 's1', user_id: USER, context_type: 'global', entity_id: null }],
	...extra
});
const projects = [
	{ id: 'p1', name: 'BuildOS', kind: 'project', state_key: 'active' },
	{ id: 'ws-1', name: 'Workspace', kind: 'workspace', state_key: 'active' }
];

describe('processAboutYouRefreshJob', () => {
	beforeEach(() => {
		process.env.ABOUT_YOU_USER_IDS = USER;
		gateway.runGatewayWriteOp.mockReset();
		gateway.runGatewayWriteOp.mockResolvedValue({ ok: true, entityId: 'doc-1', data: {} });
	});
	afterEach(() => {
		delete process.env.ABOUT_YOU_USER_IDS;
	});

	it('does nothing for people outside the cohort', async () => {
		process.env.ABOUT_YOU_USER_IDS = '';
		const llm = { getJSONResponse: vi.fn() };
		const result = await processAboutYouRefreshJob(job(), {
			supabase: fakeDb(baseTables()) as never,
			llm,
			now: () => NOW
		});
		expect(result.outcome).toBe('skipped');
		expect(llm.getJSONResponse).not.toHaveBeenCalled();
	});

	it('waits until enough new messages arrive', async () => {
		const llm = { getJSONResponse: vi.fn() };
		const result = await processAboutYouRefreshJob(job(), {
			supabase: fakeDb(baseTables({ chat_messages: messages(2) })) as never,
			llm,
			now: () => NOW
		});
		expect(result).toMatchObject({ outcome: 'nothing_new', messagesRead: 2 });
		expect(llm.getJSONResponse).not.toHaveBeenCalled();
	});

	it('respects the daily cap unless asked', async () => {
		const recent = {
			user_id: USER,
			job_type: 'about_you_refresh',
			status: 'completed',
			completed_at: '2026-10-23T10:00:00Z',
			result: { outcome: 'updated' }
		};
		const llm = { getJSONResponse: vi.fn() };
		const result = await processAboutYouRefreshJob(job(), {
			supabase: fakeDb(baseTables({ queue_jobs: [recent] }), {
				get_onto_project_summaries_v1: projects
			}) as never,
			llm,
			now: () => NOW
		});
		expect(result).toMatchObject({ outcome: 'skipped', reason: 'daily cap' });
	});

	it('creates the note from the person’s own words, with its bookkeeping', async () => {
		const llm = {
			getJSONResponse: vi.fn().mockResolvedValue({
				lines: [
					{
						heading: 'Schedule and constraints',
						text: 'Works late into the night',
						basis: 'I work late into the night'
					}
				],
				changed: 'Added schedule.'
			})
		};
		const result = await processAboutYouRefreshJob(job(), {
			supabase: fakeDb(baseTables(), { get_onto_project_summaries_v1: projects }) as never,
			llm,
			now: () => NOW
		});
		expect(result).toMatchObject({ outcome: 'updated', linesWritten: 1, documentId: 'doc-1' });
		const prompt = llm.getJSONResponse.mock.calls[0]![0].userPrompt as string;
		expect(prompt).toContain('[2026-10-20 · Workspace chat] I work late into the night');
		expect(prompt).toContain('BuildOS');
		expect(prompt).not.toContain('Workspace;');
		const write = gateway.runGatewayWriteOp.mock.calls[0]![0];
		expect(write.op).toBe('onto.document.create');
		expect(write.args.type_key).toBe(ABOUT_YOU_TYPE_KEY);
		expect(write.args.content).toContain('- Works late into the night _(Oct 2026)_');
		const state = readAboutYouState(write.args.props);
		expect(state.last_written).toBe(write.args.content);
		expect(state.watermark_at).toBe(messages(4)[3]!.created_at);
	});

	it('creates no document when nothing qualifies', async () => {
		const llm = {
			getJSONResponse: vi.fn().mockResolvedValue({ lines: [], changed: 'nothing' })
		};
		const result = await processAboutYouRefreshJob(job(), {
			supabase: fakeDb(baseTables(), { get_onto_project_summaries_v1: projects }) as never,
			llm,
			now: () => NOW
		});
		expect(result.outcome).toBe('unchanged');
		expect(result.watermarkAt).toBe(messages(4)[3]!.created_at);
		expect(gateway.runGatewayWriteOp).not.toHaveBeenCalled();
	});

	it('never brings back a line the person deleted', async () => {
		const lastWritten = renderAboutYouDocument([
			{
				heading: 'Schedule and constraints',
				lines: [
					{ text: 'Works late into the night', noted: 'Oct 2026' },
					{ text: 'Owns firearms', noted: 'Oct 2026' }
				]
			}
		]);
		const edited = renderAboutYouDocument([
			{
				heading: 'Schedule and constraints',
				lines: [{ text: 'Works late into the night', noted: 'Oct 2026' }]
			}
		]);
		const doc = {
			id: 'doc-1',
			project_id: 'ws-1',
			type_key: ABOUT_YOU_TYPE_KEY,
			deleted_at: null,
			created_at: '2026-10-01T00:00:00Z',
			updated_at: '2026-10-22T00:00:00Z',
			content: edited,
			props: {
				about_you: {
					watermark_at: '2026-10-19T00:00:00Z',
					last_written: lastWritten,
					suppressed_keys: []
				}
			}
		};
		const llm = {
			getJSONResponse: vi.fn().mockResolvedValue({
				lines: [
					{ heading: 'Schedule and constraints', text: 'Works late into the night' },
					{ heading: 'Schedule and constraints', text: 'Owns firearms' }
				],
				changed: 'Kept schedule.'
			})
		};
		const result = await processAboutYouRefreshJob(job(), {
			supabase: fakeDb(baseTables({ onto_documents: [doc] }), {
				get_onto_project_summaries_v1: projects
			}) as never,
			llm,
			now: () => NOW
		});
		const prompt = llm.getJSONResponse.mock.calls[0]![0].userPrompt as string;
		expect(prompt).toContain('- owns firearms');
		expect(result.outcome).toBe('unchanged');
		const write = gateway.runGatewayWriteOp.mock.calls[0]![0];
		expect(write.op).toBe('onto.document.update');
		expect(write.args.content).toBeUndefined();
		expect(readAboutYouState(write.args.props).suppressed_keys).toEqual(['owns firearms']);
		expect(
			parseAboutYouDocument(readAboutYouState(write.args.props).last_written)
		).toHaveLength(1);
	});
});
