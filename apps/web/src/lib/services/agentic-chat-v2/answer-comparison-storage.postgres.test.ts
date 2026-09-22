// apps/web/src/lib/services/agentic-chat-v2/answer-comparison-storage.postgres.test.ts
// Runs the "Compare answers" storage contract against a disposable local PostgreSQL:
// the workflow v1 fixture, the workflow storage migration (hash helpers), the
// comparisons migration, then the executable SQL contract. Skips without local binaries.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const FIXTURE = 'supabase/tests/fixtures/agentic_chat_workflow_v1_base.sql';
const MIGRATIONS = [
	'supabase/migrations/20260914203007_agentic_chat_workflow_v1_storage.sql',
	'supabase/migrations/20260922002140_agentic_chat_answer_comparisons_v1.sql'
];
const CONTRACT = 'supabase/tests/20260922002140_agentic_chat_answer_comparisons_v1.test.sql';

const postgresAvailable = ['initdb', 'pg_ctl', 'psql'].every(
	(command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
);
const describePostgres = postgresAvailable ? describe : describe.skip;

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

describePostgres('answer comparison storage against disposable PostgreSQL', () => {
	let tempDir = '';
	let dataDir = '';
	let socketDir = '';
	let port = 0;
	let output = '';

	const applySqlFile = (path: string): string =>
		execFileSync(
			'psql',
			[
				'-X',
				'-q',
				'-A',
				'-t',
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
				path
			],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
		).trim();

	beforeAll(async () => {
		tempDir = mkdtempSync('/tmp/buildos-answer-comparisons-pg-');
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
		applySqlFile(sqlPath(FIXTURE));
		for (const migration of MIGRATIONS) applySqlFile(sqlPath(migration));
		try {
			output = applySqlFile(sqlPath(CONTRACT));
		} catch (error) {
			throw new Error(String((error as { stderr?: string }).stderr ?? error), {
				cause: error
			});
		}
	}, 60_000);

	afterAll(() => {
		if (dataDir)
			spawnSync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { stdio: 'ignore' });
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	});

	it('creates atomically, binds candidates to the frozen packet, locks candidates after a vote, and seals votes on reveal', () => {
		expect(output).toContain('answer_comparisons_v1_ok');
	});
});
