// apps/web/src/lib/services/agentic-chat-v2/p3-attachment-reference-contract.postgres.test.ts
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

describePostgres('agentic-chat P3 immutable attachment-reference PostgreSQL contract', () => {
	let tempDir = '';
	let dataDir = '';
	let socketDir = '';
	let port = 0;
	let output = '';

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
		tempDir = mkdtempSync('/tmp/buildos-p3-attachment-reference-pg-');
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
			throw new Error(
				`Disposable PostgreSQL failed to start:\n${readFileSync(postgresLog, 'utf8')}`,
				{
					cause: error
				}
			);
		}

		const repositoryRoot = resolve(process.cwd(), '../..');
		const sqlPath = (relativePath: string) => resolve(repositoryRoot, relativePath);
		applySqlFile(
			sqlPath('supabase/tests/fixtures/agentic_chat_p3_attachment_reference_base.sql')
		);
		for (const migration of [
			'20260731150000_agentic_chat_legacy_atomic_admission.sql',
			'20260801010000_agentic_chat_worker_phase2a_trust_foundation.sql',
			'20260801020000_agentic_chat_worker_queue_type.sql',
			'20260801030000_agentic_chat_worker_queued_status.sql',
			'20260801030100_agentic_chat_worker_active_index_preflight.sql',
			'20260801030200_agentic_chat_worker_create_active_index.sql',
			'20260801030300_agentic_chat_worker_validate_active_index.sql',
			'20260801030400_agentic_chat_worker_drop_running_index.sql',
			'20260801030500_agentic_chat_worker_stream_signal_foundation.sql',
			'20260801030600_agentic_chat_worker_queue_function_lockdown.sql',
			'20260801041000_agentic_chat_worker_effect_foundation.sql',
			'20260801041100_agentic_chat_worker_effect_rpcs.sql',
			'20260802020000_agentic_chat_worker_atomic_admission.sql',
			'20260804000000_agentic_chat_input_v3_lifecycle_snapshots.sql',
			'20260812000000_agentic_chat_prepared_history_currency_guard.sql',
			'20260812010000_agentic_chat_history_state_contract.sql',
			'20260812030000_agentic_chat_attachment_reference_contract.sql'
		]) {
			applySqlFile(sqlPath(`supabase/migrations/${migration}`));
		}
		output = applySqlFile(
			sqlPath(
				'supabase/tests/20260812030000_agentic_chat_attachment_reference_contract.test.sql'
			)
		);
	}, 40_000);

	afterAll(() => {
		if (dataDir)
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('validates current/prepared references and links worker message attachments transactionally', () => {
		expect(output).toContain('agentic_chat_attachment_reference_contract_ok');
	});
});
