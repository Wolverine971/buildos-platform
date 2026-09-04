#!/usr/bin/env node
// apps/web/scripts/agentic-e2e/render-scorecard.mjs
//
// Usage:
//   node scripts/agentic-e2e/render-scorecard.mjs <scorecard.json> [baseline.json]
//   node scripts/agentic-e2e/render-scorecard.mjs <scorecard.json> --baseline <path>
//   node scripts/agentic-e2e/render-scorecard.mjs <scorecard.json> <baseline.json> --fail-on-regression
//
// Renders a battery scorecard artifact (written by the agentic-e2e entry test
// when AGENTIC_BATTERY is set) as the markdown table used by
// artifacts/agentic-chat-audit-2026-09-03.md, so deploy-over-deploy runs can be
// diffed against the original hand-graded assessment. With a baseline, each row
// gains a delta column.

import fs from 'node:fs';

const RUBRIC = {
	4: 'verified correct',
	3: 'correct with minor friction',
	2: 'partial or repaired',
	1: 'material failure, accurate recovery',
	0: 'failed or misleading'
};

/** Audit grade bands — must match letterGrade() in harness/battery.ts. */
function letterGrade(percent) {
	if (percent >= 90) return 'A';
	if (percent >= 80) return 'B';
	if (percent >= 70) return 'C';
	if (percent >= 60) return 'D';
	return 'F';
}

function usage(message) {
	console.error(message);
	console.error(
		'Usage: node scripts/agentic-e2e/render-scorecard.mjs <scorecard.json> [baseline.json] [--fail-on-regression]'
	);
	process.exit(2);
}

function loadScorecard(path, label) {
	let parsed;
	try {
		parsed = JSON.parse(fs.readFileSync(path, 'utf8'));
	} catch (error) {
		usage(`Could not read ${label} at ${path}: ${error.message}`);
	}
	if (parsed?.kind !== 'agentic_chat_battery_scorecard' || !Array.isArray(parsed.cases)) {
		usage(
			`${label} at ${path} is not a battery scorecard. ` +
				'(A Phase 0 evidence artifact is a different shape — use compare-evidence.mjs for those.)'
		);
	}
	return parsed;
}

function escapeCell(value) {
	return String(value ?? '')
		.replace(/\|/g, '\\|')
		.replace(/\s+/g, ' ')
		.trim();
}

function truncate(value, max) {
	const text = escapeCell(value);
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatDelta(delta) {
	if (delta === null) return 'new';
	if (delta > 0) return `+${delta}`;
	if (delta < 0) return `${delta}`;
	return '—';
}

function totals(scorecard) {
	const totalScore = scorecard.cases.reduce((sum, entry) => sum + entry.score, 0);
	const maxScore = scorecard.cases.reduce((sum, entry) => sum + (entry.maxScore ?? 4), 0);
	const percent = maxScore === 0 ? 0 : (totalScore / maxScore) * 100;
	return { totalScore, maxScore, percent: Math.round(percent * 10) / 10 };
}

const positional = [];
let baselinePath = null;
let failOnRegression = false;
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
	const arg = argv[index];
	if (arg === '--fail-on-regression') failOnRegression = true;
	else if (arg === '--baseline') baselinePath = argv[++index] ?? null;
	else if (arg.startsWith('--baseline=')) baselinePath = arg.slice('--baseline='.length);
	else if (arg.startsWith('--')) usage(`Unknown flag ${arg}`);
	else positional.push(arg);
}

if (positional.length === 0) usage('A scorecard file is required.');
if (positional.length > 2) usage('Expected at most two files: <scorecard.json> [baseline.json].');
if (positional.length === 2) {
	if (baselinePath) usage('Pass the baseline either positionally or with --baseline, not both.');
	baselinePath = positional[1];
}

const scorecard = loadScorecard(positional[0], 'scorecard');
const baseline = baselinePath ? loadScorecard(baselinePath, 'baseline') : null;
const baselineByCase = new Map((baseline?.cases ?? []).map((entry) => [entry.scenarioId, entry]));

const rows = [...scorecard.cases].sort((left, right) => left.case - right.case);
const lines = [];

lines.push(`# Agentic chat battery — ${scorecard.battery}`);
lines.push('');
lines.push(
	`Run \`${scorecard.runId}\` at ${scorecard.generatedAt} against ${scorecard.configuration.baseUrl} ` +
		`on the \`${scorecard.configuration.executionMode}\` path` +
		(scorecard.head ? `, HEAD \`${scorecard.head.slice(0, 9)}\`.` : '.')
);
if (baseline) {
	lines.push('');
	lines.push(
		`Baseline: run \`${baseline.runId}\` at ${baseline.generatedAt}` +
			(baseline.head ? `, HEAD \`${baseline.head.slice(0, 9)}\`.` : '.')
	);
}

const current = totals(scorecard);
lines.push('');
lines.push(
	`## Result: ${letterGrade(current.percent)} — ${current.totalScore}/${current.maxScore} points (${current.percent}%)`
);
if (baseline) {
	const previous = totals(baseline);
	const shift = current.totalScore - previous.totalScore;
	lines.push('');
	lines.push(
		`Baseline was ${letterGrade(previous.percent)} — ${previous.totalScore}/${previous.maxScore} ` +
			`(${previous.percent}%). Net ${formatDelta(shift)} point(s).`
	);
}

lines.push('');
lines.push(
	baseline
		? '| #   | Scenario | Score | Δ | Observed outcome |'
		: '| #   | Scenario | Score | Observed outcome |'
);
lines.push(
	baseline
		? '| --- | -------- | ----: | --: | ---------------- |'
		: '| --- | -------- | ----: | ---------------- |'
);

const regressions = [];
for (const row of rows) {
	const cells = [String(row.case), truncate(row.title, 80), `${row.score}/${row.maxScore ?? 4}`];
	if (baseline) {
		const previous = baselineByCase.get(row.scenarioId);
		const delta = previous ? row.score - previous.score : null;
		if (delta !== null && delta < 0) {
			regressions.push({ case: row.case, scenarioId: row.scenarioId, delta });
		}
		cells.push(formatDelta(delta));
	}
	cells.push(truncate(row.outcome, 110));
	lines.push(`| ${cells.join(' | ')} |`);
}

lines.push('');
lines.push('Score rubric (from the 2026-09-03 assessment):');
for (const score of [4, 3, 2, 1, 0]) lines.push(`- **${score}** — ${RUBRIC[score]}`);

if (baseline && regressions.length > 0) {
	lines.push('');
	lines.push('## Regressions');
	for (const regression of regressions) {
		lines.push(`- Case ${regression.case} (\`${regression.scenarioId}\`): ${regression.delta}`);
	}
}

console.log(lines.join('\n'));

if (failOnRegression && regressions.length > 0) process.exit(1);
