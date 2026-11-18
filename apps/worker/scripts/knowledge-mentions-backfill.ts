// apps/worker/scripts/knowledge-mentions-backfill.ts
//
// Tasker 167: build mentions (where each person/org is named, by position) for a user's existing
// tasks and documents from their current text, starting from the links the readers made before
// mentions existed. Each link's quote is re-anchored against today's text, so a name that was
// fixed since ("Phil Valeo" → "Phillip Velayo") shows up as a correction and a name that was
// deleted shows up as a deletion. Then similar spellings filed as separate people become
// "same person?" questions. No model and no search calls: free.
//
//   Dry (default):  pnpm exec tsx scripts/knowledge-mentions-backfill.ts --user-email <email>
//                   Reads production, writes nothing, prints what would happen.
//   Live:           KNOWLEDGE_MENTIONS_LIVE=1 pnpm exec tsx scripts/knowledge-mentions-backfill.ts \
//                     --user-email <email> --live
//                   Writes mentions, folds, questions, link removals and orphan hides.
//   Options:        --record <uuid>      one task or document
//                   --names <text,...>   print every record and question touching these names
//                                        (e.g. --names phil); a rename preview for each group
//                   --kinds task,document
//                   --out <file.json>    the full report
// Reads apps/worker/.env for the service key. Needs migration 20261118200000 for --live (a dry
// run works before it: missing tables read as empty).

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
const flag = (name: string) => process.argv.includes(name);

type Link = { entity_id: string; record_kind: string; record_id: string };

/**
 * Before the migration the mentions tables don't exist: reads of them come back empty (and
 * writes are refused by the --live guard), so a dry run works today.
 */
function tolerantClient(db: any): any {
	const missing = new Set<string>();
	return {
		rpc: (...args: unknown[]) => db.rpc(...args),
		from(table: string) {
			const query = db.from(table);
			if (!['knowledge_mentions', 'knowledge_mention_reads'].includes(table)) return query;
			const wrap = (q: any): any =>
				new Proxy(q, {
					get(target, prop) {
						if (prop === 'then') {
							return (ok: any, fail: any) =>
								target.then((res: any) => {
									if (
										res?.error &&
										['42P01', 'PGRST205'].includes(res.error.code)
									) {
										if (!missing.has(table)) {
											missing.add(table);
											console.log(
												`  (${table} not in production yet: read as empty)`
											);
										}
										return ok({ data: [], error: null });
									}
									return ok(res);
								}, fail);
						}
						const value = target[prop];
						return typeof value === 'function'
							? (...args: unknown[]) => wrap(value.apply(target, args))
							: value;
					}
				});
			return wrap(query);
		}
	};
}

