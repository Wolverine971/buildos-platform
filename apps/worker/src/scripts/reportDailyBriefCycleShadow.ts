// apps/worker/src/scripts/reportDailyBriefCycleShadow.ts
import { calculateNextRunTime } from '../scheduler';
import { runDailyBriefCycleShadow } from '../workers/cycle/dailyBriefCycleShadow';
import { persistDailyBriefCycleShadowMetrics } from '../workers/cycle/cycleMetrics';

function positiveIntegerFlag(name: string, fallback: number): number {
	const prefix = `--${name}=`;
	const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function main(): Promise<void> {
	const summary = await runDailyBriefCycleShadow({
		calculateLegacyNextRunAt: calculateNextRunTime,
		batchSize: positiveIntegerFlag('batch-size', 100),
		maxRecords: positiveIntegerFlag('max-records', Number.MAX_SAFE_INTEGER)
	});
	if (!process.argv.includes('--no-persist')) {
		await persistDailyBriefCycleShadowMetrics(summary);
	}
	console.log(JSON.stringify(summary, null, 2));
	if (summary.mismatched > 0 || summary.missingCycle > 0 || summary.invalid > 0) {
		process.exitCode = 2;
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
