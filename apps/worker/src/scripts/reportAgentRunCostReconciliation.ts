// apps/worker/src/scripts/reportAgentRunCostReconciliation.ts

import { loadAgentRunCostReconciliationReport } from '../workers/agent-run/agentRunCostReport';

function integerFlag(name: string, fallback: number): number {
	const prefix = `--${name}=`;
	const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function usd(value: number): string {
	return `$${value.toFixed(8)}`;
}

async function main() {
	const json = process.argv.includes('--json');
	const failOnUnresolved = process.argv.includes('--fail-on-unresolved');
	const report = await loadAgentRunCostReconciliationReport({
		minAgeMinutes: integerFlag('min-age-minutes', 10),
		limit: integerFlag('limit', 200)
	});

	if (json) {
		console.log(JSON.stringify(report, null, 2));
	} else {
		console.log('Agent Run cost reconciliation report');
		console.log(`Generated: ${report.generatedAt}`);
		console.log(`Rows older than: ${report.cutoff}`);
		console.log(
			`Unresolved: ${report.totalMatchingRows} (${report.returnedRows} returned${
				report.truncated ? ', truncated' : ''
			})`
		);
		console.log(`Exposure: ${usd(report.totalExposureUsd)}`);
		console.log(
			`Operator=${report.operatorRequiredCount}, automatic retry=${report.automaticRetryCount}, leased=${report.leaseInFlightCount}, invalid=${report.invalidRows}`
		);
		for (const provider of report.providers) {
			console.log(
				`  ${provider.provider}: rows=${provider.count}, exposure=${usd(
					provider.exposureUsd
				)}, operator=${provider.operatorRequired}`
			);
		}
		for (const row of report.rows) {
			console.log(
				`  [${row.disposition}] ${row.id} ${row.provider}/${row.operation} ${usd(
					row.exposureUsd
				)} attempts=${row.reconciliationAttempts} request_id=${
					row.hasProviderRequestId ? 'present' : 'missing'
				}`
			);
		}
	}

	if (failOnUnresolved && report.totalMatchingRows > 0) {
		process.exitCode = 2;
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
