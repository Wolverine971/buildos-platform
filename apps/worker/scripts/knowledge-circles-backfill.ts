// apps/worker/scripts/knowledge-circles-backfill.ts
//
// Tasker 164, part A: give every existing person/org entry a circle (inner / public / unknown).
// Structured signals settle most (contacts, `knows`/`owns`, private contact details, found by
// research); names only mentioned in the user's work are ambiguous and need the decision model.
//
//   Dry (default, free):  pnpm exec tsx scripts/knowledge-circles-backfill.ts --user-email <email>
//                         Prints what signals decide, how many are ambiguous, and the model estimate.
//   Save signals (free):  ... --write
//                         Stores the signal-settled circles. Ambiguous entries stay unknown.
//   With the model (paid): KNOWLEDGE_CIRCLES_LIVE=1 ... --write --model
//                         Also asks the decision model about the ambiguous ones (20 per call).
//   --limit N             Only the first N entries (newest first).
// Needs the circles migration (20261118100000) for --write. Reads apps/worker/.env.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const REPO = (() => {
	let dir = process.cwd();
	while (!existsSync(join(dir, 'pnpm-workspace.yaml')) && dirname(dir) !== dir)
		dir = dirname(dir);
	return dir;
})();
const envFile = join(REPO, 'apps/worker/.env');
if (!process.env.PRIVATE_SUPABASE_SERVICE_KEY && existsSync(envFile)) process.loadEnvFile(envFile);

const arg = (name: string) => {
	const index = process.argv.indexOf(name);
	return index > 0 ? process.argv[index + 1] : undefined;
};

/** Measured Jev cost per decision call (llm_usage_logs, 621 calls, 30 days to 2026-11-17). */
const JEV_USD_PER_CALL = 0.0006;

async function main() {
	const write = process.argv.includes('--write');
	const model = process.argv.includes('--model');
	if (model && process.env.KNOWLEDGE_CIRCLES_LIVE !== '1')
		throw new Error('--model spends money: set KNOWLEDGE_CIRCLES_LIVE=1 after approval');
	if (model && !write) throw new Error('--model needs --write');
	const email = arg('--user-email');
	if (!email) throw new Error('Pass --user-email');
	const limit = Number(arg('--limit') ?? 0) || null;

	const { supabase } = await import('../src/lib/supabase');
	const {
		circleFromSignals,
		CIRCLE_BATCH_SIZE,
		decideCirclesWithModel,
		gatherCircleSignals,
		saveCircleDecisions
	} = await import('@buildos/shared-agent-ops/knowledge');
	const db = supabase as any;

	const { data: user } = await db.from('users').select('id').eq('email', email).maybeSingle();
	if (!user) throw new Error('No user with that email');
	const ids: string[] = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await db
			.from('knowledge_entities')
			.select('id')
			.eq('owner_user_id', user.id)
			.eq('status', 'active')
			.in('kind', ['person', 'org'])
			.order('created_at', { ascending: false })
			.range(from, from + 999);
		if (error) throw new Error(error.message);
		ids.push(...(data ?? []).map((r: { id: string }) => r.id));
		if ((data ?? []).length < 1000) break;
	}
	const picked = limit ? ids.slice(0, limit) : ids;
	const signals = await gatherCircleSignals(db, user.id, picked);
	const settled = [];
	const ambiguous = [];
	for (const s of signals) {
		const d = circleFromSignals(s);
		if (d) settled.push(d);
		else ambiguous.push(s);
	}
	const tally = (rows: Array<{ circle: string; reason: string }>) => {
		const out: Record<string, number> = {};
		for (const r of rows)
			out[`${r.circle} (${r.reason})`] = (out[`${r.circle} (${r.reason})`] ?? 0) + 1;
		return out;
	};
	const calls = Math.ceil(ambiguous.length / CIRCLE_BATCH_SIZE);
	console.log(`${signals.length} people/orgs`);
	console.log('Settled by signals:', tally(settled));
	console.log(
		`Ambiguous (only mentioned in your work): ${ambiguous.length} → ${calls} model call(s), ≈ $${(calls * JEV_USD_PER_CALL).toFixed(4)}`
	);
	for (const s of ambiguous.slice(0, 15)) console.log(`  ${s.kind.padEnd(6)} ${s.name}`);
	if (ambiguous.length > 15) console.log(`  … ${ambiguous.length - 15} more`);
	if (!write) {
		console.log('Dry run: nothing written. --write saves the signal decisions (free).');
		return;
	}
	const saved = await saveCircleDecisions(db, user.id, settled);
	console.log(`Saved ${saved} signal decisions.`);
	if (!model) return;

	const { JevClient, LLMUsageLogger } = await import('@buildos/smart-llm');
	const apiKey = process.env.PRIVATE_OPENROUTER_API_KEY?.trim();
	if (!apiKey) throw new Error('PRIVATE_OPENROUTER_API_KEY is not set');
	const decider = new JevClient({
		apiKey,
		timeoutMs: 15_000,
		retryOnce: true,
		title: 'BuildOS Knowledge (circles backfill)',
		usage: new LLMUsageLogger({ supabase: db })
	});
	const result = await decideCirclesWithModel(ambiguous, decider as never, { userId: user.id });
	const keep = result.decisions.filter((d) => d.reason !== 'model_unsure' || d.confidence);
	const savedModel = await saveCircleDecisions(db, user.id, keep);
	console.log('Model:', tally(result.decisions));
	console.log(
		`Saved ${savedModel} model decisions · ${result.calls} call(s) · $${result.costUsd.toFixed(4)}`
	);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
