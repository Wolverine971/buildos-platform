#!/usr/bin/env node
// scripts/database/run-sql-contracts.mjs

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventorySqlContracts } from './sql-contracts.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const testsDirectory = join(repoRoot, 'supabase/tests');
const { inventory } = inventorySqlContracts(repoRoot);
const tests = inventory.filter(({ mode }) => mode === 'self-contained-disposable');

for (const command of ['initdb', 'pg_ctl', 'psql']) {
	const result = spawnSync(command, ['--version'], { encoding: 'utf8' });
	if (result.error || result.status !== 0) {
		console.error(`Required PostgreSQL command is unavailable: ${command}`);
		process.exit(2);
	}
}

if (tests.length === 0) {
	console.error('No self-contained disposable SQL contracts were discovered.');
	process.exit(1);
}

for (const { filename } of tests) runContract(filename);
console.log(`Disposable SQL contracts passed: ${tests.length}/${tests.length}.`);

function runContract(filename) {
	const temporaryRoot = mkdtempSync(join(tmpdir(), 'buildos-sql-contract-'));
	const dataDirectory = join(temporaryRoot, 'data');
	const socketDirectory = join(temporaryRoot, 'socket');
	const logPath = join(temporaryRoot, 'postgres.log');
	mkdirSync(socketDirectory);
	let started = false;
	try {
		execFileSync(
			'initdb',
			[
				'-D',
				dataDirectory,
				'--no-locale',
				'--encoding=UTF8',
				'--auth=trust',
				'--username=postgres'
			],
			{ stdio: 'pipe', encoding: 'utf8', timeout: 20_000 }
		);
		execFileSync(
			'pg_ctl',
			[
				'-D',
				dataDirectory,
				'-o',
				`-F -c listen_addresses='' -c unix_socket_directories='${socketDirectory}'`,
				'-l',
				logPath,
				'-w',
				'start'
			],
			{ stdio: 'ignore', timeout: 20_000 }
		);
		started = true;
		execFileSync(
			'psql',
			[
				'-h',
				socketDirectory,
				'-U',
				'postgres',
				'-d',
				'postgres',
				'-v',
				'ON_ERROR_STOP=1',
				'-f',
				join(testsDirectory, filename)
			],
			{
				cwd: testsDirectory,
				stdio: 'pipe',
				encoding: 'utf8',
				maxBuffer: 32 * 1024 * 1024,
				timeout: 60_000
			}
		);
		console.log(`✓ ${filename}`);
	} catch (error) {
		const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
		console.error(`✗ ${filename}`);
		if (output) console.error(output);
		process.exitCode = 1;
		throw error;
	} finally {
		if (started) {
			spawnSync('pg_ctl', ['-D', dataDirectory, 'stop', '-m', 'fast'], {
				stdio: 'ignore',
				timeout: 20_000
			});
		}
		rmSync(temporaryRoot, { recursive: true, force: true });
	}
}
