// apps/worker/scripts/consolidation-runner.ts
//
// A queue consumer for `consolidation_run` jobs only
// (docs/research/doc-task-consolidation-2026-10-03). Use it to exercise
// consolidation end to end from a dev machine while the main worker runs older
// code: it claims no other job type and leaves stalled-job recovery to the main
// worker. It reads the worker's .env, so it acts on whatever database that
// points at, and every model call it makes is paid.
//
//   cd apps/worker && NODE_OPTIONS=--conditions=development pnpm exec tsx scripts/consolidation-runner.ts
import { SupabaseQueue } from '../src/lib/supabaseQueue';
import { processConsolidationRun } from '../src/workers/consolidation/consolidationJob';

const queue = new SupabaseQueue({
	pollInterval: 2000,
	batchSize: 2,
	genericStalledRecovery: false
});
queue.process('consolidation_run', processConsolidationRun);

const stop = async () => {
	await queue.stop();
	process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

void queue.start();
