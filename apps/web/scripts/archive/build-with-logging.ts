// apps/web/scripts/archive/build-with-logging.ts
/**
 * Build script that captures all errors and warnings
 * and writes them to build-logs.log
 */

import { spawn } from 'child_process';
import { writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';

const LOG_FILE = join(process.cwd(), 'build-logs.log');
const TIMESTAMP = new Date().toISOString();

// Initialize log file
writeFileSync(LOG_FILE, `Build Log - ${TIMESTAMP}\n${'='.repeat(80)}\n\n`);

// Helper to write to log file
function logToFile(data: string, type: 'stdout' | 'stderr' = 'stdout') {
	const prefix = type === 'stderr' ? '[ERROR] ' : '';
	appendFileSync(LOG_FILE, `${prefix}${data}`);
}

// Helper to run a command and capture output
async function runCommand(
	command: string,
	args: string[]
): Promise<{ exitCode: number; hasErrors: boolean }> {
	return new Promise((resolve) => {
		console.log(`\n📦 Running: ${command} ${args.join(' ')}`);
		logToFile(`\n📦 Running: ${command} ${args.join(' ')}\n`);

		const proc = spawn(command, args, {
			shell: true,
			stdio: ['inherit', 'pipe', 'pipe'],
			cwd: process.cwd(),
			env: { ...process.env }
		});

		let hasErrors = false;

		// Capture stdout
		proc.stdout?.on('data', (data) => {
			const output = data.toString();
			process.stdout.write(output); // Show in console
			logToFile(output); // Log to file

			// Check for warnings/errors in stdout
			const lowerOutput = output.toLowerCase();
			if (
				lowerOutput.includes('warning') ||
				lowerOutput.includes('error') ||
				lowerOutput.includes('failed') ||
				output.includes('⚠') ||
				output.includes('❌') ||
				output.includes('✖')
			) {
				hasErrors = true;
			}
		});

		// Capture stderr
		proc.stderr?.on('data', (data) => {
			const output = data.toString();
			process.stderr.write(output); // Show in console
			logToFile(output, 'stderr'); // Log to file
			hasErrors = true;
		});

		proc.on('error', (error) => {
			console.error(`Failed to start process: ${error}`);
			logToFile(`Failed to start process: ${error}\n`, 'stderr');
			hasErrors = true;
		});

		proc.on('close', (code) => {
			const exitCode = code || 0;
			logToFile(`\nProcess exited with code: ${exitCode}\n`);
			resolve({ exitCode, hasErrors });
		});
	});
}

async function main() {
	console.log('🚀 Starting build process with logging...');
	console.log(`📝 Logging to: ${LOG_FILE}`);

	let totalErrors = false;
	let failed = false;

	try {
		// 1. Run svelte-kit sync
		console.log('\n1️⃣ Running svelte-kit sync...');
		logToFile('\n1️⃣ SVELTE-KIT SYNC\n' + '-'.repeat(40) + '\n');
		const syncResult = await runCommand('pnpm', ['exec', 'svelte-kit', 'sync']);
		if (syncResult.exitCode !== 0) failed = true;
		if (syncResult.hasErrors) totalErrors = true;

		// 2. Run svelte-check for type checking
		console.log('\n2️⃣ Running svelte-check...');
		logToFile('\n2️⃣ SVELTE-CHECK (Type Checking)\n' + '-'.repeat(40) + '\n');
		const checkResult = await runCommand('pnpm', [
			'exec',
			'svelte-check',
			'--output',
			'human-verbose'
		]);
		if (checkResult.exitCode !== 0) failed = true;
		if (checkResult.hasErrors) totalErrors = true;

		// 3. Run ESLint
		console.log('\n3️⃣ Running ESLint...');
		logToFile('\n3️⃣ ESLINT\n' + '-'.repeat(40) + '\n');
		const lintResult = await runCommand('pnpm', ['run', 'lint']);
		if (lintResult.hasErrors) totalErrors = true;

		// 4. Run the actual build with verbose logging
		console.log('\n4️⃣ Running Vite build...');
		logToFile('\n4️⃣ VITE BUILD\n' + '-'.repeat(40) + '\n');
		const buildResult = await runCommand('pnpm', [
			'exec',
			'vite',
			'build',
			'--logLevel',
			'info'
		]);
		if (buildResult.exitCode !== 0) failed = true;
		if (buildResult.hasErrors) totalErrors = true;

		// Summary
		const summary = `
${'='.repeat(80)}
BUILD SUMMARY
${'='.repeat(80)}
Build completed at: ${new Date().toISOString()}
Build Status: ${failed ? '❌ FAILED' : '✅ SUCCESS'}
Has Warnings/Errors: ${totalErrors ? '⚠️  YES' : '✅ NO'}
Log file: ${LOG_FILE}
${'='.repeat(80)}
`;

		console.log(summary);
		logToFile(summary);

		// Exit with appropriate code
		process.exit(failed ? 1 : 0);
	} catch (error) {
		console.error('Build script failed:', error);
		logToFile(`\nBuild script failed: ${error}\n`, 'stderr');
		process.exit(1);
	}
}

// Run the build
main();
