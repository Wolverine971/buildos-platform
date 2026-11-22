// apps/worker/scripts/knowledge-widen-tags.ts
//
// One-off repair (2026-11-22): tags that sit on part of a name the owner already has an entry
// for ("Strategies" inside "Wayne Strategies", "Breaking" inside "Breaking Points"). Finds them
// from each tag's stored surroundings, then re-syncs just those records with the fixed tagging
// step, which grows each tag to the whole name and moves it to that entry. Fragment entries a
// reader made that are left with nothing are hidden (reversible). No model calls, no cost.
//
//   Dry (default):  pnpm exec tsx scripts/knowledge-widen-tags.ts [--user-email <email>]
//                   Reads production, prints what would change, writes nothing.
//   Live:           KNOWLEDGE_WIDEN_LIVE=1 pnpm exec tsx scripts/knowledge-widen-tags.ts --live
//
// Re-syncing a record also catches up anything else that drifted since its last successful
// read (moved tags, names that were never tagged); the dry run prints those counts too.
// Reads apps/worker/.env for the service key.

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
const flag = (name: string) => process.argv.includes(name);

type Tag = {
	owner_user_id: string;
	record_kind: 'task' | 'document';
	record_id: string;
	entity_id: string;
	text: string;
	prefix: string;
	suffix: string;
};
type Entry = { id: string; owner_user_id: string; name: string; normalized_name: string };

async function readAll<T>(build: (from: number, to: number) => PromiseLike<any>): Promise<T[]> {
	const rows: T[] = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await build(from, from + 999);
		if (error) throw new Error(error.message);
		rows.push(...((data ?? []) as T[]));
		if ((data ?? []).length < 1000) return rows;
	}
}

async function main() {
	const live = flag('--live');
	if (live && process.env.KNOWLEDGE_WIDEN_LIVE !== '1')
		throw new Error('Live runs write to production: set KNOWLEDGE_WIDEN_LIVE=1 after approval');
	const { supabase } = await import('../src/lib/supabase');
	const { addsWords, findNameSpans, normalizeKnowledgeName, syncRecordMentions } = await import(
		'@buildos/shared-agent-ops/knowledge'
	);
	const db = supabase as any;

	let owner: string | null = null;
	const email = arg('--user-email');
	if (email) {
		const { data } = await db.from('users').select('id').eq('email', email).maybeSingle();
		if (!data) throw new Error(`No user ${email}`);
		owner = data.id;
	}

	const tags = await readAll<Tag>((from, to) => {
		let q = db
			.from('knowledge_mentions')
			.select('owner_user_id, record_kind, record_id, entity_id, text, prefix, suffix')
			.eq('status', 'active')
			.eq('made_by', 'reader')
			.order('id')
			.range(from, to);
		if (owner) q = q.eq('owner_user_id', owner);
		return q;
	});
	const entries = await readAll<Entry>((from, to) => {
		let q = db
			.from('knowledge_entities')
			.select('id, owner_user_id, name, normalized_name')
			.eq('status', 'active')
			.in('kind', ['person', 'org'])
			.order('id')
			.range(from, to);
		if (owner) q = q.eq('owner_user_id', owner);
		return q;
	});
	const byOwner = new Map<string, Entry[]>();
	for (const e of entries)
		byOwner.set(e.owner_user_id, [...(byOwner.get(e.owner_user_id) ?? []), e]);

	// Records with a tag that a longer entry name, written around it, covers.
	const records = new Map<
		string,
		{ owner: string; kind: Tag['record_kind']; id: string; pairs: Set<string> }
	>();
	for (const tag of tags) {
		const key = normalizeKnowledgeName(tag.text);
		const around = `${tag.prefix}${tag.text}${tag.suffix}`;
		const start = tag.prefix.length;
		const end = start + tag.text.length;
		for (const e of byOwner.get(tag.owner_user_id) ?? []) {
			if (e.normalized_name.length <= key.length || !e.normalized_name.includes(key))
				continue;
			const covers = findNameSpans(around, e.name).some(
				(s) => s.start <= start && s.end >= end && addsWords(around, { start, end }, s)
			);
			if (!covers) continue;
			const rk = `${tag.owner_user_id}|${tag.record_kind}|${tag.record_id}`;
			const rec = records.get(rk) ?? {
				owner: tag.owner_user_id,
				kind: tag.record_kind,
				id: tag.record_id,
				pairs: new Set<string>()
			};
			rec.pairs.add(`"${tag.text}" → "${e.name}"`);
			records.set(rk, rec);
		}
	}
	const owners = new Set([...records.values()].map((r) => r.owner));
	console.log(`${owners.size} account(s) affected`);
	console.log(
		`${tags.length} reader tags, ${entries.length} entries; ${records.size} records to re-sync (${live ? 'LIVE' : 'dry run'})`
	);

	const totals = {
		widened: 0,
		moved: 0,
		added: 0,
		deleted: 0,
		linksRemoved: 0,
		hidden: 0,
		failed: 0
	};
	const hidden: string[] = [];
	for (const rec of records.values()) {
		const table = rec.kind === 'task' ? 'onto_tasks' : 'onto_documents';
		const body = rec.kind === 'task' ? 'description' : 'content';
		const { data: row } = await db
			.from(table)
			.select(`id, title, ${body}, project_id, deleted_at`)
			.eq('id', rec.id)
			.maybeSingle();
		if (!row || row.deleted_at) continue;
		try {
			const report = await syncRecordMentions(
				db,
				rec.owner,
				{
					record: {
						kind: rec.kind,
						id: rec.id,
						title: row.title ?? 'Untitled',
						projectId: row.project_id
					},
					fields: { title: row.title ?? '', [body]: row[body] ?? '' },
					reader: [],
					readerComplete: false
				},
				{ via: 'system', dryRun: !live }
			);
			totals.widened += report.counts.widened;
			totals.moved += report.counts.moved;
			totals.added += report.counts.added;
			totals.deleted += report.counts.deleted;
			totals.linksRemoved += report.linksRemoved.length;
			totals.hidden += report.hidden.length;
			hidden.push(...report.hidden.map((h) => h.name));
			console.log(
				`  ${rec.kind} ${rec.id.slice(0, 8)} “${(row.title ?? '').slice(0, 50)}”: ${[...rec.pairs].join(', ')}; widened ${report.counts.widened}` +
					(report.linksRemoved.length
						? `; unlinks ${report.linksRemoved.map((l) => l.name).join(', ')}`
						: '')
			);
		} catch (error) {
			totals.failed++;
			console.log(
				`  ${rec.kind} ${rec.id.slice(0, 8)}: FAILED ${error instanceof Error ? error.message : error}`
			);
		}
	}
	console.log('\nTotals', totals);
	if (hidden.length) console.log('Hidden (no link left):', [...new Set(hidden)].join(', '));
	if (!live)
		console.log('(dry run: nothing written; orphan hiding is only counted on a live run)');
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
