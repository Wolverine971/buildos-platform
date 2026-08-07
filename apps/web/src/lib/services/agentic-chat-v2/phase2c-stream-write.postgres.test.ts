// apps/web/src/lib/services/agentic-chat-v2/phase2c-stream-write.postgres.test.ts
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

describePostgres('agentic-chat worker Phase 2C stream persistence PostgreSQL contract', () => {
	let tempDir = '';
	let dataDir = '';
	let socketDir = '';
	let port = 0;
	let proofOutput = '';
	let loadOutput = '';
	let lastContextOutput = '';
	let timingOutput = '';
	let partialCancellationOutput = '';
	let providerFailureOutput = '';
	let readToolLedgerOutput = '';

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
	const applySqlFiles = (paths: string[]): string =>
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
				...paths.flatMap((path) => ['-f', path])
			],
			{ encoding: 'utf8' }
		);

	beforeAll(async () => {
		tempDir = mkdtempSync('/tmp/buildos-phase2c-stream-write-pg-');
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
			'20260802029900_agentic_chat_worker_message_idempotency_guard.sql'
		]) {
			applySqlFile(sqlPath(`supabase/migrations/${migration}`));
		}
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
			'20260802030400_agentic_chat_worker_drop_legacy_event_sequence.sql',
			'20260802030500_agentic_chat_worker_terminal_control_rpcs.sql',
			'20260802031000_agentic_chat_worker_execution_recovery.sql',
			'20260802033000_agentic_chat_worker_stream_write_foundation.sql',
			'20260802033100_agentic_chat_worker_create_transition_index.sql',
			'20260802033200_agentic_chat_worker_stream_write_rpcs.sql',
			'20260802034000_agentic_chat_worker_stream_delivery_ack.sql',
			'20260802035000_agentic_chat_worker_cancel_observation.sql',
			'20260804000100_agentic_chat_terminal_last_turn_context.sql',
			'20260804000110_agentic_chat_terminal_sequence_capacity.sql',
			'20260804000120_agentic_chat_terminal_timing.sql',
			'20260804033000_agentic_chat_partial_cancellation_terminal_events.sql',
			'20260804034000_agentic_chat_provider_failure_terminal_events.sql',
			'20260804035100_chat_tool_execution_provider_call_identity.sql',
			'20260804036000_agentic_chat_read_tool_execution_ledger.sql',
			'20260806020000_agentic_chat_timing_evidence_repair.sql'
		]) {
			applySqlFile(sqlPath(`supabase/migrations/${migration}`));
		}

		proofOutput = applySqlFile(
			sqlPath('supabase/tests/20260802033200_agentic_chat_worker_stream_write_rpcs.test.sql')
		);
		loadOutput = applySqlFile(
			sqlPath('supabase/tests/20260803000000_agentic_chat_worker_100_turn_load.test.sql')
		);
		lastContextOutput = applySqlFile(
			sqlPath(
				'supabase/tests/20260804000100_agentic_chat_terminal_last_turn_context.test.sql'
			)
		);
		const terminalParityOutput = applySqlFiles([
			sqlPath('supabase/tests/20260804000120_agentic_chat_terminal_timing.test.sql'),
			sqlPath(
				'supabase/tests/20260804033000_agentic_chat_partial_cancellation_terminal_events.test.sql'
			),
			sqlPath(
				'supabase/tests/20260804034000_agentic_chat_provider_failure_terminal_events.test.sql'
			),
			sqlPath(
				'supabase/tests/20260804036000_agentic_chat_read_tool_execution_ledger.test.sql'
			),
			sqlPath('supabase/tests/20260806020000_agentic_chat_timing_evidence_repair.test.sql')
		]);
		timingOutput = terminalParityOutput;
		partialCancellationOutput = terminalParityOutput;
		providerFailureOutput = terminalParityOutput;
		readToolLedgerOutput = terminalParityOutput;
	}, 60_000);

	afterAll(() => {
		if (dataDir) {
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		}
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('passes fencing, idempotency, batch isolation, rollback, and concurrency checks', () => {
		expect(proofOutput).toContain('phase2c_stream_write_rpcs_ok');
	});

	it('measures the bounded 100-turn database cadence and WAL budget', () => {
		expect(loadOutput).toContain('phase2d_100_turn_database_load_ok');
		const metricsText = loadOutput.match(
			/agentic_chat_100_turn_load_metrics=(\{[^\n]+\})/
		)?.[1];
		expect(metricsText).toBeDefined();
		const metrics = JSON.parse(metricsText ?? '{}') as Record<string, number>;
		expect(metrics).toMatchObject({ turns: 100, rpc_statements: 102, affected_rows: 300 });
		expect(metrics.wal_bytes).toBeGreaterThan(0);
		expect(metrics.wal_bytes_per_turn).toBeLessThanOrEqual(65_536);
		expect(metrics.flush_ms).toBeLessThan(2_000);
		expect(metrics.total_ms).toBeLessThan(5_000);
	});

	it('commits replay-safe last-turn context immediately before terminal done', () => {
		expect(lastContextOutput).toContain('phase4_slice5_terminal_last_turn_context_ok');
	});

	it('commits database-owned asynchronous timing before terminal done', () => {
		expect(timingOutput).toContain('phase4_slice6_terminal_timing_ok');
	});

	it('commits cancelled partial context and timing without weakening the cancel fence', () => {
		expect(partialCancellationOutput).toContain(
			'phase4_slice8_partial_cancellation_terminal_events_ok'
		);
	});

	it('keeps failed provider text reconnectable but out of assistant history', () => {
		expect(providerFailureOutput).toContain(
			'phase4_slice9_provider_failure_terminal_events_ok'
		);
	});

	it('persists and terminally attaches one fenced read-tool execution', () => {
		expect(readToolLedgerOutput).toContain('phase4_slice10_read_tool_execution_ledger_ok');
	});

	it('accepts truthful streamed-turn timing drafts and rejects microsecond drift', () => {
		expect(readToolLedgerOutput).toContain('timing_evidence_repair_ok');
	});
});
