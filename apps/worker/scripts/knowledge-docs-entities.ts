// apps/worker/scripts/knowledge-docs-entities.ts
//
// Tasker 165: find the people and organizations in recent documents with a free local NER model
// (src/workers/knowledge/documentNer.ts) and add them to each owner's private knowledge graph,
// linked back to the document. No model API calls, no web search: the only network use is the
// one-time model download from Hugging Face (~109 MB, cached in KNOWLEDGE_NER_CACHE_DIR or the
// OS temp dir). Re-running is safe: names land on the same entries and links deduplicate.
//
// Scope: documents created in the last 3 months (--created-since), not deleted or archived, in
// projects the owner can still open, owned by active accounts (src/lib/active-accounts.ts).
//
//   Dry (default):  pnpm exec tsx scripts/knowledge-docs-entities.ts --user-email <email>
//                   pnpm exec tsx scripts/knowledge-docs-entities.ts --all
//                   Reads production, runs the model locally, prints what would be created.
//   Live:           KNOWLEDGE_DOCS_LIVE=1 pnpm exec tsx scripts/knowledge-docs-entities.ts \
//                     --user-email <email> --live
//                   Writes to production (private entries + document links, via 'backfill').
//   Link-only:      --link-only-types <type_key,...> (default document.knowledge.research; 'none'
//                   to turn off): in those documents only names already in the graph (or kept
//                   from the owner's other documents in this run) are linked; no new entries.
//   Options:        --created-since <ISO | 3mo | 90d> (default 3mo)  --limit <docs per user>
//                   --exclude-type <type_key,...>  --include-inactive (with --user-email)
//                   --threads <n> (default 1)  --out <file.json> (full plan, for review)
// Reads apps/worker/.env for the service key.

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

