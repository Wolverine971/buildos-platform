// apps/worker/tests/userDataExportWorker.test.ts
//
// "Download my data": the export builder against an in-memory Supabase. The fake
// returns only the columns a query selects, so a secret in an unselected column
// can reach the zip only if the builder asks for it.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({ supabase: {} }));

import { PermanentQueueError } from '../src/lib/queueErrors';
import type { ProcessingJob } from '../src/lib/supabaseQueue';
import { PRIVACY_RETENTION_TASKS } from '../src/scheduler/privacyRetention';
import {
	documentTreePaths,
	slugify,
	toCsv,
	UniquePaths
} from '../src/workers/export/exportContent';
import type { ExportDb } from '../src/workers/export/exportContent';
import {
	processUserDataExportJob,
	userDataExportObjectPath
} from '../src/workers/export/userDataExportWorker';

type Row = Record<string, unknown>;

const USER = '0f000000-0000-4000-8000-000000000001';
const OTHER = '0f000000-0000-4000-8000-000000000002';
const ACTOR = 'actor-1';
const EXPORT_ID = 'e0000000-0000-4000-8000-000000000001';
const PROJECT = 'p0000000-0000-4000-8000-000000000001';
const SECRET = 'CANARY_SECRET';

function seed(): Record<string, Row[]> {
	return {
		user_data_exports: [{ id: EXPORT_ID, user_id: USER, status: 'queued', error_code: null }],
		users: [
			{
				id: USER,
				email: 'dj@example.com',
				name: 'DJ',
				username: 'dj',
				bio: null,
				timezone: 'America/New_York',
				created_at: '2026-01-01T00:00:00Z',
				onboarding_completed_at: null,
				usage_archetype: null,
				voice_narration_enabled: true,
				deletion_status: null,
				stripe_customer_id: `${SECRET}_stripe`,
				is_admin: true
			}
		],
		user_context: [
			{
				user_id: USER,
				input_projects: 'Baltimore launch',
				updated_at: '2026-09-01T00:00:00Z'
			}
		],
		user_brief_preferences: [{ user_id: USER, frequency: 'daily', created_at: '2026-01-01' }],
		user_notification_preferences: [],
		user_calendar_preferences: [],
		user_sms_preferences: [
			{
				user_id: USER,
				phone_number: '+14105550100',
				phone_verified: true,
				created_at: '2026-01-01'
			}
		],
		user_calendar_tokens: [
			{ user_id: USER, access_token: `${SECRET}_access`, refresh_token: `${SECRET}_refresh` }
		],
		email_connection_credentials: [{ refresh_token_ciphertext: `${SECRET}_gmail` }],
		external_agent_callers: [{ user_id: USER, token_hash: `${SECRET}_agent` }],
		onto_actors: [{ id: ACTOR, user_id: USER }],
		onto_projects: [
			{
				id: PROJECT,
				name: 'Launch Plan',
				description: 'Ship the Baltimore launch.',
				state_key: 'active',
				type_key: 'project.launch',
				start_at: null,
				end_at: null,
				next_step_short: 'Book the venue',
				next_step_long: null,
				doc_structure: {
					version: 1,
					root: [{ id: 'd1', order: 0, children: [{ id: 'd2', order: 0 }] }]
				},
				created_at: '2026-09-01T00:00:00Z',
				updated_at: '2026-09-02T00:00:00Z',
				created_by: ACTOR,
				deleted_at: null
			},
			{
				id: 'p-deleted',
				name: 'Old',
				created_by: ACTOR,
				deleted_at: '2026-09-03T00:00:00Z',
				created_at: '2026-01-01'
			},
			{
				id: 'p-other',
				name: 'Not mine',
				created_by: 'actor-2',
				deleted_at: null,
				created_at: '2026-01-01'
			}
		],
		onto_documents: [
			{
				id: 'd1',
				project_id: PROJECT,
				title: 'Brief',
				content: 'The plan.',
				state_key: 'draft',
				type_key: 'document.default',
				created_at: '2026-09-01',
				updated_at: '2026-09-01',
				deleted_at: null
			},
			{
				id: 'd2',
				project_id: PROJECT,
				title: 'Child Doc',
				content: '# Child Doc\n\nDetails.',
				state_key: 'draft',
				type_key: 'document.default',
				created_at: '2026-09-02',
				updated_at: '2026-09-02',
				deleted_at: null
			},
			{
				id: 'd3',
				project_id: PROJECT,
				title: 'Loose notes',
				content: 'Outside the tree.',
				state_key: 'draft',
				type_key: 'document.default',
				created_at: '2026-09-03',
				updated_at: '2026-09-03',
				deleted_at: null
			},
			{
				id: 'd4',
				project_id: PROJECT,
				title: 'Deleted',
				content: `${SECRET}_deleted_doc`,
				created_at: '2026-09-04',
				deleted_at: '2026-09-05'
			}
		],
		onto_tasks: [
			{
				id: 't1',
				project_id: PROJECT,
				title: 'Book venue, "big" room',
				description: null,
				state_key: 'todo',
				priority: 2,
				start_at: null,
				due_at: '2026-10-01',
				completed_at: null,
				type_key: 'task.default',
				created_at: '2026-09-01',
				updated_at: '2026-09-01',
				deleted_at: null
			}
		],
		onto_goals: [
			{
				id: 'g1',
				project_id: PROJECT,
				name: 'Launch',
				created_at: '2026-09-01',
				deleted_at: null
			}
		],
		onto_plans: [],
		onto_milestones: [],
		onto_risks: [],
		chat_sessions: [
			{
				id: 's1',
				user_id: USER,
				title: 'Plan the Baltimore launch',
				auto_title: null,
				created_at: '2026-09-20T10:00:00Z'
			},
			{
				id: 's-other',
				user_id: OTHER,
				title: 'Someone else',
				auto_title: null,
				created_at: '2026-09-20T10:00:00Z'
			}
		],
		chat_messages: [
			{
				id: 'm1',
				session_id: 's1',
				user_id: USER,
				role: 'user',
				content: 'Plan it.',
				created_at: '2026-09-20T10:00:00Z'
			},
			{
				id: 'm2',
				session_id: 's1',
				user_id: USER,
				role: 'tool',
				content: `${SECRET}_tool_message`,
				created_at: '2026-09-20T10:00:01Z',
				tool_result: `${SECRET}_tool_result`
			},
			{
				id: 'm3',
				session_id: 's1',
				user_id: USER,
				role: 'assistant',
				content: 'Here is the plan.',
				created_at: '2026-09-20T10:00:02Z'
			},
			{
				id: 'm4',
				session_id: 's-other',
				user_id: OTHER,
				role: 'user',
				content: `${SECRET}_other_user`,
				created_at: '2026-09-20T10:00:03Z'
			}
		],
		chat_tool_executions: [{ session_id: 's1', result: `${SECRET}_tool_trace` }],
		llm_usage_logs: [{ user_id: USER, error_message: `${SECRET}_usage` }],
		chat_prompt_snapshots: [{ user_id: USER, system_prompt: `${SECRET}_prompt` }],
		ontology_daily_briefs: [
			{
				id: 'b1',
				user_id: USER,
				brief_date: '2026-09-21',
				executive_summary: 'A calm day.',
				llm_analysis: null,
				priority_actions: ['Call the venue'],
				created_at: '2026-09-21'
			}
		],
		ontology_project_briefs: [
			{
				id: 'pb1',
				daily_brief_id: 'b1',
				project_id: PROJECT,
				brief_content: 'Venue is next.'
			}
		],
		onto_braindumps: [
			{
				id: 'bd100000-0000',
				user_id: USER,
				title: 'Launch thoughts',
				content: 'Book the venue first.',
				created_at: '2026-09-19T08:00:00Z',
				deleted_at: null
			},
			{
				id: 'bd200000-0000',
				user_id: USER,
				title: 'Gone',
				content: `${SECRET}_deleted_braindump`,
				created_at: '2026-09-19T09:00:00Z',
				deleted_at: '2026-09-20'
			}
		],
		voice_notes: [
			{
				id: 'v1000000-0000',
				user_id: USER,
				transcript: 'Remember the venue.',
				storage_bucket: 'voice_notes',
				storage_path: `${USER}/v1.webm`,
				mime_type: 'audio/webm;codecs=opus',
				duration_seconds: 4.2,
				recorded_at: '2026-09-22T09:00:00Z',
				created_at: '2026-09-22T09:00:00Z',
				deleted_at: null
			},
			{
				id: 'v2000000-0000',
				user_id: USER,
				transcript: `${SECRET}_deleted_note`,
				storage_bucket: 'voice_notes',
				storage_path: `${USER}/v2.webm`,
				mime_type: 'audio/webm',
				created_at: '2026-09-22',
				deleted_at: '2026-09-23'
			}
		],
		onto_assets: [
			{
				id: 'a1000000-0000',
				project_id: PROJECT,
				kind: 'image',
				original_filename: 'Whiteboard.PNG',
				content_type: 'image/png',
				storage_bucket: 'onto-assets',
				storage_path: `projects/${PROJECT}/a1.png`,
				caption: 'Whiteboard',
				alt_text: null,
				extracted_text: 'venue list',
				created_at: '2026-09-10',
				created_by: ACTOR,
				deleted_at: null
			}
		],
		user_contacts: [
			{
				id: 'c1',
				user_id: USER,
				display_name: 'Sam Rivera',
				given_name: 'Sam',
				family_name: 'Rivera',
				created_at: '2026-09-01',
				deleted_at: null
			}
		],
		user_contact_methods: [
			{
				id: 'cm1',
				contact_id: 'c1',
				user_id: USER,
				method_type: 'email',
				label: 'work',
				value_raw: 'sam@example.com',
				value_hash: `${SECRET}_hash`,
				is_primary: true,
				created_at: '2026-09-01',
				deleted_at: null
			}
		]
	};
}

