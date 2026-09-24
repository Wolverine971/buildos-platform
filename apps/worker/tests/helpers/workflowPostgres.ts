// apps/worker/tests/helpers/workflowPostgres.ts
//
// DISPOSABLE DATABASE ONLY. A socket-only local PostgreSQL with the workflow v1
// fixture and the two frozen migrations, plus a PostgREST stand-in over one
// `service_role` connection. The shim is Tasker 86's signature-checked RPC caller
// (named arguments are cast to the exact SQL signature, so a misspelled `p_*` name
// fails), extended with the read chains the workflow store uses. Never point this
// at a linked or hosted database.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { Client } from 'pg';

const FIXTURE = 'supabase/tests/fixtures/agentic_chat_workflow_v1_base.sql';
const MIGRATIONS = [
	'supabase/migrations/20260914203007_agentic_chat_workflow_v1_storage.sql',
	'supabase/migrations/20260914203008_agentic_chat_workflow_v1_dispatch_recovery.sql',
	'supabase/migrations/20260924000000_agentic_chat_reap_stranded_queued_turns.sql',
	'supabase/migrations/20260924000100_agentic_chat_turn_leases.sql',
	'supabase/migrations/20260924150000_agentic_chat_lock_free_turn_checks.sql'
];

export const postgresAvailable = ['initdb', 'pg_ctl', 'psql'].every(
	(command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
);

export type DisposableConnection = { host: string; port: number; user: string; database: string };

export type DisposablePostgres = {
	connection: DisposableConnection;
	stop(): void;
};

export async function startDisposableWorkflowPostgres(
	repositoryRoot: string,
	prefix = 'buildos-workflow-e2e-pg-'
): Promise<DisposablePostgres> {
	const tempDir = mkdtempSync(`/tmp/${prefix}`);
	const dataDir = join(tempDir, 'data');
	const socketDir = join(tempDir, 'socket');
	const port = await availablePort();
	mkdirSync(socketDir);
	execFileSync(
		'initdb',
		['-D', dataDir, '--no-locale', '--encoding=UTF8', '--auth=trust', '--username=postgres'],
		{ stdio: 'pipe' }
	);
	const postgresLog = join(tempDir, 'postgres.log');
	try {
		execFileSync(
			'pg_ctl',
			[
				'-D',
				dataDir,
				'-l',
				postgresLog,
				'-o',
				`-p ${port} -k ${socketDir} -c listen_addresses=''`,
				'-w',
				'start'
			],
			{ stdio: 'pipe' }
		);
	} catch (error) {
		throw new Error(
			`Disposable PostgreSQL failed to start:\n${readFileSync(postgresLog, 'utf8')}`,
			{ cause: error }
		);
	}
	execFileSync(
		'psql',
		[
			'-X',
			'-q',
			'-h',
			socketDir,
			'-p',
			String(port),
			'-U',
			'postgres',
			'-d',
			'postgres',
			'-v',
			'ON_ERROR_STOP=1',
			'-f',
			resolve(repositoryRoot, FIXTURE),
			...MIGRATIONS.flatMap((migration) => ['-f', resolve(repositoryRoot, migration)])
		],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 }
	);
	return {
		connection: { host: socketDir, port, user: 'postgres', database: 'postgres' },
		stop() {
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
			rmSync(tempDir, { recursive: true, force: true });
		}
	};
}

/**
 * Ages a killed worker's lease past the 90 s database expiry (but not to the
 * abandoned mark), as if it had stopped renewing. The queue heartbeat is aged
 * too, for rows the worker had not claimed as a running turn.
 */
export async function expireWorkerLease(
	admin: Client,
	turnRunId: string,
	ageSeconds = 100
): Promise<void> {
	await admin.query(
		`UPDATE public.chat_turn_runs
		SET worker_lease_generation = execution_generation,
			worker_lease_renewed_at = now() - make_interval(secs => $2)
		WHERE id = $1 AND status = 'running' AND execution_generation >= 1`,
		[turnRunId, ageSeconds]
	);
	await admin.query('BEGIN');
	try {
		// update_queue_jobs_updated_at would stamp now() over the aged heartbeat.
		await admin.query(`SET LOCAL session_replication_role = replica`);
		await admin.query(
			`UPDATE public.queue_jobs jobs
			SET updated_at = now() - make_interval(secs => $2)
			FROM public.chat_turn_runs turns
			WHERE turns.id = $1 AND jobs.id = turns.queue_job_id AND jobs.status = 'processing'`,
			[turnRunId, ageSeconds]
		);
		await admin.query('COMMIT');
	} catch (error) {
		await admin.query('ROLLBACK');
		throw error;
	}
}

export async function serviceClient(connection: DisposableConnection): Promise<Client> {
	const client = new Client(connection);
	await client.connect();
	await client.query('SET ROLE service_role');
	return client;
}

type RpcResult = { data: unknown; error: { code: string; message: string } | null };
export type RpcInterceptor = (
	name: string,
	args: Record<string, unknown>,
	run: () => Promise<RpcResult>
) => Promise<RpcResult>;

