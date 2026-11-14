// docs/research/jev-tool-selection-2026-09-18/cutoff-replay.ts
//
// Is JEV_TOOL_INCLUSION_THRESHOLD still right? Replays Jev's logged scores from real
// turns through the worker's own selector at several cutoffs, and counts the turns
// where the model went on to call a tool that cutoff would have dropped.
//
// Free: one read-only production query (cutoff-replay.sql) and no model calls.
//   pnpm jev:cutoff-replay                 # fetch the last 60 days and replay
//   pnpm jev:cutoff-replay receipts.json   # replay a saved query result instead
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	JEV_CURRENT_WRITE_COMMISSION_QUESTION,
	JEV_TOOL_INCLUSION_THRESHOLD,
	selectJevToolDefinitions
} from '../../../apps/worker/src/workers/agentic-chat/provider/jev-tool-selector';
import type { AgenticChatTurnProviderToolV1 } from '../../../apps/worker/src/workers/agentic-chat/provider/contracts';
import { workerOpeningSurface } from './surfaces';

type Receipt = {
	turn_run_id: string;
	ctx: string | null;
	probs: Record<string, number>;
	called: string[] | null;
};

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const CUTOFFS = [0.3, 0.4, 0.5, 0.6, 0.7];
// Control tools are admitted by turn phase, never by Jev, so calling one is not a miss.
const CONTROLS = new Set([
	'approve_mutation_batch_review',
	'request_proposal_revision',
	'request_turn_clarification',
	'declare_read_only_turn',
	'declare_turn_contract',
	'cancel_turn_contract'
]);

function loadReceipts(file: string | undefined): Receipt[] {
	const raw = file
		? readFileSync(resolve(process.cwd(), file), 'utf8')
		: execFileSync(
				'pnpm',
				[
					'exec',
					'supabase',
					'db',
					'query',
					'--linked',
					'-f',
					resolve(HERE, 'cutoff-replay.sql')
				],
				{ cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
			);
	// The CLI prints a status line before the JSON.
	const parsed = JSON.parse(raw.slice(raw.indexOf('{'))) as { rows: Receipt[] };
	return parsed.rows.filter((row) => row.probs && typeof row.probs === 'object');
}

const definitions = new Map<string, AgenticChatTurnProviderToolV1>();
for (const surface of [
	workerOpeningSurface('global', true),
	workerOpeningSurface('project', true),
	workerOpeningSurface('global', false)
]) {
	for (const tool of surface) definitions.set(tool.function.name, tool);
}

/** The tools Jev was asked about on that turn, as today's definitions. */
function surfaceOf(row: Receipt): AgenticChatTurnProviderToolV1[] {
	return Object.keys(row.probs)
		.filter((name) => name !== JEV_CURRENT_WRITE_COMMISSION_QUESTION)
		.map((name) => definitions.get(name))
		.filter((tool): tool is AgenticChatTurnProviderToolV1 => Boolean(tool));
}

const receipts = loadReceipts(process.argv[2]);
const realTurns = receipts.filter((row) => row.called?.length);
console.log(
	`${receipts.length} Jev selections in the window; ${realTurns.length} belong to turns that called a tool.`
);
console.log(`Current cutoff: ${JEV_TOOL_INCLUSION_THRESHOLD}\n`);

for (const cutoff of CUTOFFS) {
	let kept = 0;
	let chars = 0;
	let turnsMissing = 0;
	const missed = new Map<string, number>();
	for (const row of realTurns) {
		const selected = selectJevToolDefinitions(surfaceOf(row), row.probs, cutoff);
		kept += selected.length;
		chars += JSON.stringify(selected).length;
		const names = new Set(selected.map((tool) => tool.function.name));
		const dropped = row.called!.filter((name) => !CONTROLS.has(name) && !names.has(name));
		if (dropped.length) turnsMissing += 1;
		for (const name of dropped) missed.set(name, (missed.get(name) ?? 0) + 1);
	}
	const n = Math.max(1, realTurns.length);
	console.log(
		`cutoff ${cutoff}${cutoff === JEV_TOOL_INCLUSION_THRESHOLD ? ' (current)' : ''}: ` +
			`${turnsMissing} of ${realTurns.length} turns called a tool it would drop; ` +
			`keeps ${(kept / n).toFixed(1)} tools, ${Math.round(chars / n)} schema chars per turn`
	);
	if (missed.size) {
		const top = [...missed].sort((x, y) => y[1] - x[1]);
		console.log(
			`   dropped but called: ${top
				.slice(0, 8)
				.map(([name, count]) => `${name} x${count}`)
				.join(', ')}${top.length > 8 ? `, and ${top.length - 8} more tools` : ''}`
		);
	}
}

const calledScores = realTurns
	.flatMap((row) => row.called!.map((name) => row.probs[name]))
	.filter((score): score is number => typeof score === 'number')
	.sort((a, b) => a - b);
if (calledScores.length) {
	console.log(
		`\nScores of the tools turns actually called (${calledScores.length}): ` +
			`lowest ${calledScores
				.slice(0, 10)
				.map((score) => score.toFixed(2))
				.join(
					' '
				)}; median ${calledScores[Math.floor(calledScores.length / 2)]!.toFixed(2)}`
	);
}
