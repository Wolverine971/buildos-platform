// apps/worker/src/scripts/bakeoffAgentRunWorker.ts
//
// LOCAL TEST HARNESS — a scoped worker that registers ONLY the `agent_run`
// processor and starts the poll loop. It deliberately does NOT start the
// scheduler, startup cleanup, or any other job-type processor, so running it
// against the production queue cannot create or process real brief/SMS/
// notification jobs (`claim_pending_jobs` only claims registered job types).
//
// Used to run the deep-research bake-off with the local (uncommitted) worker
// code + a Tavily key. Requires the production Railway worker to be paused so
// it does not race this process for the same `agent_run` jobs.
//
// Run: pnpm --filter @buildos/worker exec tsx src/scripts/bakeoffAgentRunWorker.ts

import 'dotenv/config';
import { queue } from '../lib/queue';
import { processAgentRunJob } from '../workers/agent-run/agentRunWorker';

async function main(): Promise<void> {
	console.log('🧪 Bake-off agent-run worker starting (agent_run only, no scheduler)...');
	queue.process('agent_run', (job) => processAgentRunJob(job as never));
	await queue.start();
	console.log('🧪 Bake-off worker polling for agent_run jobs. Ctrl-C to stop.');

	const shutdown = async (signal: string) => {
		console.log(`\n🧪 ${signal} received, stopping bake-off worker...`);
		await queue.stop();
		process.exit(0);
	};
	process.on('SIGINT', () => void shutdown('SIGINT'));
	process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
	console.error('🧪 Bake-off worker failed to start:', error);
	process.exit(1);
});
