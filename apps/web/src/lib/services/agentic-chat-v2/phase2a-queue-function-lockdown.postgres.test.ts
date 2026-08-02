// apps/web/src/lib/services/agentic-chat-v2/phase2a-queue-function-lockdown.postgres.test.ts
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

describePostgres('agentic-chat worker Phase 2A queue-function lockdown PostgreSQL contract', () => {
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
		tempDir = mkdtempSync('/tmp/buildos-phase2a-queue-lockdown-pg-');
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
		const sqlPath = (relativePath: string) => resolve(repositoryRoot, relativePath);

		applySqlFile(
			sqlPath('supabase/tests/fixtures/agentic_chat_worker_queue_lockdown_base.sql')
		);
		applySqlFile(
			sqlPath('supabase/migrations/20260731150000_agentic_chat_legacy_atomic_admission.sql')
		);
		applySqlFile(
			sqlPath(
				'supabase/migrations/20260801010000_agentic_chat_worker_phase2a_trust_foundation.sql'
			)
		);
		applySqlFile(
			sqlPath('supabase/migrations/20260801020000_agentic_chat_worker_queue_type.sql')
		);
		applySqlFile(
			sqlPath('supabase/migrations/20260801030000_agentic_chat_worker_queued_status.sql')
		);
		applySqlFile(
			sqlPath(
				'supabase/migrations/20260801030100_agentic_chat_worker_active_index_preflight.sql'
			)
		);
		applySqlFile(
			sqlPath(
				'supabase/migrations/20260801030200_agentic_chat_worker_create_active_index.sql'
			)
		);
		applySqlFile(
			sqlPath(
				'supabase/migrations/20260801030300_agentic_chat_worker_validate_active_index.sql'
			)
		);
		applySqlFile(
			sqlPath('supabase/migrations/20260801030400_agentic_chat_worker_drop_running_index.sql')
		);
		applySqlFile(
			sqlPath(
				'supabase/migrations/20260801030500_agentic_chat_worker_stream_signal_foundation.sql'
			)
		);
		applySqlFile(
			sqlPath(
				'supabase/migrations/20260801030600_agentic_chat_worker_queue_function_lockdown.sql'
			)
		);

		// The legacy synchronous admission contract remains green after lockdown.
		applySqlFile(
			sqlPath('supabase/tests/20260731150000_agentic_chat_legacy_atomic_admission.test.sql')
		);
		fixtureOutput = applySqlFile(
			sqlPath(
				'supabase/tests/20260801030600_agentic_chat_worker_queue_function_lockdown.test.sql'
			)
		);
	}, 30_000);

	afterAll(() => {
		if (dataDir) {
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		}
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('passes grants, agentic guard, scoped recovery, compatibility, and rollback checks', () => {
		expect(fixtureOutput).toContain('phase2a_queue_function_lockdown_ok');
	});
});
