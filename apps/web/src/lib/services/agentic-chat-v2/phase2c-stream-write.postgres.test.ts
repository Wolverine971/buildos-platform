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
	let validationFailureLedgerOutput = '';
	let trueToolRoundCountOutput = '';
	let mutationToolLedgerOutput = '';
	let effectScopeNullGuardOutput = '';
	let trueToolRoundCountReplayOutput = '';
	let terminalPendingIntentOutput = '';
	let terminalPendingContractOutput = '';
	let terminalPendingContractHardeningOutput = '';
	let clarificationContractResetOutput = '';
	let clarificationMissingPrerequisiteOutput = '';
	let terminalDomainMetadataOutput = '';
	let sessionHandoffOutput = '';

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
	const applySqlFileExpectingError = (path: string): string => {
		const result = spawnSync(
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
		if (result.status === 0) {
			throw new Error(`Expected SQL file to fail: ${path}`);
		}
		return `${result.stdout}\n${result.stderr}`;
	};

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
		clarificationMissingPrerequisiteOutput = applySqlFileExpectingError(
			sqlPath(
				'supabase/migrations/20260815010000_agentic_chat_clarification_contract_reset.sql'
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
			'20260806020000_agentic_chat_timing_evidence_repair.sql',
			'20260808010000_agentic_chat_read_tool_categories.sql',
			'20260808130000_agentic_chat_tool_validation_failure_ledger.sql',
			'20260808140000_agentic_chat_true_tool_round_count.sql',
			'20260809010000_agentic_chat_mutation_tool_execution_ledger.sql',
			'20260809020000_agentic_chat_mutation_tool_execution_legacy_category.sql',
			'20260811230000_agentic_chat_effect_scope_trigger_null_guard.sql'
		]) {
			applySqlFile(sqlPath(`supabase/migrations/${migration}`));
		}
		trueToolRoundCountReplayOutput = applySqlFile(
			sqlPath('supabase/migrations/20260808140000_agentic_chat_true_tool_round_count.sql')
		);
		applySqlFile(
			sqlPath(
				'supabase/migrations/20260804000000_agentic_chat_input_v3_lifecycle_snapshots.sql'
			)
		);
		applySqlFile(
			sqlPath(
				'supabase/migrations/20260813060000_agentic_chat_terminal_pending_intent_metadata.sql'
			)
		);
		applySqlFile(
			sqlPath('supabase/migrations/20260813070000_agentic_chat_terminal_domain_metadata.sql')
		);
		applySqlFile(
			sqlPath('supabase/migrations/20260813070000_agentic_chat_terminal_domain_metadata.sql')
		);
		applySqlFile(
			sqlPath(
				'supabase/migrations/20260813060000_agentic_chat_terminal_pending_intent_metadata.sql'
			)
		);

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
			sqlPath(
				'supabase/tests/20260808130000_agentic_chat_tool_validation_failure_ledger.test.sql'
			),
			sqlPath('supabase/tests/20260808140000_agentic_chat_true_tool_round_count.test.sql'),
			sqlPath(
				'supabase/tests/20260809010000_agentic_chat_mutation_tool_execution_ledger.test.sql'
			),
			sqlPath(
				'supabase/tests/20260811230000_agentic_chat_effect_scope_trigger_null_guard.test.sql'
			),
			sqlPath('supabase/tests/20260806020000_agentic_chat_timing_evidence_repair.test.sql'),
			sqlPath(
				'supabase/tests/20260813060000_agentic_chat_terminal_pending_intent_metadata.test.sql'
			),
			sqlPath('supabase/tests/20260813070000_agentic_chat_terminal_domain_metadata.test.sql'),
			sqlPath(
				'supabase/migrations/20260814010000_agentic_chat_terminal_pending_contract_metadata.sql'
			),
			sqlPath(
				'supabase/tests/20260814010000_agentic_chat_terminal_pending_contract_metadata.test.sql'
			),
			sqlPath(
				'supabase/migrations/20260814011000_agentic_chat_turn_contract_worker_hardening.sql'
			),
			sqlPath(
				'supabase/migrations/20260814012000_agentic_chat_contract_rpc_surface_reload.sql'
			),
			sqlPath(
				'supabase/migrations/20260814013000_agentic_chat_contract_internal_helpers.sql'
			),
			sqlPath(
				'supabase/tests/20260814011000_agentic_chat_turn_contract_worker_hardening.test.sql'
			),
			sqlPath(
				'supabase/migrations/20260815010000_agentic_chat_clarification_contract_reset.sql'
			),
			// A manual SQL-editor replay must be an idempotent no-op.
			sqlPath(
				'supabase/migrations/20260815010000_agentic_chat_clarification_contract_reset.sql'
			),
			sqlPath(
				'supabase/tests/20260815010000_agentic_chat_clarification_contract_reset.test.sql'
			),
			sqlPath('supabase/migrations/20260828040905_agentic_chat_worker_session_handoff.sql'),
			sqlPath('supabase/tests/20260828040905_agentic_chat_worker_session_handoff.test.sql')
		]);
		timingOutput = terminalParityOutput;
		partialCancellationOutput = terminalParityOutput;
		providerFailureOutput = terminalParityOutput;
		readToolLedgerOutput = terminalParityOutput;
		validationFailureLedgerOutput = terminalParityOutput;
		trueToolRoundCountOutput = terminalParityOutput;
		mutationToolLedgerOutput = terminalParityOutput;
		effectScopeNullGuardOutput = terminalParityOutput;
		terminalPendingIntentOutput = terminalParityOutput;
		terminalDomainMetadataOutput = terminalParityOutput;
		terminalPendingContractOutput = terminalParityOutput;
		terminalPendingContractHardeningOutput = terminalParityOutput;
		clarificationContractResetOutput = terminalParityOutput;
		sessionHandoffOutput = terminalParityOutput;
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

	it('persists a fenced pre-execution validation failure without invoking a read', () => {
		expect(validationFailureLedgerOutput).toContain(
			'phase4_slice18_validation_failure_ledger_ok'
		);
	});

	it('retains the executor-owned provider round count behind the durable call-count fence', () => {
		expect(trueToolRoundCountOutput).toContain('phase4_slice18_true_tool_round_count_ok');
	});

	it('links succeeded mutation effects to fenced durable tool telemetry', () => {
		expect(mutationToolLedgerOutput).toContain(
			'phase4_p2_slice1_mutation_tool_execution_ledger_ok'
		);
	});

	it('lets legacy null-effect telemetry reconcile without weakening worker effect scope', () => {
		expect(effectScopeNullGuardOutput).toContain(
			'agentic_chat_effect_scope_trigger_null_guard_ok'
		);
	});

	it('reconciles an already-installed S5 finalizer body without weakening its guard', () => {
		expect(trueToolRoundCountReplayOutput).toContain('COMMIT');
	});

	it('merges immutable pending intent inside authoritative terminal truth', () => {
		expect(terminalPendingIntentOutput).toContain(
			'agentic_chat_terminal_pending_intent_metadata_ok'
		);
	});

	it('persists semantic pending contracts from durable multi-effect truth', () => {
		expect(terminalPendingContractOutput).toContain(
			'agentic_chat_terminal_pending_contract_metadata_ok'
		);
	});

	it('hardens worker contract cancellation, lifecycle evidence, fields, and scope', () => {
		expect(terminalPendingContractHardeningOutput).toContain(
			'agentic_chat_turn_contract_worker_hardening_ok'
		);
	});

	it('replays clarification reset safely and preserves only prior in-scope work', () => {
		expect(clarificationContractResetOutput).toContain(
			'agentic_chat_clarification_contract_reset_ok'
		);
	});

	it('identifies a missing terminal-contract prerequisite explicitly', () => {
		expect(clarificationMissingPrerequisiteOutput).toContain(
			'agentic_chat_clarification_reset_prerequisite_missing'
		);
		expect(clarificationMissingPrerequisiteOutput).toContain(
			'Apply migrations 20260814010000 through 20260814013000'
		);
	});

	it('projects frozen sensing and durable load outcomes into terminal domain metadata', () => {
		expect(terminalDomainMetadataOutput).toContain('agentic_chat_terminal_domain_metadata_ok');
	});

	it('accepts truthful streamed-turn timing drafts and rejects microsecond drift', () => {
		expect(readToolLedgerOutput).toContain('timing_evidence_repair_ok');
	});

	it('persists an idempotent session handoff before public context-shift delivery', () => {
		expect(sessionHandoffOutput).toContain('agentic_chat_worker_session_handoff_ok');
	});
});
