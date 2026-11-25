// apps/worker/scripts/knowledge-cleanup-preview.ts
//
// What would Clean up on /knowledge show one user first? Runs the same code the page runs
// (KnowledgeStore.cleanupQueue) against their real graph and prints the queue in order, with
// each entry's source, counts, reasons and look-alikes. READ-ONLY: the queue changes nothing
// and this script makes no writes. Free: no model, no outside service.
//
//   pnpm exec tsx scripts/knowledge-cleanup-preview.ts --user-email <email>
//   --source work|linkedin|contacts|research|manual   only that source
//   --limit 40                                        how many to print (default 40)
// Reads apps/worker/.env. The names it prints are the user's private data: keep the output local.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { KnowledgeStore, isKnowledgeSource } from '@buildos/shared-agent-ops/knowledge';

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

async function main() {
	const email = arg('--user-email');
	if (!email) throw new Error('Pass --user-email');
	const source = arg('--source');
	if (source && !isKnowledgeSource(source)) throw new Error(`Unknown source "${source}"`);
	const limit = Number(arg('--limit') ?? 40);

	const { supabase } = await import('../src/lib/supabase');
	const db = supabase as any;
	const { data: user, error } = await db
		.from('users')
		.select('id')
		.eq('email', email)
		.maybeSingle();
	if (error || !user)
		throw new Error(`No user with that email${error ? `: ${error.message}` : ''}`);

	const started = Date.now();
	const store = new KnowledgeStore(db, user.id as string);
	const queue = await store.cleanupQueue({
		source: isKnowledgeSource(source) ? source : null
	});
	console.log(
		`${queue.remaining} to look at${source ? ` from ${source}` : ''} (${Date.now() - started} ms)`
	);
	console.log('By source:', queue.by_source);
	const withLookAlike = queue.entries.filter((entry) => entry.similar.length).length;
	console.log(
		`First batch: ${queue.entries.length} entries, ${withLookAlike} with a look-alike\n`
	);
	queue.entries.slice(0, limit).forEach((entry, index) => {
		const counts = `${entry.tasks}t ${entry.documents}d ${entry.people}p`;
		console.log(
			`${String(index + 1).padStart(3)}. ${entry.name}  [${entry.sources.join('+')}] ${counts}` +
				(entry.reasons.length ? `  — ${entry.reasons.join(' · ')}` : '')
		);
		for (const match of entry.similar)
			console.log(
				`       ≈ ${match.name} [${match.sources.join('+')}] ${match.records}r ${match.people}p  (${match.rule} ${match.score})`
			);
	});
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
