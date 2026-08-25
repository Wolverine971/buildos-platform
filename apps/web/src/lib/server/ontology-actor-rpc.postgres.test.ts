// apps/web/src/lib/server/ontology-actor-rpc.postgres.test.ts
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

function hasCommand(command: string): boolean {
	return spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;
}

async function availablePort(): Promise<number> {
	return await new Promise((resolvePort, rejectPort) => {
		const server = createServer();
		server.once('error', rejectPort);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				server.close();
				rejectPort(new Error('Could not allocate a PostgreSQL test port'));
				return;
			}
			server.close((error) => (error ? rejectPort(error) : resolvePort(address.port)));
		});
	});
}

const postgresAvailable = hasCommand('initdb') && hasCommand('pg_ctl') && hasCommand('psql');
const describePostgres = postgresAvailable ? describe : describe.skip;

describePostgres('ontology actor/access RPC hardening', () => {
	let tempDir = '';
	let dataDir = '';
	let socketDir = '';
	let port = 0;
	let sqlContractOutput = '';

	const psqlArgs = (...args: string[]) => [
		'-h',
		socketDir,
		'-p',
		String(port),
		'-d',
		'postgres',
		'-v',
		'ON_ERROR_STOP=1',
		...args
	];

	const applySqlFile = (path: string): string =>
		execFileSync('psql', psqlArgs('-f', path), { encoding: 'utf8' });

	const executeSql = (sql: string): string =>
		execFileSync('psql', psqlArgs('-Atc', sql), { encoding: 'utf8' }).trim();

	beforeAll(async () => {
		tempDir = mkdtempSync('/tmp/buildos-ontology-actor-access-pg-');
		dataDir = join(tempDir, 'data');
		socketDir = join(tempDir, 'socket');
		port = await availablePort();
		mkdirSync(socketDir);

		execFileSync('initdb', ['-D', dataDir, '--no-locale', '--encoding=UTF8'], {
			stdio: 'pipe'
		});
		const postgresLog = join(tempDir, 'postgres.log');
		try {
			execFileSync(
				'pg_ctl',
				['-D', dataDir, '-l', postgresLog, '-o', `-p ${port} -k ${socketDir}`, 'start'],
				{ stdio: 'pipe' }
			);
		} catch (error) {
			const log = readFileSync(postgresLog, 'utf8');
			throw new Error(`Disposable PostgreSQL failed to start:\n${log}`, { cause: error });
		}

		const repositoryRoot = resolve(process.cwd(), '../..');
		applySqlFile(
			resolve(repositoryRoot, 'supabase/tests/fixtures/ontology_actor_access_base.sql')
		);
		applySqlFile(
			resolve(
				repositoryRoot,
				'supabase/migrations/20260825181727_harden_ontology_actor_access_rpcs.sql'
			)
		);
		sqlContractOutput = applySqlFile(
			resolve(
				repositoryRoot,
				'supabase/tests/20260825181727_harden_ontology_actor_access_rpcs.test.sql'
			)
		);
	}, 30_000);

	afterAll(() => {
		if (dataDir) {
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		}
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('passes the SQL identity, ACL, and access contract', () => {
		expect(sqlContractOutput).not.toContain('assertion_failed');
	});

	it('returns one canonical actor under concurrent first-use calls', async () => {
		const userId = '25181727-0000-4000-8000-000000000050';
		executeSql(
			`INSERT INTO public.users (id, name, email) VALUES ('${userId}', 'Concurrent User', 'actor-concurrent@example.test')`
		);
		const sql = [
			`SET request.jwt.claims = '{"role":"service_role"}'`,
			`SET request.jwt.claim.role = 'service_role'`,
			`SELECT public.ensure_actor_for_user('${userId}')`
		].join('; ');

		const results = await Promise.all(
			Array.from({ length: 12 }, async () => {
				const { stdout } = await execFileAsync('psql', psqlArgs('-Atc', sql), {
					encoding: 'utf8'
				});
				return stdout.trim().split('\n').at(-1) ?? '';
			})
		);

		expect(new Set(results).size).toBe(1);
		expect(results[0]).toMatch(/^[0-9a-f-]{36}$/);
		expect(
			executeSql(`SELECT count(*) FROM public.onto_actors WHERE user_id = '${userId}'`)
		).toBe('1');
	});
});
