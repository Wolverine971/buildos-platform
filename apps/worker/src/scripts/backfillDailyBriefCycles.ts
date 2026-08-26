// apps/worker/src/scripts/backfillDailyBriefCycles.ts
import { backfillDailyBriefCycles } from '../workers/cycle/dailyBriefCycleBackfill';

function positiveIntegerFlag(name: string, fallback: number): number {
	const prefix = `--${name}=`;
	const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function main(): Promise<void> {
	const apply = process.argv.includes('--apply');
	const summary = await backfillDailyBriefCycles({
		dryRun: !apply,
		batchSize: positiveIntegerFlag('batch-size', 100),
		maxRecords: positiveIntegerFlag('max-records', Number.MAX_SAFE_INTEGER)
	});

	console.log(JSON.stringify(summary, null, 2));
	if (!apply) {
		console.log('Dry run only. Pass --apply to create paused Cycles.');
	}
	if (summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
