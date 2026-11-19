// apps/worker/scripts/public-org-layer-check.ts
//
// Free live check of the public organization layer (tasker 168) against the database in .env:
//   1. promote what an owner's research confirmed on an org's own site (no model, no search);
//   2. a second account researching the same org (same domain) borrows those facts and the
//      worker skips the web search entirely: its model and search are stubs that throw, so any
//      paid call fails the check.
//   pnpm exec tsx --env-file=.env scripts/public-org-layer-check.ts <owner_user_id> <org_entity_id> <second_user_id>
import { KnowledgeStore, type KnowledgeDataClient } from '@buildos/shared-agent-ops/knowledge';
import { supabase } from '../src/lib/supabase';
import { processKnowledgeEnrichJob } from '../src/workers/knowledge/knowledgeEnrichWorker';
import {
	orgDomain,
	promoteOrgFacts,
	publicOrgFacts
} from '../src/workers/knowledge/publicOrgLayer';

async function main() {
	const [ownerId, orgId, secondId] = process.argv.slice(2);
	const db = supabase as unknown as KnowledgeDataClient;
	let failures = 0;
	const check = (label: string, ok: boolean, detail?: unknown) => {
		console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
		if (!ok) failures++;
	};

	const ownerDetail = await new KnowledgeStore(db, ownerId!).getEntity(orgId!);
	if (!ownerDetail) throw new Error('org not found');
	const domain = orgDomain(ownerDetail)!;
	const latestRun = ownerDetail.facts
		.filter((f) => f.created_via === 'enrichment' && f.run_id)
		.sort((a, b) => b.observed_at.localeCompare(a.observed_at))[0]?.run_id;
	const written = latestRun ? await promoteOrgFacts(db, ownerDetail, { runId: latestRun }) : 0;
	console.log(`promoted ${written} fact(s) for ${domain}`);
	const { data: key } = await (db as any)
		.from('knowledge_entity_keys')
		.select('entity_id')
		.eq('key_type', 'domain')
		.eq('key_value', domain)
		.eq('scope', 'public')
		.maybeSingle();
	const { data: publicFacts } = await (db as any)
		.from('knowledge_facts')
		.select('predicate, value_text')
		.eq('entity_id', key?.entity_id ?? '00000000-0000-0000-0000-000000000000');
	check('public org exists for the domain', Boolean(key?.entity_id));
	check(
		'only own-site, public-safe facts are public',
		(publicFacts ?? []).every(
			(f: { predicate: string }) => !['email', 'phone', 'note'].includes(f.predicate)
		) && (publicFacts ?? []).length > 0,
		publicFacts
	);

	// The second account's own entry for the same org, knowing only its website.
	const second = new KnowledgeStore(db, secondId!);
	const receipt = await second.record(
		{
			entities: [{ ref: 'org', kind: 'org', name: ownerDetail.entity.name }],
			facts: [{ subject: 'org', predicate: 'homepage', value: `https://${domain}` }]
		},
		{ via: 'manual' }
	);
	const secondOrg = receipt.entities[0]!.id;
	const wanted = [
		...new Set((publicFacts ?? []).map((f: { predicate: string }) => f.predicate))
	].filter((p) => p !== 'homepage') as string[];
	const lent = await publicOrgFacts(db, (await second.getEntity(secondOrg))!, wanted);
	check(
		'second account is lent the public facts',
		lent.covered.length === wanted.length,
		lent.covered
	);

	const { data: run } = await (db as any)
		.from('knowledge_runs')
		.insert({
			owner_user_id: secondId,
			run_type: 'enrichment',
			status: 'queued',
			title: 'public org layer check',
			budget_usd: 0.03,
			input: {}
		})
		.select('id')
		.single();
	await (db as any).from('knowledge_run_targets').insert({
		run_id: run.id,
		owner_user_id: secondId,
		entity_id: secondOrg,
		fields: wanted,
		status: 'queued'
	});
	const paid = () => {
		throw new Error('a paid call was made');
	};
	const result = await processKnowledgeEnrichJob(
		{
			data: { runId: run.id, userId: secondId },
			signal: new AbortController().signal
		} as never,
		{ db, llm: { getJSONResponse: paid } as never, makePort: paid as never, decider: null }
	);
	const { data: target } = await (db as any)
		.from('knowledge_run_targets')
		.select('status, summary, cost_usd, facts_added')
		.eq('run_id', run.id)
		.single();
	check(
		'research skipped the search and cost nothing',
		target?.status === 'done' && Number(target.cost_usd) === 0,
		{ result, target }
	);
	check(
		'the facts landed on the second account entry',
		(target?.facts_added ?? 0) >= wanted.length,
		target
	);
	const after = await second.getEntity(secondOrg);
	check(
		'each borrowed fact cites the org own site',
		wanted.every((p) =>
			after?.facts.some(
				(f) => f.predicate === p && f.sources.some((s) => s.url?.includes(domain))
			)
		),
		after?.facts.map((f) => [f.predicate, f.sources.map((s) => s.url)])
	);
	console.log('summary:', target?.summary);

	await second.deleteEntity(secondOrg);
	await (db as any).from('knowledge_runs').delete().eq('id', run.id);
	console.log(failures ? `${failures} failed` : 'all checks passed');
	process.exit(failures ? 1 : 0);
}

void main();
