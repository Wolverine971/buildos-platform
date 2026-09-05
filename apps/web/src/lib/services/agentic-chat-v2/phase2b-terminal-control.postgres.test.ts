// apps/web/src/lib/services/agentic-chat-v2/phase2b-terminal-control.postgres.test.ts
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

describePostgres('agentic-chat worker Phase 2B terminal control PostgreSQL contract', () => {
	let tempDir = '';
	let dataDir = '';
	let socketDir = '';
	let port = 0;
	let guardPreflightOutput = '';
	let guardOutput = '';
	let eventOutput = '';
	let terminalOutput = '';

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
		tempDir = mkdtempSync('/tmp/buildos-phase2b-terminal-control-pg-');
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
			sqlPath('supabase/tests/fixtures/agentic_chat_worker_phase2b_admission_claim_base.sql')
		);
		applySqlFile(sqlPath('supabase/tests/fixtures/agentic_chat_voice_note_group_base.sql'));
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
			'20260802020100_agentic_chat_worker_claim_fencing.sql'
		]) {
			applySqlFile(sqlPath(`supabase/migrations/${migration}`));
		}
		applySqlFile(
			sqlPath(
				'supabase/tests/fixtures/agentic_chat_worker_phase2b_message_idempotency_collision.sql'
			)
		);
		const guardPreflight = spawnSync(
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
				sqlPath(
					'supabase/migrations/20260802029900_agentic_chat_worker_message_idempotency_guard.sql'
				)
			],
			{ encoding: 'utf8' }
		);
		guardPreflightOutput = `${guardPreflight.stdout ?? ''}${guardPreflight.stderr ?? ''}`;
		if (guardPreflight.status === 0) {
			throw new Error(
				'Reserved-key collision did not stop the message-idempotency migration'
			);
		}
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
				'-c',
				"DELETE FROM public.users WHERE id = 'fa000000-0000-4000-8000-000000000001'"
			],
			{ stdio: 'pipe' }
		);
		applySqlFile(
			sqlPath(
				'supabase/migrations/20260802029900_agentic_chat_worker_message_idempotency_guard.sql'
			)
		);
		guardOutput = applySqlFile(
			sqlPath(
				'supabase/tests/20260802029900_agentic_chat_worker_message_idempotency_guard.test.sql'
			)
		);

		// The earlier proofs leave realistic running rows for the terminal package.
		applySqlFile(
			sqlPath('supabase/tests/20260731150000_agentic_chat_legacy_atomic_admission.test.sql')
		);
		applySqlFile(
			sqlPath(
				'supabase/tests/fixtures/agentic_chat_worker_phase2b_terminal_control_legacy_event.sql'
			)
		);

		for (const migration of [
			'20260802030000_agentic_chat_worker_event_identity_foundation.sql',
			'20260802030100_agentic_chat_worker_create_event_generation_index.sql',
			'20260802030200_agentic_chat_worker_create_event_identity_index.sql',
			'20260802030300_agentic_chat_worker_validate_event_identity_indexes.sql',
			'20260802030400_agentic_chat_worker_drop_legacy_event_sequence.sql'
		]) {
			applySqlFile(sqlPath(`supabase/migrations/${migration}`));
		}
		eventOutput = applySqlFile(
			sqlPath('supabase/tests/20260802030400_agentic_chat_worker_event_identity.test.sql')
		);

		applySqlFile(
			sqlPath(
				'supabase/migrations/20260802030500_agentic_chat_worker_terminal_control_rpcs.sql'
			)
		);
		for (const migration of [
			'20260802031000_agentic_chat_worker_execution_recovery.sql',
			'20260824205329_attach_worker_voice_note_groups.sql',
			'20260825161846_agentic_chat_queue_first_admission.sql',
			'20260905012719_agentic_chat_prepared_overlay_copy_contract.sql'
		]) {
			applySqlFile(sqlPath(`supabase/migrations/${migration}`));
		}
		// This proof targets the cumulative queue-first contract, so it runs only
		// after all three functions patched by that migration exist.
		applySqlFile(
			sqlPath('supabase/tests/20260802020000_agentic_chat_worker_atomic_admission.test.sql')
		);
		applySqlFile(
			sqlPath('supabase/tests/20260802020100_agentic_chat_worker_claim_fencing.test.sql')
		);
		terminalOutput = applySqlFile(
			sqlPath('supabase/tests/20260802030500_agentic_chat_worker_terminal_control.test.sql')
		);
	}, 60_000);

	afterAll(() => {
		if (dataDir) {
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		}
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('passes legacy backfill/generation-key/stale-write/immutability/security checks', () => {
		expect(eventOutput).toContain('phase2b_event_identity_ok');
	});

	it('reserves worker message keys without breaking legacy or trusted inserts', () => {
		expect(guardPreflightOutput).toContain('agentic_chat_message_idempotency_preflight_failed');
		expect(guardOutput).toContain('phase2b_message_idempotency_guard_ok');
	});

	it('passes queued/running/idempotency/ownership/race/security/rollback terminal checks', () => {
		expect(terminalOutput).toContain('phase2b_terminal_control_ok');
	});
});
