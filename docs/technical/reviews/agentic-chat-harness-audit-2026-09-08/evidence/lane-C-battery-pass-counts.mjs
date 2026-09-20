// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-C-battery-pass-counts.mjs
import { readFileSync } from 'node:fs';
const files = [
	'artifacts/agentic-chat-postdeploy-6d787284c-runs.json',
	'artifacts/agentic-chat-postdeploy-4ac73bde7-runs.json',
	'artifacts/agentic-chat-postdeploy-a1771c1f7-runs.json'
];
for (const f of files) {
	const list = Object.values(JSON.parse(readFileSync(f, 'utf8')));
	let acting = 0,
		reviewer = 0,
		failRoutes = 0;
	const tally = {};
	const rows = [];
	for (const r of list) {
		const routes = r.model_routes ?? [];
		const act = routes.filter((x) => x.model && !/gpt-5\.6-luna/.test(x.model)).length;
		const rev = routes.filter((x) => x.model && /gpt-5\.6-luna/.test(x.model)).length;
		acting += act;
		reviewer += rev;
		failRoutes += routes.filter((x) => x.status !== 'success').length;
		for (const o of r.tool_outcomes ?? []) {
			const k =
				o.tool + (o.success === false || /fail/.test(String(o.status)) ? ':fail' : '');
			tally[k] = (tally[k] || 0) + 1;
		}
		rows.push(
			`| ${(r.id || '').slice(0, 8)} | ${r.context_type ?? ''} | ${r.status} ${r.failure_code ?? ''} | ${r.elapsed_seconds}s | ${act} | ${rev} | ${(r.tool_outcomes ?? []).map((o) => o.tool.replace(/_onto_|_turn_|_proposal_/g, '_') + (o.success === false || /fail/.test(String(o.status)) ? '(x)' : '')).join(' ')} |`
		);
	}
	console.log(
		`\n## ${f}\nturns=${list.length} acting_attempts=${acting} reviewer_attempts=${reviewer} failed_routes=${failRoutes}\ntool tally: ${JSON.stringify(tally)}\n\n| turn | ctx | status | elapsed | acting | reviewer | tool outcomes |\n|---|---|---|---|---|---|---|`
	);
	for (const row of rows) console.log(row);
}