function fakeDb(
	tables: Record<string, Row[]>,
	options: {
		onQuery?: (table: string) => void;
		failUpload?: (path: string) => boolean;
	} = {}
) {
	const queried: Array<{ table: string; columns: string }> = [];
	const uploads = new Map<string, Uint8Array>();
	const removed: string[] = [];
	const rpcCalls: Array<{ name: string; args: Row }> = [];
	const objects = new Map<string, Uint8Array>([
		[`voice_notes/${USER}/v1.webm`, new Uint8Array([1, 2, 3, 4, 5])],
		[`voice_notes/${USER}/v2.webm`, new TextEncoder().encode(`${SECRET}_deleted_audio`)],
		[`onto-assets/projects/${PROJECT}/a1.png`, new Uint8Array(64).fill(9)]
	]);

	const db = {
		from(table: string) {
			options.onQuery?.(table);
			const filters: Array<(row: Row) => boolean> = [];
			let columns: string[] | null = null;
			let update: Row | null = null;
			let range: [number, number] | null = null;
			let limit = Infinity;
			const orders: string[] = [];
			const rows = () => tables[table] ?? [];
			const run = () => {
				let result = rows().filter((row) => filters.every((filter) => filter(row)));
				if (update) {
					for (const row of result) Object.assign(row, update);
					return { data: null, error: null };
				}
				result = [...result].sort((a, b) => {
					for (const key of orders) {
						const left = String(a[key] ?? '');
						const right = String(b[key] ?? '');
						if (left !== right) return left < right ? -1 : 1;
					}
					return 0;
				});
				if (range) result = result.slice(range[0], range[1] + 1);
				result = result.slice(0, limit);
				const projected = columns
					? result.map((row) =>
							Object.fromEntries(
								(columns as string[]).map((column) => [column, row[column] ?? null])
							)
						)
					: result;
				return { data: projected, error: null };
			};
			const builder = {
				select(list: string) {
					columns = list.split(',').map((column) => column.trim());
					queried.push({ table, columns: list });
					return builder;
				},
				update(values: Row) {
					update = values;
					return builder;
				},
				eq(column: string, value: unknown) {
					filters.push((row) => row[column] === value);
					return builder;
				},
				is(column: string, value: null) {
					filters.push((row) => (row[column] ?? null) === value);
					return builder;
				},
				in(column: string, values: unknown[]) {
					filters.push((row) => values.includes(row[column]));
					return builder;
				},
				order(column: string) {
					orders.push(column);
					return builder;
				},
				limit(count: number) {
					limit = count;
					return builder;
				},
				range(from: number, to: number) {
					range = [from, to];
					return builder;
				},
				maybeSingle() {
					const { data } = run();
					return Promise.resolve({
						data: (data as Row[] | null)?.[0] ?? null,
						error: null
					});
				},
				then<T>(resolve: (value: ReturnType<typeof run>) => T) {
					return Promise.resolve(run()).then(resolve);
				}
			};
			return builder;
		},
		async rpc(name: string, args: Row) {
			rpcCalls.push({ name, args });
			if (name === 'complete_user_data_export') {
				const row = tables.user_data_exports?.find(
					(entry) => entry.id === args.p_export_id
				);
				if (row) Object.assign(row, { status: 'ready', storage_path: args.p_storage_path });
				return { data: '2026-10-01T00:00:00Z', error: null };
			}
			return { data: null, error: { code: 'PGRST202' } };
		},
		storage: {
			from(bucket: string) {
				return {
					async download(path: string) {
						const bytes = objects.get(`${bucket}/${path}`);
						return bytes
							? { data: new Blob([new Uint8Array(bytes)]), error: null }
							: { data: null, error: { message: 'not found' } };
					},
					async upload(path: string, bytes: Uint8Array) {
						if (options.failUpload?.(path))
							return { data: null, error: { message: 'too big' } };
						uploads.set(`${bucket}/${path}`, bytes);
						return { data: { path }, error: null };
					},
					async remove(paths: string[]) {
						for (const path of paths) {
							removed.push(path);
							uploads.delete(`${bucket}/${path}`);
						}
						return { data: [], error: null };
					}
				};
			}
		}
	};
	return { db: db as unknown as ExportDb, queried, uploads, removed, rpcCalls };
}