type DocRow = {
	id: string;
	project_id: string;
	title: string;
	content: string | null;
	type_key: string;
	created_at: string;
};

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
	if (live && process.env.KNOWLEDGE_DOCS_LIVE !== '1') {
		throw new Error('Live runs write to production: set KNOWLEDGE_DOCS_LIVE=1 after approval');
	}
	const email = arg('--user-email');
	if (!email && !flag('--all')) throw new Error('Pass --user-email <email> or --all');

	const { supabase } = await import('../src/lib/supabase');
	const { findActiveAccounts, parseSince } = await import('../src/lib/active-accounts');
	const { KnowledgeStore } = await import('@buildos/shared-agent-ops/knowledge');
	const { normalizeKnowledgeName } = await import('@buildos/shared-agent-ops/knowledge');
	const { documentNerText } = await import('../src/workers/knowledge/documentEntityText');
	const { loadDocumentNer } = await import('../src/workers/knowledge/documentNer');
	const { pickDocumentEntities, planDocumentEntityKnowledge } = await import(
		'../src/workers/knowledge/documentEntityPlan'
	);
	const db = supabase as any;

	const since = parseSince(arg('--created-since') ?? '3mo');
	const limit = Number(arg('--limit') ?? 100_000);
	const excluded = new Set((arg('--exclude-type') ?? '').split(',').filter(Boolean));
	const linkOnlyArg = arg('--link-only-types') ?? 'document.knowledge.research';
	const linkOnly = new Set(linkOnlyArg === 'none' ? [] : linkOnlyArg.split(',').filter(Boolean));
	const threads = arg('--threads') ? Number(arg('--threads')) : undefined;

	const active = await findActiveAccounts(db);
	let userIds: string[];
	if (email) {
		const { data: user } = await db.from('users').select('id').eq('email', email).maybeSingle();
		if (!user) throw new Error('No user with that email');
		if (!active.has(user.id) && !flag('--include-inactive')) {
			console.log('That account is not active (last 30 days): nothing to read.');
			return;
		}
		userIds = [user.id];
	} else {
		userIds = [...active.keys()];
	}
	console.log(
		`${active.size} active account(s); reading documents created since ${since.toISOString().slice(0, 10)}${excluded.size ? `, skipping ${[...excluded].join(', ')}` : ''}${linkOnly.size ? `; link-only: ${[...linkOnly].join(', ')}` : ''}`
	);

	const ner = await loadDocumentNer({ threads });
	const report: unknown[] = [];
	const grand = {
		users: 0,
		docs: 0,
		chars: 0,
		ms: 0,
		kept: 0,
		distinctNew: 0,
		distinctExisting: 0
	};

	for (const userId of userIds) {
		const { data: user } = await db.from('users').select('id, name').eq('id', userId).single();
		const { data: actor } = await db
			.from('onto_actors')
			.select('id')
			.eq('user_id', userId)
			.maybeSingle();
		if (!actor) continue;

		// Projects the user can open (owner or current member), not deleted.
		const [owned, memberships] = await Promise.all([
			readAll<{ id: string; name: string }>((from, to) =>
				db
					.from('onto_projects')
					.select('id, name')
					.eq('created_by', actor.id)
					.is('deleted_at', null)
					.range(from, to)
			),
			readAll<{ project_id: string }>((from, to) =>
				db
					.from('onto_project_members')
					.select('project_id')
					.eq('actor_id', actor.id)
					.is('removed_at', null)
					.range(from, to)
			)
		]);
		const projectNames = new Map(owned.map((p) => [p.id, p.name]));
		const memberIds = memberships
			.map((m) => m.project_id)
			.filter((id) => !projectNames.has(id));
		for (let i = 0; i < memberIds.length; i += 150) {
			const { data } = await db
				.from('onto_projects')
				.select('id, name')
				.in('id', memberIds.slice(i, i + 150))
				.is('deleted_at', null);
			for (const p of data ?? []) projectNames.set(p.id, p.name);
		}

		const docs = (
			await readAll<DocRow>((from, to) =>
				db
					.from('onto_documents')
					.select('id, project_id, title, content, type_key, created_at')
					.eq('created_by', actor.id)
					.is('deleted_at', null)
					.is('archived_at', null)
					.gte('created_at', since.toISOString())
					.order('created_at', { ascending: false })
					.range(from, to)
			)
		)
			.filter((doc) => projectNames.has(doc.project_id) && !excluded.has(doc.type_key))
			.slice(0, limit)
			// The owner's own documents first, so link-only documents can link what they found.
			.sort((a, b) => Number(linkOnly.has(a.type_key)) - Number(linkOnly.has(b.type_key)));
		if (!docs.length) continue;

		// The user's graph: own name, hidden entries, existing people and orgs.
		const entities = await readAll<{
			kind: string;
			name: string;
			normalized_name: string;
			status: string;
			is_self: boolean;
		}>((from, to) =>
			db
				.from('knowledge_entities')
				.select('kind, name, normalized_name, status, is_self')
				.eq('owner_user_id', userId)
				.in('kind', ['person', 'org'])
				.range(from, to)
		);
		const existing = new Set(
			entities
				.filter((e) => e.status === 'active')
				.map((e) => `${e.kind}|${e.normalized_name}`)
		);
		const context = {
			selfNames: [user?.name ?? '', ...entities.filter((e) => e.is_self).map((e) => e.name)],
			projectNames: [...projectNames.values()],
			hiddenNames: entities.filter((e) => e.status === 'hidden').map((e) => e.name),
			knownPeople: new Set(
				entities
					.filter((e) => e.kind === 'person' && e.status === 'active' && !e.is_self)
					.map((e) => e.normalized_name)
			),
			knownNames: entities
				.filter((e) => e.status === 'active' && !e.is_self)
				.map((e) => ({ kind: e.kind as 'person' | 'org', name: e.name })),
			existing
		};
		// Names a link-only document may link: the graph plus what this run keeps elsewhere.
		const linkable = new Set(existing);

		const store = new KnowledgeStore(db, userId);
		const names = new Map<
			string,
			{ kind: string; name: string; docs: number; mentions: number }
		>();
		const dropReasons = new Map<string, number>();
		const byType = new Map<string, { docs: number; kept: number }>();
		const written = { created: 0, matched: 0, links: 0, problems: 0 };
		let ms = 0;
		let chars = 0;
		for (const doc of docs) {
			const text = documentNerText(doc.title, doc.content);
			chars += text.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
			const started = performance.now();
			const spans = await ner.extract(text.chunks);
			ms += performance.now() - started;
			const pick = pickDocumentEntities(spans, text.chunks, text.headings, context, {
				...(linkOnly.has(doc.type_key) ? { onlyExisting: linkable } : {})
			});
			for (const d of pick.dropped)
				dropReasons.set(d.reason, (dropReasons.get(d.reason) ?? 0) + 1);
			const type = byType.get(doc.type_key) ?? { docs: 0, kept: 0 };
			type.docs++;
			type.kept += pick.kept.length;
			byType.set(doc.type_key, type);
			for (const c of pick.kept) {
				const key = `${c.kind}|${normalizeKnowledgeName(c.name)}`;
				linkable.add(key);
				const entry = names.get(key) ?? {
					kind: c.kind,
					name: c.name,
					docs: 0,
					mentions: 0
				};
				entry.docs++;
				entry.mentions += c.mentions;
				names.set(key, entry);
			}
			report.push({
				user: userId,
				doc: { id: doc.id, title: doc.title, type_key: doc.type_key },
				kept: pick.kept,
				dropped: pick.dropped
			});
			if (live && pick.kept.length) {
				const receipt = await store.record(planDocumentEntityKnowledge(doc, pick.kept), {
					via: 'backfill'
				});
				written.created += receipt.entities.filter((e) => e.matched === 'created').length;
				written.matched += receipt.entities.filter((e) => e.matched !== 'created').length;
				written.links += receipt.links;
				written.problems += receipt.problems.length;
			}
		}

		const distinct = [...names.entries()];
		const fresh = distinct.filter(([key]) => !existing.has(key));
		const counts = (list: typeof distinct, kind: string) =>
			list.filter(([, v]) => v.kind === kind).length;
		grand.users++;
		grand.docs += docs.length;
		grand.chars += chars;
		grand.ms += ms;
		grand.kept += distinct.reduce((sum, [, v]) => sum + v.docs, 0);
		grand.distinctNew += fresh.length;
		grand.distinctExisting += distinct.length - fresh.length;

		console.log(`\nUser: ${user?.name ?? userId.slice(0, 8)}`);
		console.log(
			`  Documents: ${docs.length} (${Math.round(chars / 1000)}k chars, model ${(ms / 1000).toFixed(1)} s)`
		);
		console.log(
			`  Names kept: ${distinct.length} distinct (${counts(distinct, 'person')} people, ${counts(distinct, 'org')} orgs); document links: ${distinct.reduce((sum, [, v]) => sum + v.docs, 0)}`
		);
		console.log(
			`  New entries: ${fresh.length} (${counts(fresh, 'person')} people, ${counts(fresh, 'org')} orgs); already in the graph: ${distinct.length - fresh.length}`
		);
		console.log(
			`  Dropped mentions: ${[...dropReasons].map(([reason, n]) => `${reason} ${n}`).join(', ')}`
		);
		console.log(
			`  By document type: ${[...byType]
				.sort((a, b) => b[1].docs - a[1].docs)
				.map(
					([type, v]) =>
						`${type}${linkOnly.has(type) ? ' (link-only)' : ''} ${v.docs} docs → ${v.kept} names`
				)
				.join('; ')}`
		);
		const top = distinct.sort((a, b) => b[1].docs - a[1].docs || b[1].mentions - a[1].mentions);
		for (const kind of ['person', 'org']) {
			console.log(
				`  Top ${kind === 'person' ? 'people' : 'orgs'}: ${top
					.filter(([, v]) => v.kind === kind)
					.slice(0, 15)
					.map(
						([key, v]) => `${v.name} (${v.docs}d${existing.has(key) ? ', known' : ''})`
					)
					.join(', ')}`
			);
		}
		if (live) console.log('  Written:', written);
	}

	console.log(
		`\nTotal: ${grand.users} user(s), ${grand.docs} docs, ${Math.round(grand.chars / 1000)}k chars, model ${(grand.ms / 1000).toFixed(1)} s; ${grand.distinctNew} new entries, ${grand.distinctExisting} existing, ${grand.kept} document links`
	);
	const out = arg('--out');
	if (out) writeFileSync(out, JSON.stringify(report, null, 1));
	if (!live)
		console.log('Dry run: nothing written. Add --live with KNOWLEDGE_DOCS_LIVE=1 to write.');
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
