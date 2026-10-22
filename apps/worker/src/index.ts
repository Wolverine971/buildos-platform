// apps/worker/src/index.ts
// Load .env before importing the process composition root. Several config
// modules read environment variables at module evaluation time.
import 'dotenv/config';
import { logRuntimeVersions } from './lib/runtimeVersions';

async function main(): Promise<void> {
	logRuntimeVersions('daily-brief-worker');
	const { startGeneralWorkerProcess } = await import('./bootstrap.js');
	await startGeneralWorkerProcess();
}

void main();
