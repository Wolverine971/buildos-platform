// apps/web/src/lib/services/agentic-chat-v2/p3-live-vision-resolution.postgres.test.ts
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

describePostgres('agentic-chat P3 live-vision resolution PostgreSQL contract', () => {
	let tempDir = '';
	let dataDir = '';
	let socketDir = '';
	let port = 0;
	let liveVisionOutput = '';
	let providerPassOutput = '';

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
		tempDir = mkdtempSync('/tmp/buildos-p3-live-vision-pg-');
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
				{ cause: error }
			);
		}

		const repositoryRoot = resolve(process.cwd(), '../..');
		const sqlPath = (relativePath: string) => resolve(repositoryRoot, relativePath);
		applySqlFile(
			sqlPath('supabase/tests/fixtures/agentic_chat_p3_attachment_reference_base.sql')
		);
		applySqlFile(
			sqlPath('supabase/tests/fixtures/agentic_chat_realtime_authorization_base.sql')
		);
		applySqlFile(sqlPath('supabase/tests/fixtures/agentic_chat_p3_live_vision_base.sql'));
		applySqlFile(
			sqlPath(
				'supabase/tests/fixtures/agentic_chat_worker_phase2b_terminal_control_legacy_event.sql'
			)
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
			'20260802020100_agentic_chat_worker_claim_fencing.sql',
			'20260802029900_agentic_chat_worker_message_idempotency_guard.sql',
			'20260802030000_agentic_chat_worker_event_identity_foundation.sql',
			'20260802030100_agentic_chat_worker_create_event_generation_index.sql',
			'20260802030200_agentic_chat_worker_create_event_identity_index.sql',
			'20260802030300_agentic_chat_worker_validate_event_identity_indexes.sql',
			'20260802030400_agentic_chat_worker_drop_legacy_event_sequence.sql',
			'20260802030500_agentic_chat_worker_terminal_control_rpcs.sql',
			'20260802031000_agentic_chat_worker_execution_recovery.sql',
			'20260802033000_agentic_chat_worker_stream_write_foundation.sql',
			'20260802033100_agentic_chat_worker_create_transition_index.sql',
			'20260802033200_agentic_chat_worker_stream_write_rpcs.sql',
			'20260802034000_agentic_chat_worker_stream_delivery_ack.sql',
			'20260802035000_agentic_chat_worker_cancel_observation.sql',
			'20260802036000_agentic_chat_private_realtime_authorization.sql',
			'20260802037000_agentic_chat_worker_reconciliation.sql',
			'20260804000000_agentic_chat_input_v3_lifecycle_snapshots.sql',
			'20260804000100_agentic_chat_terminal_last_turn_context.sql',
			'20260804000110_agentic_chat_terminal_sequence_capacity.sql',
			'20260804000120_agentic_chat_terminal_timing.sql',
			'20260804032000_agentic_chat_prompt_snapshot.sql',
			'20260804033000_agentic_chat_partial_cancellation_terminal_events.sql',
			'20260804034000_agentic_chat_provider_failure_terminal_events.sql',
			'20260804035100_chat_tool_execution_provider_call_identity.sql',
			'20260804036000_agentic_chat_read_tool_execution_ledger.sql',
			'20260804037000_agentic_chat_worker_lifecycle_observations.sql',
			'20260806010000_agentic_chat_execution_hardening.sql',
			'20260806020000_agentic_chat_timing_evidence_repair.sql',
			'20260812000000_agentic_chat_prepared_history_currency_guard.sql',
			'20260812010000_agentic_chat_history_state_contract.sql',
			'20260812030000_agentic_chat_attachment_reference_contract.sql'
		]) {
			applySqlFile(sqlPath(`supabase/migrations/${migration}`));
		}
		applySqlFile(
			sqlPath('supabase/tests/20260806010000_agentic_chat_execution_hardening.test.sql')
		);
		applySqlFile(
			sqlPath(
				'supabase/migrations/20260812040000_agentic_chat_live_vision_resolution_receipts.sql'
			)
		);
		liveVisionOutput = applySqlFile(
			sqlPath(
				'supabase/tests/20260812040000_agentic_chat_live_vision_resolution_receipts.test.sql'
			)
		);
		for (const migration of [
			'20260815173000_agentic_chat_provider_observation_logical_round.sql',
			'20260817020000_agentic_chat_provider_attempt_timing_receipts.sql',
			'20260822010000_agentic_chat_execution_observation_rejected_tool.sql',
			'20260828221405_agentic_chat_provider_pass_telemetry.sql'
		]) {
			applySqlFile(sqlPath(`supabase/migrations/${migration}`));
		}
		providerPassOutput = applySqlFile(
			sqlPath('supabase/tests/20260828221405_agentic_chat_provider_pass_telemetry.test.sql')
		);
	}, 60_000);

	afterAll(() => {
		if (dataDir)
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('validates bounded policy and persists only a fenced redacted media receipt', () => {
		expect(liveVisionOutput).toContain('agentic_chat_live_vision_resolution_receipts_ok');
	});

	it('counts successful logical provider roles without counting replay or retry', () => {
		expect(providerPassOutput).toContain('agentic_chat_provider_pass_telemetry_ok');
	});
});
