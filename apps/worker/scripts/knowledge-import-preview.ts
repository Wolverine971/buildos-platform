// apps/worker/scripts/knowledge-import-preview.ts
//
// What would importing this contacts file do to one user's real graph? Runs the same code the
// import dialog's preview runs (KnowledgeStore.record with dryRun + findNearMatches) and prints
// the outcome. READ-ONLY: a dry run saves nothing, and this script makes no other writes.
//
//   pnpm exec tsx scripts/knowledge-import-preview.ts --file <contacts.vcf|csv> --user-email <email>
//   --names      also list every name (who lands on an existing card, every "same person?"
//                pair, every business). Off by default: the lists are private contact data.
// Reads apps/worker/.env. LinkedIn's Connections.csv is saved by a database function with no
// dry run, so this covers phone vCards and Google CSV only.

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
	KnowledgeStore,
	findNearMatches,
	parseContactFile,
	planContactImportWithRefs,
	summarizeContactFile
} from '@buildos/shared-agent-ops/knowledge';

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
	const file = arg('--file');
	const email = arg('--user-email');
	if (!file || !email) throw new Error('Pass --file and --user-email');
	const names = process.argv.includes('--names');

	const parsed = parseContactFile(basename(file), readFileSync(file, 'utf8'));
	if (!parsed) throw new Error('Not a vCard, LinkedIn or Google contacts file');
	if (parsed.format === 'linkedin_csv') throw new Error('LinkedIn files have no dry run');
	const summary = summarizeContactFile(parsed);

	const { supabase } = await import('../src/lib/supabase');
	const db = supabase as any;
	const { data: user, error } = await db
		.from('users')
		.select('id')
		.eq('email', email)
		.maybeSingle();
	if (error || !user)
		throw new Error(`No user with that email${error ? `: ${error.message}` : ''}`);
	const store = new KnowledgeStore(db, user.id as string);

	const people = await store.listPeopleForNearMatch();
	const { batch, refs } = planContactImportWithRefs(parsed.contacts, {
		format: parsed.format,
		sourceRef: 'file'
	});
	const receipt = await store.record(batch, { via: 'import', fillOnly: true, dryRun: true });
	const byRef = new Map(receipt.entities.map((e) => [e.ref, e]));

	const matched: Array<{ contact: string; existing: string; how: string }> = [];
	const created = new Map<string, Parameters<typeof findNearMatches>[0][number]>();
	parsed.contacts.forEach((contact, i) => {
		const ref = refs[i]?.person;
		const entity = ref ? byRef.get(ref) : undefined;
		if (!entity) return;
		if (entity.matched !== 'created') {
			matched.push({ contact: contact.name, existing: entity.name, how: entity.matched });
			return;
		}
		if (created.has(entity.id)) return;
		const employer = refs[i]?.org ? byRef.get(refs[i]!.org!) : undefined;
		created.set(entity.id, {
			key: entity.id,
			name: contact.name,
			...(contact.givenName ? { givenName: contact.givenName } : {}),
			...(contact.familyName ? { familyName: contact.familyName } : {}),
			...(employer ? { employerId: employer.id } : {})
		});
	});
	const near = findNearMatches([...created.values()], people);
	const orgs = receipt.entities.filter((e) => e.kind === 'org');
	const companies = parsed.contacts.filter((c) => c.isCompany);
	const oneWord = [...created.values()].filter((c) => c.name.trim().split(/\s+/).length === 1);
	const by = <T>(rows: T[], keyOf: (row: T) => string) => {
		const out: Record<string, number> = {};
		for (const row of rows) out[keyOf(row)] = (out[keyOf(row)] ?? 0) + 1;
		return out;
	};

	console.log(
		`File: ${summary.format_label}, ${summary.contacts} contacts (${summary.skipped} skipped, no name)`
	);
	console.log(
		`  with email ${summary.with_email} · with phone ${summary.with_phone} · with company ${summary.with_company}`
	);
	console.log(`People already in the graph: ${people.length}`);
	console.log('');
	console.log(
		`Land on a person already here:   ${matched.length}  ${JSON.stringify(by(matched, (m) => m.how))}`
	);
	console.log(
		`New people:                      ${created.size}  (${oneWord.length} with a one-word name)`
	);
	console.log(`Businesses → organizations:      ${companies.length}`);
	console.log(
		`"Same person?" questions:        ${receipt.merge_candidates + near.length}  (same name ${receipt.merge_candidates}, near match ${JSON.stringify(by(near, (m) => m.rule))})`
	);
	console.log(
		`Organizations: ${orgs.filter((o) => o.matched !== 'created').length} already here, ${orgs.filter((o) => o.matched === 'created').length} new`
	);
	if (receipt.problems.length) console.log(`Problems: ${receipt.problems.length}`);
	if (!names) {
		console.log('\n(--names lists who is in each group)');
		return;
	}
	console.log('\nLand on a person already here:');
	for (const m of matched)
		console.log(
			`  ${m.contact}${m.contact === m.existing ? '' : ` → ${m.existing}`}  [${m.how}]`
		);
	console.log('\n"Same person?" questions (near matches):');
	for (const m of near) console.log(`  ${m.contactName}  ↔  ${m.existingName}  [${m.rule}]`);
	console.log('\nBusinesses:');
	for (const c of companies) console.log(`  ${c.name}`);
	console.log('\nNew people:');
	for (const c of created.values()) console.log(`  ${c.name}`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
