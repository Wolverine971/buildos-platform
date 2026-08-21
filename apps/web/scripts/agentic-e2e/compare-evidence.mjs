// apps/web/scripts/agentic-e2e/compare-evidence.mjs
// Usage: node scripts/agentic-e2e/compare-evidence.mjs <baseline.json> <candidate.json>
// Diffs two schema-v2 agentic-e2e evidence artifacts and prints a per-scenario
// markdown regression report; exits 1 if any shared scenario regressed.

import fs from 'node:fs';

const RESULT_CLASSES = [
	'end_to_end_pass',
	'transport_failure',
	'behavior_failure',
	'quality_failure',
	'judge_infrastructure_failure',
	'instrument_failure'
];

function emptyResultClassCounts() {
	return Object.fromEntries(RESULT_CLASSES.map((resultClass) => [resultClass, 0]));
}

/** 95% Wilson score interval — matches evidence-report.ts's wilson95(). */
function wilson95(passCount, sampleCount) {
	if (sampleCount <= 0) return { low: 0, high: 0 };
	const z = 1.959963984540054;
	const proportion = passCount / sampleCount;
	const denominator = 1 + (z * z) / sampleCount;
	const center = (proportion + (z * z) / (2 * sampleCount)) / denominator;
	const margin =
		(z / denominator) *
		Math.sqrt(
			(proportion * (1 - proportion)) / sampleCount +
				(z * z) / (4 * sampleCount * sampleCount)
		);
	return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

/**
 * Fallback classifier for artifacts that predate `resultClass` on turns.
 * Mirrors classifyPhase0TurnResult() in
 * apps/web/src/lib/tests/agentic-e2e/phase0/evidence-report.ts, but tolerates
 * the missing fields (`deterministicAssertionPassed`, `judge`) older artifacts
 * never captured.
 */
function deriveResultClass(turn) {
	if (turn.resultClass) return turn.resultClass;
	const terminalFailureReasons = ['error', 'failed', 'cancelled', 'turn_rejected'];
	if (
		turn.completed === false ||
		(Array.isArray(turn.streamErrors) && turn.streamErrors.length > 0) ||
		terminalFailureReasons.includes(turn.finishedReason ?? null) ||
		(turn.turnRun && turn.turnRun.status && turn.turnRun.status !== 'completed')
	) {
		return 'transport_failure';
	}
	const deterministicPassed = turn.deterministicAssertionPassed ?? turn.assertionPassed;
	if (deterministicPassed === false) return 'behavior_failure';
	if (turn.judge?.status === 'error') return 'judge_infrastructure_failure';
	if (turn.judge?.status === 'failed') return 'quality_failure';
	if (Array.isArray(turn.captureErrors) && turn.captureErrors.length > 0)
		return 'instrument_failure';
	return 'end_to_end_pass';
}

function controlDecisionSequence(turn) {
	const decisions = Array.isArray(turn.controlDecisions) ? turn.controlDecisions : [];
	if (decisions.length === 0) return '(no control decisions recorded)';
	return decisions.map((decision) => decision.name).join(' > ');
}

function topSequences(turns, limit) {
	const counts = new Map();
	for (const turn of turns) {
		const seq = controlDecisionSequence(turn);
		counts.set(seq, (counts.get(seq) ?? 0) + 1);
	}
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([seq, count]) => ({ seq, count }));
}

function turnCostUsd(turn) {
	const cost = turn.usage?.totalCostUsd;
	return typeof cost === 'number' && Number.isFinite(cost) ? cost : 0;
}

/** Builds per-scenario stats for one artifact, preferring summary.scenarioResults when present. */
function buildArtifactStats(doc) {
	const scenarioResultsBysId = new Map(
		(doc.summary?.scenarioResults ?? []).map((entry) => [entry.scenarioId, entry])
	);
	const turnsByScenario = new Map();
	for (const turn of doc.turns ?? []) {
		const list = turnsByScenario.get(turn.scenarioId) ?? [];
		list.push(turn);
		turnsByScenario.set(turn.scenarioId, list);
	}

	const scenarioIds = new Set([...scenarioResultsBysId.keys(), ...turnsByScenario.keys()]);
	const stats = new Map();
	for (const scenarioId of scenarioIds) {
		const turns = turnsByScenario.get(scenarioId) ?? [];
		let base;
		const precomputed = scenarioResultsBysId.get(scenarioId);
		if (precomputed) {
			base = {
				turnCount: precomputed.turnCount,
				passCount: precomputed.passCount,
				passRate: precomputed.passRate,
				ci: precomputed.confidenceInterval95,
				resultClassCounts: precomputed.resultClassCounts ?? emptyResultClassCounts()
			};
		} else {
			const turnCount = turns.length;
			const passCount = turns.filter((turn) => turn.assertionPassed === true).length;
			const resultClassCounts = emptyResultClassCounts();
			for (const turn of turns) resultClassCounts[deriveResultClass(turn)] += 1;
			base = {
				turnCount,
				passCount,
				passRate: turnCount > 0 ? passCount / turnCount : 0,
				ci: wilson95(passCount, turnCount),
				resultClassCounts
			};
		}
		stats.set(scenarioId, {
			...base,
			costUsd: turns.reduce((sum, turn) => sum + turnCostUsd(turn), 0),
			topSequences: topSequences(turns, 3)
		});
	}
	return stats;
}

