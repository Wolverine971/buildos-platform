// apps/web/scripts/build-logger.js

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_FILE = path.join(process.cwd(), 'build-logs.log');
const TIMESTAMP = new Date().toISOString();

// Initialize log file
fs.writeFileSync(LOG_FILE, `Build Log - ${TIMESTAMP}\n${'='.repeat(80)}\n\n`);

// Helper to append to log file
function logToFile(data) {
	fs.appendFileSync(LOG_FILE, data);
}

// Helper to run a command and capture output
async function runCommand(name, command, args = []) {
	return new Promise((resolve) => {
		console.log(`\n${name}`);
		logToFile(`\n${name}\n${'-'.repeat(40)}\n`);

		const isWindows = process.platform === 'win32';
		const shell = isWindows ? 'cmd.exe' : '/bin/sh';
		const shellArgs = isWindows
			? ['/c', command, ...args]
			: ['-c', `${command} ${args.join(' ')}`];

		const proc = spawn(shell, shellArgs, {
			stdio: ['inherit', 'pipe', 'pipe'],
			cwd: process.cwd(),
			env: process.env
		});

		let hasErrors = false;

		proc.stdout?.on('data', (data) => {
			const output = data.toString();
			process.stdout.write(output);
			logToFile(output);

			// Check for warnings/errors
			const lowerOutput = output.toLowerCase();
			if (
				lowerOutput.includes('warning') ||
				lowerOutput.includes('error') ||
				lowerOutput.includes('failed')
			) {
				hasErrors = true;
			}
		});

		proc.stderr?.on('data', (data) => {
			const output = data.toString();
			process.stderr.write(output);
			logToFile(`[ERROR] ${output}`);
			hasErrors = true;
		});

		proc.on('close', (code) => {
			logToFile(`\nExited with code: ${code || 0}\n`);
			resolve({ exitCode: code || 0, hasErrors });
		});
	});
}

async function main() {
	console.log('🚀 Starting build process with logging...');
	console.log(`📝 Logging to: ${LOG_FILE}`);

	let failed = false;
	let hasWarnings = false;

	// 1. Run svelte-kit sync
	console.log('\n1️⃣ Running svelte-kit sync...');
	const syncResult = await runCommand('SVELTE-KIT SYNC', 'pnpm', ['exec', 'svelte-kit', 'sync']);
	if (syncResult.exitCode !== 0) failed = true;
	if (syncResult.hasErrors) hasWarnings = true;

	// 2. Run svelte-check
	console.log('\n2️⃣ Running svelte-check...');
	const checkResult = await runCommand('SVELTE-CHECK', 'pnpm', [
		'exec',
		'svelte-check',
		'--output',
		'human-verbose'
	]);
	if (checkResult.exitCode !== 0) failed = true;
	if (checkResult.hasErrors) hasWarnings = true;

	// 3. Run ESLint
	console.log('\n3️⃣ Running ESLint...');
	const lintResult = await runCommand('ESLINT', 'pnpm', ['run', 'lint']);
	if (lintResult.hasErrors) hasWarnings = true;

	// 4. Run Vite build
	console.log('\n4️⃣ Running Vite build...');
	const buildResult = await runCommand('VITE BUILD', 'pnpm', [
		'exec',
		'vite',
		'build',
		'--logLevel',
		'info'
	]);
	if (buildResult.exitCode !== 0) failed = true;
	if (buildResult.hasErrors) hasWarnings = true;

	// Summary
	const summary = `
${'='.repeat(80)}
BUILD SUMMARY
${'='.repeat(80)}
Build completed at: ${new Date().toISOString()}
Build Status: ${failed ? '❌ FAILED' : '✅ SUCCESS'}
Has Warnings/Errors: ${hasWarnings ? '⚠️  YES' : '✅ NO'}
Log file: ${LOG_FILE}
${'='.repeat(80)}
`;

	console.log(summary);
	logToFile(summary);

	process.exit(failed ? 1 : 0);
}

// Run the build
main().catch((err) => {
	console.error('Build script failed:', err);
	process.exit(1);
});
