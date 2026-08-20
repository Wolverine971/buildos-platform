// apps/web/src/lib/services/agentic-chat-v2/phase5-retention-cleanup.postgres.test.ts
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

describePostgres('agentic-chat worker Phase 5 retention cleanup contract', () => {
	let tempDir = '';
	let dataDir = '';
	let socketDir = '';
	let port = 0;
	let proofOutput = '';

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
	const applySql = (sql: string): string =>
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
				sql
			],
			{ encoding: 'utf8' }
		);

	beforeAll(async () => {
		tempDir = mkdtempSync('/tmp/buildos-phase5-retention-pg-');
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
		for (const migration of [
			'20260731150000_agentic_chat_legacy_atomic_admission.sql',
			'20260801010000_agentic_chat_worker_phase2a_trust_foundation.sql',
			'20260801030500_agentic_chat_worker_stream_signal_foundation.sql',
			'20260801041000_agentic_chat_worker_effect_foundation.sql'
		]) {
			applySqlFile(sqlPath(`supabase/migrations/${migration}`));
		}
		applySqlFile(
			sqlPath(
				'supabase/tests/fixtures/agentic_chat_worker_phase2b_terminal_control_legacy_event.sql'
			)
		);
		applySqlFile(
			sqlPath(
				'supabase/migrations/20260802030000_agentic_chat_worker_event_identity_foundation.sql'
			)
		);

		// Reproduce the production upgrade shape: the effect table already contains
		// immutable terminal rows before the retention column and backfill arrive.
		applySql(`
			INSERT INTO public.users (id)
			VALUES ('e0100000-0000-4000-8000-000000000001');

			INSERT INTO public.chat_sessions (id, user_id, context_type, status)
			VALUES (
				'e0200000-0000-4000-8000-000000000001',
				'e0100000-0000-4000-8000-000000000001',
				'global',
				'active'
			);

			INSERT INTO public.chat_turn_runs (
				id, session_id, user_id, stream_run_id, client_turn_id, source,
				context_type, gateway_enabled, request_message, status,
				execution_mode, execution_generation
			)
			VALUES (
				'e0300000-0000-4000-8000-000000000001',
				'e0200000-0000-4000-8000-000000000001',
				'e0100000-0000-4000-8000-000000000001',
				'retention-pre-migration', 'retention-pre-migration-client',
				'live_ui', 'global', true, 'pre-migration terminal effect',
				'running', 'worker_realtime', 1
			);

			INSERT INTO public.chat_turn_effects (
				id, turn_run_id, session_id, user_id, execution_generation,
				tool_name, operation_name, canonical_argument_hash, state,
				downstream_idempotency_supported, reserved_at, created_at, updated_at
			)
			VALUES (
				'e0700000-0000-4000-8000-000000000001',
				'e0300000-0000-4000-8000-000000000001',
				'e0200000-0000-4000-8000-000000000001',
				'e0100000-0000-4000-8000-000000000001',
				1, 'pre_migration', 'pre_migration', repeat('0', 64),
				'reserved', true,
				now() - interval '5 days', now() - interval '5 days',
				now() - interval '5 days'
			);

			SET session_replication_role = replica;
			UPDATE public.chat_turn_effects
			SET state = 'succeeded',
				started_at = now() - interval '4 days',
				finished_at = now() - interval '3 days',
				updated_at = now() - interval '3 days'
			WHERE id = 'e0700000-0000-4000-8000-000000000001';
			UPDATE public.chat_turn_runs
			SET status = 'completed',
				terminalized_at = now() - interval '2 days',
				finished_at = now() - interval '2 days',
				updated_at = now() - interval '2 days'
			WHERE id = 'e0300000-0000-4000-8000-000000000001';
			SET session_replication_role = origin;
		`);
		applySqlFile(
			sqlPath('supabase/migrations/20260820010000_agentic_chat_worker_retention_cleanup.sql')
		);

		proofOutput = applySqlFile(
			sqlPath('supabase/tests/20260820010000_agentic_chat_worker_retention_cleanup.test.sql')
		);
	}, 45_000);

	afterAll(() => {
		if (dataDir) {
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		}
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('passes boundedness, active/fresh protection, effect audit retention, and security checks', () => {
		expect(proofOutput).toContain('phase5_worker_retention_cleanup_ok');
	});
});
