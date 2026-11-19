// apps/worker/scripts/knowledge-sort.ts
//
// Tasker 169: sort one user's people and orgs into "your world" / "just mentioned", hide
// non-names and suggest merges, the same way the hourly sweep does (but without waiting for a
// batch to fill).
//
//   Dry (free):        pnpm exec tsx scripts/knowledge-sort.ts --user-email <email>
//                      What waits and why, what signals settle, the model estimate.
//   Preview (paid):    KNOWLEDGE_SORT_LIVE=1 ... --preview [--limit N]
//                      Asks the model, prints every decision, saves nothing.
//   Write (paid):      KNOWLEDGE_SORT_LIVE=1 ... --write [--limit N]
//                      Sorts and saves.
//   --out FILE         Also write the decisions as JSON.
// Reads apps/worker/.env.

import { existsSync, writeFileSync } from 'node:fs';
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

/** Measured decision-model cost per call (llm_usage_logs, 621 calls, 30 days to 2026-11-17). */
const USD_PER_CALL = 0.0006;

async function main() {
	const preview = process.argv.includes('--preview');
	const write = process.argv.includes('--write');
	if ((preview || write) && process.env.KNOWLEDGE_SORT_LIVE !== '1')
		throw new Error('--preview/--write spend money: set KNOWLEDGE_SORT_LIVE=1 after approval');
	const email = arg('--user-email');
	if (!email) throw new Error('Pass --user-email');
	const limit = Number(arg('--limit') ?? 0) || null;
	const out = arg('--out');

	const { supabase } = await import('../src/lib/supabase');
	const knowledge = await import('@buildos/shared-agent-ops/knowledge');
	const db = supabase as any;

	const { data: user } = await db.from('users').select('id').eq('email', email).maybeSingle();
	if (!user) throw new Error('No user with that email');

	// Waiting = never sorted, decided under an older question, or linked to new work since.
	const waiting = await knowledge.findEntriesToSort(db, user.id);
	console.log('Waiting to be sorted:', waiting.why, waiting.ripe ? '(ripe)' : '(not ripe yet)');
	let ids = waiting.ids;
	if (limit) ids = ids.slice(0, limit);

	const signals = await knowledge.gatherCircleSignals(db, user.id, ids);
	const ambiguous = signals.filter((s) => !knowledge.circleFromSignals(s));
	const calls = Math.ceil(ambiguous.length / knowledge.CIRCLE_BATCH_SIZE);
	console.log(
		`${signals.length} people/orgs · ${signals.length - ambiguous.length} settled by signals (free) · ${ambiguous.length} for the model → ${calls} call(s), ≈ $${(calls * USD_PER_CALL).toFixed(4)}`
	);
	if (!preview && !write) {
		for (const s of ambiguous.slice(0, 20)) console.log(`  ${s.kind.padEnd(6)} ${s.name}`);
		if (ambiguous.length > 20) console.log(`  … ${ambiguous.length - 20} more`);
		console.log('Dry run: nothing asked, nothing written.');
		return;
	}

	const { getKnowledgeDecider } = await import('../src/workers/knowledge/knowledgeEnrichWorker');
	const decider = getKnowledgeDecider();
	if (!decider) throw new Error('PRIVATE_OPENROUTER_API_KEY is not set');
	const result = await knowledge.sortKnowledgeEntries(db, user.id, ids, {
		decider,
		save: write
	});
	const label = (d: (typeof result.decisions)[number]) =>
		d.notAName
			? 'NOT A NAME'
			: d.circle === 'inner'
				? 'your world'
				: d.circle === 'public'
					? 'just mentioned'
					: 'unsure';
	const groups = new Map<string, string[]>();
	for (const d of result.decisions) {
		const key = label(d);
		const list = groups.get(key) ?? [];
		list.push(
			`${d.name}${d.confidence !== undefined ? ` (${d.confidence.toFixed(2)})` : ''}${d.sameAs ? ` ≈ ${signals.find((s) => s.entityId === d.sameAs)?.name ?? d.sameAs}` : ''}`
		);
		groups.set(key, list);
	}
	for (const [key, names] of groups)
		console.log(`\n${key} (${names.length}):\n  ${names.join(' · ')}`);
	console.log(
		`\n${write ? 'Saved' : 'Preview, nothing saved'} · model asked ${result.modelAsked} · ${result.calls} call(s) · $${result.costUsd.toFixed(4)} · ${result.notAName} not a name · ${result.mergeSuggestions} merge suggestion(s)`
	);
	if (out) writeFileSync(out, JSON.stringify(result.decisions, null, 2));
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