export function createPgSupabaseShim(client: Client) {
	const signatures = new Map<
		string,
		Array<{ names: string[]; types: string[]; defaults: number }>
	>();
	let interceptor: RpcInterceptor | null = null;
	const rpcCalls: string[] = [];

	async function overloads(name: string) {
		const cached = signatures.get(name);
		if (cached) return cached;
		const { rows } = await client.query(
			`SELECT p.proargnames AS names, p.pronargs AS nargs, p.pronargdefaults AS defaults,
				ARRAY(SELECT format_type(t, NULL) FROM unnest(p.proargtypes) WITH ORDINALITY AS u(t, o) ORDER BY o) AS types
			FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
			WHERE n.nspname = 'public' AND p.proname = $1`,
			[name]
		);
		const parsed = rows.map((row) => ({
			names: (row.names as string[]).slice(0, row.nargs as number),
			types: row.types as string[],
			defaults: row.defaults as number
		}));
		signatures.set(name, parsed);
		return parsed;
	}

	async function execute(name: string, args: Record<string, unknown>): Promise<RpcResult> {
		try {
			const keys = Object.keys(args);
			const match = (await overloads(name)).find(
				(candidate) =>
					keys.every((key) => candidate.names.includes(key)) &&
					candidate.names
						.slice(0, candidate.names.length - candidate.defaults)
						.every((required) => keys.includes(required))
			);
			if (!match) throw new Error(`No ${name} overload accepts ${keys.join(', ')}`);
			const values = keys.map((key) => {
				const value = args[key];
				const type = match.types[match.names.indexOf(key)]!;
				if (type.endsWith('[]')) return value;
				return value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
			});
			const call = keys
				.map(
					(key, index) =>
						`${key} => $${index + 1}::${match.types[match.names.indexOf(key)]}`
				)
				.join(', ');
			const { rows } = await client.query(`SELECT public.${name}(${call}) AS data`, values);
			return { data: rows[0]?.data ?? null, error: null };
		} catch (error) {
			const pgError = error as { code?: string; message?: string };
			if (typeof pgError.code === 'string') {
				return {
					data: null,
					error: { code: pgError.code, message: pgError.message ?? '' }
				};
			}
			throw error;
		}
	}

	function select(table: string, columns: string) {
		if (!/^[a-z_]+$/.test(table)) throw new Error('invalid table');
		const cols = columns.replace(/\s+/g, '');
		if (!/^[a-z0-9_,]+$/.test(cols)) throw new Error('unsupported select');
		const filters: Array<[string, '=' | '<', unknown]> = [];
		let order: string | null = null;
		let limit: number | null = null;
		const run = async (single: boolean) => {
			rpcCalls.push(`select:${table}`);
			try {
				const where = filters.length
					? `WHERE ${filters.map(([column, op], index) => `${column} ${op} $${index + 1}`).join(' AND ')}`
					: '';
				const tail = `${order ? ` ORDER BY ${order}` : ''}${limit !== null ? ` LIMIT ${limit}` : ''}`;
				const { rows } = await client.query(
					`SELECT row_to_json(r) AS data FROM (SELECT ${cols} FROM public.${table} ${where}${tail}) r`,
					filters.map(([, , value]) => value)
				);
				const data = rows.map((row) => row.data);
				if (!single) return { data, error: null };
				if (data.length > 1) {
					return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
				}
				return { data: data[0] ?? null, error: null };
			} catch (error) {
				const pgError = error as { code?: string; message?: string };
				return {
					data: null,
					error: { code: pgError.code ?? '', message: pgError.message ?? '' }
				};
			}
		};
		const chain = {
			eq(column: string, value: unknown) {
				if (!/^[a-z_]+$/.test(column)) throw new Error('invalid column');
				filters.push([column, '=', value]);
				return chain;
			},
			lt(column: string, value: unknown) {
				if (!/^[a-z_]+$/.test(column)) throw new Error('invalid column');
				filters.push([column, '<', value]);
				return chain;
			},
			order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) {
				if (!/^[a-z_]+$/.test(column)) throw new Error('invalid column');
				order = `${column} ${options.ascending === false ? 'DESC' : 'ASC'} NULLS ${options.nullsFirst ? 'FIRST' : 'LAST'}`;
				return chain;
			},
			limit(value: number) {
				limit = Math.max(0, Math.floor(value));
				return chain;
			},
			maybeSingle: () => run(true),
			then<T1, T2>(
				resolveResult: (value: { data: unknown; error: RpcResult['error'] }) => T1,
				reject?: (reason: unknown) => T2
			) {
				return run(false).then(resolveResult, reject);
			}
		};
		return chain;
	}

	return {
		rpcCalls,
		intercept(next: RpcInterceptor | null) {
			interceptor = next;
		},
		/** Like supabase-js, the result is awaitable and takes `.abortSignal()`. */
		rpc(
			name: string,
			args: Record<string, unknown>
		): Promise<RpcResult> & { abortSignal(signal: AbortSignal): Promise<RpcResult> } {
			rpcCalls.push(name);
			const run = () => execute(name, args);
			const result = interceptor ? interceptor(name, args, run) : run();
			// A pg query cannot be cancelled mid-flight here; callers bound it themselves.
			return Object.assign(result, { abortSignal: (_signal: AbortSignal) => result });
		},
		from(table: string) {
			return { select: (columns: string) => select(table, columns) };
		}
	};
}

export async function availablePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			server.close(() =>
				typeof address === 'object' && address
					? resolvePort(address.port)
					: reject(new Error('no port'))
			);
		});
	});
}
