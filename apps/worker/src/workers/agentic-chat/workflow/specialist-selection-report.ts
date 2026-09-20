// apps/worker/src/workers/agentic-chat/workflow/specialist-selection-report.ts
import {
	type SpecialistShadowInput,
	type SpecialistShadowResult,
	selectionHash
} from './specialist-selection-policy';
export type SpecialistShadowRow = {
	turn_run_id: string;
	input: SpecialistShadowInput;
	input_hash: string;
	result: SpecialistShadowResult | null;
	result_hash: string | null;
};
/** Offline audit only. Hashes protect accidental corruption, not untrusted export provenance. */
export function renderSpecialistShadowReport(rows: readonly SpecialistShadowRow[]): string {
	if (rows.length > 1000) throw new Error('Report accepts at most 1000 receipts');
	const seen = new Set<string>();
	for (const row of rows) {
		if (
			!row ||
			typeof row.turn_run_id !== 'string' ||
			seen.has(row.turn_run_id) ||
			row.input?.version !== 'specialist_shadow_input_v1' ||
			row.input_hash !== selectionHash(row.input) ||
			!Array.isArray(row.input.request?.state?.bundles) ||
			(row.result === null
				? row.result_hash !== null
				: row.result?.version !== 'specialist_shadow_result_v1' ||
					row.result_hash !== selectionHash(row.result))
		)
			throw new Error('Invalid, duplicate or corrupt shadow receipt');
		seen.add(row.turn_run_id);
	}
	const observed = rows.filter((row) => row.result?.status === 'observed');
	const pending = rows.filter((row) => !row.result);
	const agreement = observed.filter(
		(row) => row.result!.selectedBundle === row.input.baseline
	).length;
	const costKnown = rows.filter((row) => typeof row.result?.usage?.costUsd === 'number');
	const reportedCost = costKnown.reduce((total, row) => total + row.result!.usage!.costUsd!, 0);
	const escape = (s: unknown) =>
		String(s ?? '—')
			.replace(/\|/g, '\\|')
			.replace(/[\r\n]/g, ' ');
	const lines = [
		'# Specialist selection shadow report',
		'',
		`${rows.length} runs: ${observed.length} observed, ${rows.length - observed.length - pending.length} unavailable, ${pending.length} missing final receipts.`,
		'',
		`Jev agreed with the fixed bundle on ${agreement}/${observed.length} observed runs. Agreement measures consistency, not correctness.`,
		'',
		`Reported selector cost: $${reportedCost.toFixed(6)} across ${costKnown.length} receipts; ${rows.length - costKnown.length} have unknown cost. Shadow cost is separate from the workflow dispatch ledger.`,
		'',
		'| Run | Fixed bundle | Jev choice | Shadow recommendation | Tools in Jev choice | Probabilities | Duration |',
		'| --- | --- | --- | --- | --- | --- | --- |'
	];
	for (const row of rows) {
		const result = row.result;
		const selected = row.input.request.state.bundles.find(
			(b) => b.id === result?.selectedBundle
		);
		const probabilities = result?.probabilities
			? Object.entries(result.probabilities)
					.sort((a, b) => b[1] - a[1])
					.map(([id, p]) => `${id}: ${(p * 100).toFixed(1)}%`)
					.join('; ')
			: '—';
		lines.push(
			`| ${[
				row.turn_run_id,
				row.input.baseline,
				result?.selectedBundle ?? result?.reason ?? 'missing receipt',
				result?.recommendedBundle ?? row.input.baseline,
				selected?.tools.join(', ') || 'none',
				probabilities,
				result?.usage ? `${result.usage.durationMs} ms` : 'unknown'
			]
				.map(escape)
				.join(' | ')} |`
		);
	}
	lines.push(
		'',
		'All runs executed the fixed workflow. No shadow recommendation grants tools or starts agents.',
		'Probabilities and confidence are uncalibrated; human labels and outcome review are needed before enabling routing.',
		'Missing receipts mean the provider outcome and cost may be unknown. Recovery does not issue another selection call.',
		''
	);
	return lines.join('\n');
}
