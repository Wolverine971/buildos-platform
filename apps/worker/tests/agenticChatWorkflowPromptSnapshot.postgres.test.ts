// apps/worker/tests/agenticChatWorkflowPromptSnapshot.postgres.test.ts
// SQL fences of the workflow prompt snapshot migration. The `/workflow` prototype that
// persisted these snapshots from the worker was retired; the durable review lane keeps its
// own evidence, so only the SQL contract is exercised here.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const EXISTING_MIGRATIONS = [
	'20260804032000_agentic_chat_prompt_snapshot.sql',
	'20260813050000_agentic_chat_prompt_snapshot_tool_definitions.sql',
	'20260817010000_agentic_chat_prompt_snapshot_runtime_augmentation.sql'
];
const WORKFLOW_MIGRATION = '20260914165546_agentic_chat_workflow_prompt_snapshot.sql';

const postgresAvailable = ['initdb', 'pg_ctl', 'psql'].every(
	(command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
);
const describePostgres = postgresAvailable ? describe : describe.skip;

describePostgres('workflow prompt snapshot SQL fences', () => {
	const repositoryRoot = resolve(process.cwd(), '../..');
	let tempDir = '';
	let dataDir = '';
	let socketDir = '';
	let port = 0;

	const applySqlFile = (relativePath: string): string =>
		execFileSync(
			'psql',
			[
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
				resolve(repositoryRoot, relativePath)
			],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
		);

	beforeAll(async () => {
		tempDir = mkdtempSync('/tmp/buildos-workflow-snapshot-pg-');
		dataDir = join(tempDir, 'data');
		socketDir = join(tempDir, 'socket');
		port = await availablePort();
		mkdirSync(socketDir);
		execFileSync(
			'initdb',
			[
				'-D',
				dataDir,
				'--no-locale',
				'--encoding=UTF8',
				'--auth=trust',
				'--username=postgres'
			],
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
		applySqlFile('supabase/tests/fixtures/agentic_chat_worker_prompt_snapshot_base.sql');
		for (const migration of EXISTING_MIGRATIONS)
			applySqlFile(`supabase/migrations/${migration}`);
	}, 60_000);

	afterAll(() => {
		if (dataDir)
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('keeps ordinary, runtime-augmentation, and workflow rejection fences in SQL', () => {
		applySqlFile(`supabase/migrations/${WORKFLOW_MIGRATION}`);
		const output = applySqlFile(
			'supabase/tests/20260914165546_agentic_chat_workflow_prompt_snapshot.test.sql'
		);
		expect(output).toContain('agentic_chat_prompt_snapshot_tool_definitions_ok');
		expect(output).toContain('agentic_chat_prompt_snapshot_runtime_augmentation_ok');
		expect(output).toContain('agentic_chat_workflow_prompt_snapshot_ok');
	});
});

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