function pct(fraction) {
	return `${(fraction * 100).toFixed(1)}%`;
}

function fmtRate(entry) {
	if (!entry) return 'n/a (scenario not run)';
	return `${entry.passCount}/${entry.turnCount} (${pct(entry.passRate)}) [${pct(entry.ci.low)}–${pct(entry.ci.high)}]`;
}

function fmtCost(entry) {
	if (!entry) return 'n/a';
	return `$${entry.costUsd.toFixed(4)}`;
}

function fmtSequences(entry) {
	if (!entry || entry.topSequences.length === 0) return '_(none)_';
	return entry.topSequences.map((s, i) => `${i + 1}. \`${s.seq}\` × ${s.count}`).join('\n');
}

function isRegression(baseline, candidate) {
	if (!baseline || !candidate) return false;
	if (
		baseline.turnCount === candidate.turnCount &&
		baseline.passCount - candidate.passCount >= 2
	) {
		return true;
	}
	if (baseline.passCount >= 1 && candidate.passCount === 0 && candidate.turnCount > 0) {
		return true;
	}
	return false;
}

function main() {
	const [baselinePath, candidatePath] = process.argv.slice(2);
	if (!baselinePath || !candidatePath) {
		console.error(
			'Usage: node scripts/agentic-e2e/compare-evidence.mjs <baseline.json> <candidate.json>'
		);
		process.exit(2);
	}

	const baselineDoc = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
	const candidateDoc = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
	const baselineStats = buildArtifactStats(baselineDoc);
	const candidateStats = buildArtifactStats(candidateDoc);
	const scenarioIds = [...new Set([...baselineStats.keys(), ...candidateStats.keys()])].sort();

	const lines = [];
	lines.push('# Agentic E2E Evidence Comparison');
	lines.push('');
	lines.push(
		`- Baseline: \`${baselinePath}\` (runId \`${baselineDoc.runId ?? 'unknown'}\`, ${baselineDoc.generatedAt ?? 'unknown time'})`
	);
	lines.push(
		`- Candidate: \`${candidatePath}\` (runId \`${candidateDoc.runId ?? 'unknown'}\`, ${candidateDoc.generatedAt ?? 'unknown time'})`
	);
	lines.push('');

	const regressed = [];

	for (const scenarioId of scenarioIds) {
		const b = baselineStats.get(scenarioId) ?? null;
		const c = candidateStats.get(scenarioId) ?? null;
		const regression = isRegression(b, c);
		if (regression) regressed.push({ scenarioId, baseline: b, candidate: c });

		lines.push(`## ${scenarioId}${regression ? ' ⚠️ REGRESSION' : ''}`);
		lines.push('');
		lines.push('| Metric | Baseline | Candidate |');
		lines.push('|---|---|---|');
		lines.push(`| Pass rate (95% CI) | ${fmtRate(b)} | ${fmtRate(c)} |`);
		lines.push(`| Cost | ${fmtCost(b)} | ${fmtCost(c)} |`);
		lines.push('');

		lines.push('**Result-class deltas**');
		lines.push('');
		lines.push('| Class | Baseline | Candidate | Delta |');
		lines.push('|---|---|---|---|');
		for (const resultClass of RESULT_CLASSES) {
			const bCount = b?.resultClassCounts[resultClass] ?? 0;
			const cCount = c?.resultClassCounts[resultClass] ?? 0;
			// A missing side means "scenario not run there," not a real swing to/from
			// zero — reporting a delta for it would misread as a regression signal.
			const deltaStr =
				!b || !c
					? 'n/a'
					: cCount - bCount === 0
						? '0'
						: cCount - bCount > 0
							? `+${cCount - bCount}`
							: `${cCount - bCount}`;
			lines.push(`| ${resultClass} | ${bCount} | ${cCount} | ${deltaStr} |`);
		}
		lines.push('');

		lines.push('**Top control-decision sequences**');
		lines.push('');
		lines.push('Baseline:');
		lines.push('');
		lines.push(fmtSequences(b));
		lines.push('');
		lines.push('Candidate:');
		lines.push('');
		lines.push(fmtSequences(c));
		lines.push('');
	}

	lines.push('## Verdict');
	lines.push('');
	const verdict =
		regressed.length === 0
			? 'VERDICT: NO REGRESSION DETECTED'
			: `VERDICT: REGRESSION DETECTED — ${regressed.length} scenario(s): ${regressed
					.map(
						(r) =>
							`${r.scenarioId} (${r.baseline.passCount}/${r.baseline.turnCount} → ${r.candidate.passCount}/${r.candidate.turnCount})`
					)
					.join(', ')}`;
	lines.push(verdict);

	console.log(lines.join('\n'));
	process.exit(regressed.length > 0 ? 1 : 0);
}

main();