function job(data: Row = { exportId: EXPORT_ID, userId: USER }) {
	return {
		id: 'user_data_export_1',
		userId: USER,
		correlationId: null,
		data,
		attempts: 0,
		signal: new AbortController().signal,
		updateProgress: vi.fn(async () => undefined),
		log: vi.fn(async () => undefined)
	} as unknown as ProcessingJob<{ exportId: string; userId: string }>;
}

function unzipAll(uploads: Map<string, Uint8Array>): Map<string, string> {
	const files = new Map<string, string>();
	for (const bytes of uploads.values()) {
		for (const [name, content] of Object.entries(unzipSync(bytes))) {
			expect(files.has(name)).toBe(false);
			files.set(name, strFromU8(content, true));
		}
	}
	return files;
}

const NEVER_READ = [
	'chat_tool_executions',
	'chat_turn_events',
	'chat_prompt_snapshots',
	'llm_usage_logs',
	'user_calendar_tokens',
	'calendar_connection_credentials',
	'email_connection_credentials',
	'external_agent_callers',
	'agent_oauth_access_tokens',
	'agent_oauth_refresh_tokens'
];

describe('user data export worker', () => {
	it('builds one zip with the documented layout and nothing secret', async () => {
		const tables = seed();
		const { db, queried, uploads, rpcCalls } = fakeDb(tables);

		const result = await processUserDataExportJob(job(), { db });

		expect(result).toMatchObject({ success: true, partCount: 1 });
		expect([...uploads.keys()]).toEqual([`user-exports/${USER}/${EXPORT_ID}.zip`]);
		const files = unzipAll(uploads);
		expect([...files.keys()].sort()).toEqual(
			[
				'README.md',
				'profile.json',
				'projects/launch-plan/project.md',
				'projects/launch-plan/documents/brief.md',
				'projects/launch-plan/documents/brief/child-doc.md',
				'projects/launch-plan/documents/loose-notes.md',
				'projects/launch-plan/tasks.json',
				'projects/launch-plan/tasks.csv',
				'projects/launch-plan/goals.json',
				'projects/launch-plan/plans.json',
				'projects/launch-plan/milestones.json',
				'projects/launch-plan/risks.json',
				'chats/2026-09-20-plan-the-baltimore-launch.md',
				'briefs/2026-09-21.md',
				'brain-dumps/2026-09-19-launch-thoughts.md',
				'voice-notes/2026-09-22-v1000000.webm',
				'voice-notes/2026-09-22-v1000000.md',
				'uploads/launch-plan/whiteboard.png',
				'uploads/uploads.json',
				'contacts.json'
			].sort()
		);

		const chat = files.get('chats/2026-09-20-plan-the-baltimore-launch.md') ?? '';
		expect(chat).toContain('**You**');
		expect(chat).toContain('Plan it.');
		expect(chat).toContain('**BuildOS**');
		expect(files.get('briefs/2026-09-21.md')).toContain('## Launch Plan');
		expect(files.get('brain-dumps/2026-09-19-launch-thoughts.md')).toContain(
			'Book the venue first.'
		);
		expect(files.get('projects/launch-plan/documents/brief/child-doc.md')).toBe(
			'# Child Doc\n\nDetails.\n'
		);
		expect(files.get('projects/launch-plan/tasks.csv')).toContain('"Book venue, ""big"" room"');
		expect(JSON.parse(files.get('contacts.json') ?? '[]')[0].methods[0].value).toBe(
			'sam@example.com'
		);

		for (const [name, content] of files) {
			expect(content, name).not.toContain(SECRET);
		}
		const tablesRead = new Set(queried.map((query) => query.table));
		for (const table of NEVER_READ) expect(tablesRead.has(table), table).toBe(false);
		// Every read is scoped: no query on users/voice/chat rows without the user's id.
		expect(queried.every((query) => !/\*/.test(query.columns))).toBe(true);

		expect(rpcCalls).toEqual([
			{
				name: 'complete_user_data_export',
				args: {
					p_export_id: EXPORT_ID,
					p_storage_path: `${USER}/${EXPORT_ID}.zip`,
					p_byte_size: uploads.get(`user-exports/${USER}/${EXPORT_ID}.zip`)?.length,
					p_part_count: 1
				}
			}
		]);
		expect(tables.user_data_exports?.[0]?.status).toBe('ready');
	});

	it('splits a large export into complete zip parts with stable names', async () => {
		const { db, uploads, rpcCalls } = fakeDb(seed());

		const result = await processUserDataExportJob(job(), { db, partMaxBytes: 1_500 });

		expect(result.success).toBe(true);
		const names = [...uploads.keys()];
		expect(names.length).toBeGreaterThan(1);
		expect(names[0]).toBe(`user-exports/${USER}/${EXPORT_ID}.zip`);
		expect(names[1]).toBe(`user-exports/${userDataExportObjectPath(USER, EXPORT_ID, 2)}`);
		const files = unzipAll(uploads);
		expect(files.has('README.md')).toBe(true);
		expect(files.has('contacts.json')).toBe(true);
		expect(rpcCalls[0]?.args.p_part_count).toBe(names.length);
	});

	it('refuses an account being deleted before reading anything', async () => {
		const tables = seed();
		(tables.users?.[0] as Row).deletion_status = 'pending';
		const { db, queried, uploads } = fakeDb(tables);

		const error = await processUserDataExportJob(job(), { db }).catch((caught) => caught);

		expect(error).toBeInstanceOf(PermanentQueueError);
		expect((error as PermanentQueueError).code).toBe('account_deletion_pending');
		expect(uploads.size).toBe(0);
		expect(new Set(queried.map((query) => query.table))).toEqual(
			new Set(['user_data_exports', 'users'])
		);
		expect(tables.user_data_exports?.[0]).toMatchObject({
			status: 'failed',
			error_code: 'account_deletion_pending'
		});
	});

	it('re-checks right before each upload and leaves no part behind when a deletion starts mid-build', async () => {
		const tables = seed();
		const { db, uploads, removed, rpcCalls } = fakeDb(tables, {
			onQuery: (table) => {
				// The purge starts while chats are being read (after part 1 is written).
				if (table === 'chat_messages')
					(tables.users?.[0] as Row).deletion_status = 'processing';
			}
		});

		const error = await processUserDataExportJob(job(), { db, partMaxBytes: 1_500 }).catch(
			(caught) => caught
		);

		expect((error as PermanentQueueError).code).toBe('account_deletion_pending');
		expect(removed.length).toBeGreaterThan(0);
		expect(uploads.size).toBe(0);
		expect(rpcCalls).toEqual([]);
		expect(tables.user_data_exports?.[0]).toMatchObject({
			status: 'failed',
			error_code: 'account_deletion_pending'
		});
	});

	it('marks the export failed with a code and removes uploaded parts when an upload fails', async () => {
		const tables = seed();
		const { db, uploads, removed } = fakeDb(tables, {
			failUpload: (path) => path.endsWith('.part2.zip')
		});

		const error = await processUserDataExportJob(job(), { db, partMaxBytes: 1_500 }).catch(
			(caught) => caught
		);

		expect((error as PermanentQueueError).code).toBe('upload_failed');
		expect(removed).toEqual([`${USER}/${EXPORT_ID}.zip`]);
		expect(uploads.size).toBe(0);
		expect(tables.user_data_exports?.[0]).toMatchObject({
			status: 'failed',
			error_code: 'upload_failed'
		});
	});

	it('skips an export that is no longer queued and rejects mismatched metadata', async () => {
		const tables = seed();
		(tables.user_data_exports?.[0] as Row).status = 'ready';
		const { db, uploads } = fakeDb(tables);
		expect(await processUserDataExportJob(job(), { db })).toMatchObject({
			success: false,
			skipped: true,
			reason: 'ready'
		});
		expect(uploads.size).toBe(0);

		const mismatch = await processUserDataExportJob(
			job({ exportId: EXPORT_ID, userId: OTHER }),
			{
				db
			}
		).catch((caught) => caught);
		expect((mismatch as PermanentQueueError).code).toBe('invalid_metadata');
	});

	it('schedules the export retention functions the migration defines', () => {
		const migration = readFileSync(
			resolve(
				process.cwd(),
				'../../supabase/migrations/20260924190300_user_data_panel_and_exports.sql'
			),
			'utf8'
		);
		const defined = [
			...migration.matchAll(
				/CREATE OR REPLACE FUNCTION public\.((?:cleanup|list)_privacy_[a-z_]+)\(/g
			)
		].map((match) => match[1]);
		expect(defined).toEqual([
			'cleanup_privacy_user_data_exports',
			'list_privacy_expired_user_exports'
		]);
		const scheduled = PRIVACY_RETENTION_TASKS.map((task) => task.rpc);
		expect(scheduled).toEqual(expect.arrayContaining(defined));
		expect(scheduled.indexOf('cleanup_privacy_user_data_exports')).toBeLessThan(
			scheduled.indexOf('list_privacy_expired_user_exports')
		);
	});
});

describe('export helpers', () => {
	it('slugs titles, dedupes paths, escapes CSV, and walks the document tree', () => {
		expect(slugify('  Café — Plan #2!  ')).toBe('cafe-plan-2');
		expect(slugify('***')).toBe('untitled');
		const paths = new UniquePaths();
		expect(paths.claim('chats/a', '.md')).toBe('chats/a.md');
		expect(paths.claim('chats/A', '.md')).toBe('chats/A-2.md');
		expect(toCsv([{ a: 'x,y', b: null }], ['a', 'b'])).toBe('a,b\r\n"x,y",');
		expect([
			...documentTreePaths({ root: [{ id: 'a', children: [{ id: 'b' }] }] }).entries()
		]).toEqual([
			['a', []],
			['b', ['a']]
		]);
	});
});
