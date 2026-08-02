// apps/web/src/lib/services/agentic-chat-v2/phase2a-queue-type.postgres.test.ts
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

describePostgres('agentic-chat worker Phase 2A queue-type PostgreSQL contract', () => {
	let tempDir = '';
	let dataDir = '';
	let socketDir = '';
	let port = 0;
	let fixtureOutput = '';

	const applySqlFile = (path: string): string =>
		execFileSync(
			'psql',
			[
				'-h',
				socketDir,
				'-p',
				String(port),
				'-d',
				'postgres',
				'-v',
				'ON_ERROR_STOP=1',
				'-f',
				path
			],
			{ encoding: 'utf8' }
		);

	beforeAll(async () => {
		tempDir = mkdtempSync('/tmp/buildos-phase2a-queue-type-pg-');
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
			resolve(
				repositoryRoot,
				'supabase/tests/fixtures/agentic_chat_worker_phase2a_trust_base.sql'
			)
		);
		applySqlFile(
			resolve(
				repositoryRoot,
				'supabase/migrations/20260801020000_agentic_chat_worker_queue_type.sql'
			)
		);
		// The migration must be safe to replay during disposable verification.
		applySqlFile(
			resolve(
				repositoryRoot,
				'supabase/migrations/20260801020000_agentic_chat_worker_queue_type.sql'
			)
		);
		fixtureOutput = applySqlFile(
			resolve(
				repositoryRoot,
				'supabase/tests/20260801020000_agentic_chat_worker_queue_type.test.sql'
			)
		);
	}, 30_000);

	afterAll(() => {
		if (dataDir) {
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		}
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('adds the isolated queue enum value exactly once without removing existing values', () => {
		expect(fixtureOutput).toContain('phase2a_queue_type_ok');
	});
});
