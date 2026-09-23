// scripts/book-loop/clone-book.mts
// Copies DJ's book project from the normal app database into the isolated QA database,
// owned by the QA test user, keeping every row ID. Read-only against the source.
// Usage: AGENTIC_GATE_ENV_FILE=.env.agentic-gate.local node --import tsx scripts/book-loop/clone-book.mts [projectId]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const root = fileURLToPath(new URL('../../', import.meta.url));
const projectId = process.argv[2] ?? '445dd429-db93-4878-90a9-b3ab1627a9f2';
const source = parse(readFileSync(resolve(root, 'apps/web/.env')));
const target = parse(readFileSync(resolve(root, process.env.AGENTIC_GATE_ENV_FILE!)));
if (target.AGENTIC_GATE_DATABASE_ISOLATED !== 'true') throw new Error('Target must be isolated');
if (target.PUBLIC_SUPABASE_URL === source.PUBLIC_SUPABASE_URL)
	throw new Error('Refusing to write to the source database');

type Env = Record<string, string>;
type Row = Record<string, unknown>;
async function rest(env: Env, path: string, init: RequestInit = {}) {
	const key = env.PRIVATE_SUPABASE_SERVICE_KEY;
	const response = await fetch(`${env.PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
		...init,
		headers: {
			apikey: key,
			Authorization: `Bearer ${key}`,
			'Content-Type': 'application/json',
			Prefer: 'resolution=merge-duplicates,return=minimal',
			...init.headers
		}
	});
	if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
	const text = await response.text();
	return text ? JSON.parse(text) : null;
}

// Insert rows, dropping columns the isolated schema lacks (it can trail production).
async function upsert(table: string, rows: Row[]) {
	if (!rows.length) return;
	for (;;) {
		try {
			await rest(target, table, { method: 'POST', body: JSON.stringify(rows) });
			console.info(`${table}: ${rows.length}`);
			return;
		} catch (error) {
			const text = String(error);
			const missing =
				text.match(/Could not find the '([^']+)' column/)?.[1] ??
				text.match(/Column \\"([^"\\]+)\\" is a generated column/)?.[1];
			if (!missing) throw error;
			for (const row of rows) delete row[missing];
		}
	}
}

const login = await fetch(`${target.PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
	method: 'POST',
	headers: { apikey: target.PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
	body: JSON.stringify({
		email: target.AGENTIC_TEST_USER_EMAIL,
		password: target.AGENTIC_TEST_USER_PASSWORD
	})
});
const userId = ((await login.json()) as { user: { id: string } }).user.id;
const [actor] = (await rest(target, `onto_actors?user_id=eq.${userId}&select=id`)) as Row[];
if (!actor) throw new Error('QA user has no actor; run the gate or workflow lab once first');
const actorId = actor.id as string;

const byProject = `project_id=eq.${projectId}`;
const read = (table: string, filter = byProject) =>
	rest(source, `${table}?${filter}&select=*`) as Promise<Row[]>;
const own = (rows: Row[]) =>
	rows.map((row) => ({ ...row, ...('created_by' in row ? { created_by: actorId } : {}) }));

const [project] = await read('onto_projects', `id=eq.${projectId}`);
if (!project) throw new Error('Source project not found');
await upsert('onto_projects', own([project]));
// Owner membership is created by the onto_projects insert trigger.
for (const table of [
	'onto_goals',
	'onto_plans',
	'onto_milestones',
	'onto_tasks',
	'onto_risks',
	'onto_requirements',
	'onto_documents',
	'onto_edges'
])
	await upsert(table, own(await read(table)));
console.info(`Cloned ${project.name} → QA user ${userId}`);
