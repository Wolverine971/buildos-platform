// apps/web/scripts/knowledge-import-undo-e2e.mjs
//
// A phone contacts import arriving after a LinkedIn import, then its undo, through a running
// web server and the database it points at, as a real signed-in account (so row security and
// the undo function's own checks are exercised). Free: no model or search calls.
//
//   node apps/web/scripts/knowledge-import-undo-e2e.mjs [--base http://localhost:5176] [--keep]
//
// Uses the dedicated test owner from knowledge-sharing-e2e.mjs (KNOWLEDGE_E2E_OWNER_* in
// apps/web/.env, gitignored); run that script once first if the account does not exist yet.
// Every name carries a random tag, and only rows with that tag are removed afterwards.
//
// The walk: LinkedIn file (two people) → phone file preview (saves nothing) → phone import
// (same-name contact lands on the LinkedIn person, a nickname raises "same person?", a company
// name without "The" reuses the LinkedIn company, a business card becomes an organization, an
// older job is only a suggestion) → the owner edits one new person → undo (the import's own
// entries and details go; the edited person and the LinkedIn people stay) → a second undo is
// refused.

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
	readFileSync(join(here, '..', '.env'), 'utf8')
		.split('\n')
		.filter((line) => /^[A-Z0-9_]+=/.test(line))
		.map((line) => {
			const i = line.indexOf('=');
			return [line.slice(0, i), line.slice(i + 1).replace(/^["']|["']$/g, '')];
		})
);
const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:5176';
const keep = args.includes('--keep');

const admin = createClient(env.PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_KEY, {
	auth: { persistSession: false }
});

let failures = 0;
function check(label, ok, detail) {
	console.log(
		`${ok ? '✓' : '✗'} ${label}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 500)}`}`
	);
	if (!ok) failures++;
}

const email = env.KNOWLEDGE_E2E_OWNER_EMAIL;
const password = env.KNOWLEDGE_E2E_OWNER_PASSWORD;
if (!email || !password)
	throw new Error('No test owner in apps/web/.env. Run knowledge-sharing-e2e.mjs once first.');
const login = await fetch(`${base}/api/auth/login`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ email, password })
});
const userId = (await login.json().catch(() => null))?.data?.user?.id;
if (!login.ok || !userId) throw new Error(`login failed (${login.status})`);
const cookie = login.headers
	.getSetCookie()
	.map((c) => c.split(';')[0])
	.join('; ');

async function send(method, path, body) {
	// SvelteKit refuses a form post whose Origin is not the app's own.
	const response = await fetch(`${base}${path}`, {
		method,
		headers: { cookie, origin: base },
		body
	});
	const json = await response.json().catch(() => null);
	return { status: response.status, data: json?.data, error: json?.error };
}
const upload = (name, text, preview) => {
	const form = new FormData();
	form.set('file', new File([text], name));
	if (preview) form.set('preview', '1');
	return send('POST', '/api/knowledge/import', form);
};

// Letters only, so the tag reads as part of each name.
const tag = `Zq${[...randomBytes(5)].map((b) => String.fromCharCode(97 + (b % 26))).join('')}`;
const N = {
	maya: `Maya Chen${tag}`,
	michael: `Michael Smith${tag}`,
	mike: `Mike Smith${tag}`,
	jin: `Jin Park${tag}`,
	cadre: `The ${tag} Works`,
	cadreNoThe: `${tag} Works`,
	palan: `Palan${tag}`,
	oldco: `OldCo ${tag}`,
	dental: `Corner Dental ${tag}`
};

const mine = () => admin.from('knowledge_entities').select('id, kind, name, status, run_id');
async function entities() {
	const { data, error } = await mine().eq('owner_user_id', userId).ilike('name', `%${tag}%`);
	if (error) throw new Error(error.message);
	return data;
}
const byName = (rows, name) => rows.filter((row) => row.name === name);
async function facts(entityId) {
	const { data, error } = await admin
		.from('knowledge_facts')
		.select('predicate, value_text, status, object_entity_id, qualifiers, run_id')
		.eq('owner_user_id', userId)
		.eq('entity_id', entityId);
	if (error) throw new Error(error.message);
	return data;
}

let runId = null;
try {
	// --- LinkedIn first -----------------------------------------------------------------------
	const linkedin = await upload(
		'Connections.csv',
		`First Name,Last Name,URL,Email Address,Company,Position,Connected On
Maya,Chen${tag},https://www.linkedin.com/in/maya-${tag.toLowerCase()},,${N.cadre},Deployment Strategist,03 Feb 2025
Michael,Smith${tag},https://www.linkedin.com/in/michael-${tag.toLowerCase()},,${N.palan},Engineer,16 Nov 2026
`
	);
	check(
		'LinkedIn file imports two people',
		linkedin.status === 200 && linkedin.data?.people_created === 2,
		linkedin
	);

	const phone = [
		`BEGIN:VCARD\nVERSION:3.0\nN:Chen${tag};Maya;;;\nFN:${N.maya}\nORG:${N.oldco};\nTITLE:Analyst\nTEL;type=CELL:(410) 555-0101\nEND:VCARD`,
		`BEGIN:VCARD\nVERSION:3.0\nN:Smith${tag};Mike;;;\nFN:${N.mike}\nTEL;type=CELL:(410) 555-0102\nEND:VCARD`,
		`BEGIN:VCARD\nVERSION:3.0\nN:Park${tag};Jin;;;\nFN:${N.jin}\nORG:${N.cadreNoThe};\nTEL;type=CELL:(410) 555-0103\nEND:VCARD`,
		`BEGIN:VCARD\nVERSION:3.0\nN:;;;;\nFN:${N.dental}\nORG:${N.dental};\nTEL;type=WORK:(410) 555-0144\nX-ABShowAs:COMPANY\nEND:VCARD`
	].join('\n');

	// --- Preview: says what will happen, saves nothing ------------------------------------------
	const before = await entities();
	const preview = await upload('contacts.vcf', phone, true);
	check(
		'preview: 1 already here, 2 new, 1 business, 1 "same person?"',
		preview.status === 200 &&
			preview.data?.will_match === 1 &&
			preview.data?.will_create === 2 &&
			preview.data?.companies === 1 &&
			preview.data?.to_review === 1,
		preview.data
	);
	check(
		'preview names the nickname pair',
		preview.data?.review_examples?.some(
			(pair) => pair.contact === N.mike && pair.existing === N.michael
		),
		preview.data?.review_examples
	);
	check('preview saved nothing', (await entities()).length === before.length);

	// --- The import -----------------------------------------------------------------------------
	const imported = await upload('contacts.vcf', phone, false);
	runId = imported.data?.run_id ?? null;
	check(
		'import: 2 new, 1 matched, 1 to review, can be undone',
		imported.status === 200 &&
			imported.data?.people_created === 2 &&
			imported.data?.people_matched === 1 &&
			imported.data?.possible_duplicates === 1 &&
			imported.data?.undoable === true,
		imported.data
	);
	check(
		'import: the older job is a suggestion (headline + employer)',
		imported.data?.facts_suggested === 2,
		imported.data
	);

	let rows = await entities();
	const maya = byName(rows, N.maya);
	check('one Maya: the phone contact landed on the LinkedIn person', maya.length === 1, maya);
	if (!maya.length || !runId) throw new Error('The import did not run: stopping here.');
	const mayaFacts = await facts(maya[0].id);
	check(
		'Maya gained the phone number',
		mayaFacts.some((f) => f.predicate === 'phone' && f.value_text === '+14105550101')
	);
	check(
		"Maya's current headline is still LinkedIn's",
		mayaFacts.some(
			(f) =>
				f.predicate === 'headline' &&
				f.status === 'active' &&
				f.value_text === `Deployment Strategist at ${N.cadre}`
		) &&
			mayaFacts.some(
				(f) =>
					f.predicate === 'headline' &&
					f.status === 'suggested' &&
					f.value_text === `Analyst at ${N.oldco}`
			),
		mayaFacts.filter((f) => f.predicate === 'headline')
	);
	check(
		'the company without "The" reused the LinkedIn company',
		byName(rows, N.cadreNoThe).length === 0 && byName(rows, N.cadre).length === 1
	);
	check(
		'the business card is an organization, not a person',
		byName(rows, N.dental)
			.map((r) => r.kind)
			.join() === 'org',
		byName(rows, N.dental)
	);
	const mike = byName(rows, N.mike)[0];
	const michael = byName(rows, N.michael)[0];
	const { data: question } = await admin
		.from('knowledge_merge_candidates')
		.select('reason, status')
		.eq('owner_user_id', userId)
		.or(
			`and(entity_a.eq.${mike.id},entity_b.eq.${michael.id}),and(entity_a.eq.${michael.id},entity_b.eq.${mike.id})`
		);
	check(
		'Mike and Michael are a pending "same person?" question, not merged',
		question?.length === 1 && question[0].status === 'pending' && mike.status === 'active',
		question
	);

	// --- The owner uses one of the new people ---------------------------------------------------
	const jin = byName(rows, N.jin)[0];
	const note = await admin.from('knowledge_facts').insert({
		entity_id: jin.id,
		predicate: 'note',
		value_text: 'Met at the conference',
		scope: 'private',
		owner_user_id: userId,
		created_via: 'manual'
	});
	if (note.error) throw new Error(note.error.message);

	const recent = await send('GET', '/api/knowledge/import');
	const listed = recent.data?.imports?.find((item) => item.id === runId);
	check('recent imports offers Undo for the phone import', listed?.can_undo === true, listed);
	check(
		'recent imports offers no Undo for the LinkedIn import',
		recent.data?.imports?.some((item) => item.file_name === 'Connections.csv' && !item.can_undo)
	);

	// --- Undo ------------------------------------------------------------------------------------
	const undone = await send('DELETE', `/api/knowledge/import?run_id=${runId}`);
	check(
		'undo removed Mike and the two organizations it made, and kept Jin',
		undone.status === 200 &&
			undone.data?.people_removed === 1 &&
			undone.data?.orgs_removed === 2 &&
			undone.data?.kept === 1,
		undone
	);
	rows = await entities();
	check(
		'gone: Mike, the old employer, the business card',
		[N.mike, N.oldco, N.dental].every((name) => byName(rows, name).length === 0),
		rows.map((r) => r.name)
	);
	check(
		'still here: both LinkedIn people, their companies, and Jin',
		[N.maya, N.michael, N.cadre, N.palan, N.jin].every(
			(name) => byName(rows, name).length === 1
		),
		rows.map((r) => r.name)
	);
	const mayaAfter = await facts(maya[0].id);
	check(
		"Maya's card is back to LinkedIn only (no phone, no suggested job)",
		!mayaAfter.some((f) => f.run_id === runId) &&
			!mayaAfter.some((f) => f.predicate === 'phone') &&
			mayaAfter.some((f) => f.predicate === 'headline' && f.status === 'active'),
		mayaAfter
	);
	const jinAfter = await facts(jin.id);
	check(
		'Jin kept the phone number and the note',
		jinAfter.some((f) => f.predicate === 'phone') &&
			jinAfter.some((f) => f.predicate === 'note'),
		jinAfter
	);
	const again = await send('DELETE', `/api/knowledge/import?run_id=${runId}`);
	check('a second undo is refused', again.status === 400, again);
	const someoneElses = await send(
		'DELETE',
		'/api/knowledge/import?run_id=00000000-0000-4000-8000-000000000000'
	);
	check(
		"an import that isn't the caller's is not found",
		someoneElses.status === 404,
		someoneElses
	);
} finally {
	if (!keep) {
		const rows = await entities();
		if (rows.length) {
			const { error } = await admin
				.from('knowledge_entities')
				.delete()
				.eq('owner_user_id', userId)
				.in(
					'id',
					rows.map((row) => row.id)
				);
			if (error) console.log(`cleanup failed: ${error.message}`);
		}
		const left = (await entities()).length;
		console.log(left ? `cleanup left ${left} rows tagged ${tag}` : `cleaned up (${tag})`);
	} else {
		console.log(`kept rows tagged ${tag}`);
	}
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