async function main() {
	const live = flag('--live');
	if (live && process.env.KNOWLEDGE_MENTIONS_LIVE !== '1') {
		throw new Error(
			'Live runs write to production: set KNOWLEDGE_MENTIONS_LIVE=1 after approval'
		);
	}
	const email = arg('--user-email');
	if (!email) throw new Error('Pass --user-email <email>');
	const onlyRecord = arg('--record');
	const kinds = new Set((arg('--kinds') ?? 'task,document').split(','));
	const focusNames = (arg('--names') ?? '')
		.split(',')
		.map((n) => n.trim().toLowerCase())
		.filter(Boolean);

	const { supabase } = await import('../src/lib/supabase');
	const knowledge = await import('@buildos/shared-agent-ops/knowledge');
	const { syncRecordMentions, askSimilarNames, sentenceAround, offersRename } = knowledge;
	const db = live ? (supabase as any) : tolerantClient(supabase);

	const { data: user } = await db
		.from('users')
		.select('id, name')
		.eq('email', email)
		.maybeSingle();
	if (!user) throw new Error('No user with that email');
	const userId: string = user.id;

	// Every record the user's graph links to (tasks and documents).
	const links: Link[] = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await db
			.from('knowledge_record_links')
			.select('entity_id, record_kind, record_id')
			.eq('owner_user_id', userId)
			.in('record_kind', [...kinds])
			.range(from, from + 999);
		if (error) throw new Error(error.message);
		links.push(...(data ?? []));
		if ((data ?? []).length < 1000) break;
	}
	const recordKeys = [...new Set(links.map((l) => `${l.record_kind}|${l.record_id}`))].filter(
		(key) => !onlyRecord || key.endsWith(onlyRecord)
	);
	console.log(
		`${user.name}: ${recordKeys.length} records linked (${recordKeys.filter((k) => k.startsWith('task')).length} tasks, ${recordKeys.filter((k) => k.startsWith('document')).length} docs) · ${live ? 'LIVE' : 'dry run'}`
	);

	// Texts.
	type RecordText = {
		kind: 'task' | 'document';
		id: string;
		title: string;
		projectId: string | null;
		fields: Record<string, string>;
	};
	const texts = new Map<string, RecordText>();
	const ids = (kind: string) =>
		recordKeys.filter((k) => k.startsWith(kind)).map((k) => k.split('|')[1]!);
	for (let i = 0; i < ids('task').length; i += 150) {
		const { data, error } = await db
			.from('onto_tasks')
			.select('id, project_id, title, description, deleted_at')
			.in('id', ids('task').slice(i, i + 150));
		if (error) throw new Error(error.message);
		for (const t of data ?? []) {
			if (t.deleted_at) continue;
			texts.set(`task|${t.id}`, {
				kind: 'task',
				id: t.id,
				title: t.title ?? '',
				projectId: t.project_id,
				fields: { title: t.title ?? '', description: t.description ?? '' }
			});
		}
	}
	for (let i = 0; i < ids('document').length; i += 50) {
		const { data, error } = await db
			.from('onto_documents')
			.select('id, project_id, title, content, deleted_at')
			.in('id', ids('document').slice(i, i + 50));
		if (error) throw new Error(error.message);
		for (const d of data ?? []) {
			if (d.deleted_at) continue;
			texts.set(`document|${d.id}`, {
				kind: 'document',
				id: d.id,
				title: d.title ?? 'Untitled',
				projectId: d.project_id,
				fields: { title: d.title ?? '', content: d.content ?? '' }
			});
		}
	}

	const reports: any[] = [];
	const totals = {
		records: 0,
		mentions: 0,
		moved: 0,
		edited: 0,
		deleted: 0,
		added: 0,
		corrections: 0,
		folds: 0,
		asks: 0,
		linksRemoved: 0,
		hidden: 0,
		problems: 0
	};
	const queue = [...texts.values()];
	const workers = live ? 1 : 4;
	await Promise.all(
		Array.from({ length: workers }, async () => {
			for (let item = queue.shift(); item; item = queue.shift()) {
				try {
					const report = await syncRecordMentions(
						db,
						userId,
						{
							record: {
								kind: item.kind,
								id: item.id,
								title: item.title,
								projectId: item.projectId
							},
							fields: item.fields,
							reader: [],
							readerComplete: false
						},
						{ via: 'backfill', dryRun: !live, askSimilar: false }
					);
					reports.push({ ...report, fields: item.fields });
					totals.records++;
					totals.mentions += report.mentions.filter((m) => m.status === 'active').length;
					totals.moved += report.counts.moved;
					totals.edited += report.counts.edited;
					totals.deleted += report.deleted.length;
					totals.added += report.counts.added;
					totals.corrections += report.corrections.length;
					totals.folds += report.corrections.filter((c) => c.action === 'fold').length;
					totals.asks += report.corrections.filter((c) => c.action === 'ask').length;
					totals.linksRemoved += report.linksRemoved.length;
					totals.hidden += report.hidden.length;
				} catch (error) {
					totals.problems++;
					console.log(
						`  ! ${item.kind} ${item.id}: ${error instanceof Error ? error.message : error}`
					);
				}
			}
		})
	);

	const folded = reports.flatMap((r) =>
		r.corrections.filter((c: any) => c.action === 'fold').map((c: any) => c.from.id)
	);
	const questions = await askSimilarNames(db, userId, {
		dryRun: !live,
		exclude: live ? [] : folded
	});

	console.log(
		`\nRecords ${totals.records} · tags ${totals.mentions} (seeded from old quotes + every place a linked name appears) · corrections ${totals.corrections} (fold ${totals.folds}, ask ${totals.asks}) · deleted names ${totals.deleted} · links removed ${totals.linksRemoved} · entries hidden ${totals.hidden} · problems ${totals.problems}`
	);
	for (const r of reports) {
		for (const c of r.corrections)
			console.log(
				`  correction in ${r.record.kind} “${r.record.title}”: “${c.from.name}” → “${c.to.name}” = ${c.action.toUpperCase()}${c.to.created ? ' (new entry)' : ''} — ${c.why}${c.question ? ` · asks “${c.question}”` : ''}`
			);
	}
	const touches = (name: string) => focusNames.some((f) => name.toLowerCase().includes(f));
	if (focusNames.length) {
		console.log(`\nRecords touching ${focusNames.join(', ')}:`);
		for (const r of reports) {
			const names = new Set<string>([
				...r.mentions.map((m: any) => m.name),
				...r.deleted.map((d: any) => d.name),
				...r.corrections.flatMap((c: any) => [c.from.name, c.to.name])
			]);
			if (![...names].some(touches)) continue;
			const tags = r.mentions.filter((m: any) => touches(m.name) || touches(m.text));
			console.log(`  ${r.record.kind} ${r.record.id.slice(0, 8)} “${r.record.title}”`);
			for (const m of tags)
				console.log(`    tag “${m.text}” → ${m.name} (${m.field} ${m.start}–${m.end})`);
			for (const d of r.deleted.filter((d: any) => touches(d.name)))
				console.log(`    deleted: “${d.text}” (${d.name}) no longer in the text`);
			for (const l of r.linksRemoved.filter((l: any) => touches(l.name)))
				console.log(`    link removed: ${l.name}`);
			for (const h of r.hidden.filter((h: any) => touches(h.name)))
				console.log(`    entry hidden (orphan): ${h.name}`);
		}
	}
	const shownQuestions = focusNames.length
		? questions.filter((q) => touches(q.keep.name) || touches(q.other.name))
		: questions;
	console.log(
		`\n“Same person?” questions (${questions.length} total${focusNames.length ? `, ${shownQuestions.length} shown` : ''}):`
	);
	for (const q of shownQuestions)
		console.log(
			`  ${q.question}  [${q.relation}; ${q.why}]${q.alreadyAsked ? ` (already asked: ${q.alreadyAsked})` : ''}`
		);

	// Rename preview: if every question in a group is answered "Same", which places would
	// "Update the name in N places" offer?
	if (focusNames.length) {
		const hubs = new Map<string, { name: string; members: Set<string> }>();
		for (const q of shownQuestions) {
			const hub = hubs.get(q.keep.id) ?? { name: q.keep.name, members: new Set([q.keep.id]) };
			hub.members.add(q.other.id);
			hubs.set(q.keep.id, hub);
		}
		for (const c of reports.flatMap((r) => r.corrections))
			for (const hub of hubs.values())
				if (c.to.id && hub.members.has(c.to.id)) hub.members.add(c.from.id);
		for (const hub of hubs.values()) {
			const places: string[] = [];
			for (const r of reports) {
				for (const m of r.mentions) {
					if (m.status !== 'active' || !m.entityId || !hub.members.has(m.entityId))
						continue;
					if (!offersRename(m.text, hub.name)) continue;
					const text: string = r.fields[m.field] ?? '';
					const s = sentenceAround(text, { start: m.start, end: m.end });
					const after = s.text.slice(0, s.start) + hub.name + s.text.slice(s.end);
					places.push(
						`    ${r.record.kind} “${r.record.title}” (${m.field}):\n      before: ${s.text.replace(/\n/g, ' ')}\n      after:  ${after.replace(/\n/g, ' ')}`
					);
				}
			}
			console.log(
				`\nIf the ${hub.name} questions are answered “Same”: “Update the name in ${places.length} places”${places.length ? ':' : ''}`
			);
			for (const p of places) console.log(p);
		}
	}

	const out = arg('--out');
	if (out)
		writeFileSync(
			out,
			JSON.stringify(
				{ totals, reports: reports.map(({ fields, ...r }) => r), questions },
				null,
				1
			)
		);
	if (!live)
		console.log(
			'\nDry run: nothing written. Live: KNOWLEDGE_MENTIONS_LIVE=1 … --live (after the migration).'
		);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
