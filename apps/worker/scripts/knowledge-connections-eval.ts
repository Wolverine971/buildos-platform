// apps/worker/scripts/knowledge-connections-eval.ts
//
// Tasker 166: run the "find connections" eval set against one user's real graph. Each
// question in knowledge-eval/connections-questions.json is the structured query_knowledge call
// a chat model should make; this sends it through the same gateway code chat and MCP use and
// prints what the model would read: the people or groups, and the notes about what is missing.
//
//   Free (SQL over the graph, no model):
//     pnpm exec tsx scripts/knowledge-connections-eval.ts --user-email <email>
//   --only <id>        one question
//   --person "<name>"  who the person question is about (default: top "across-work" answer)
//   --out FILE         also write every answer as JSON
// Reads apps/worker/.env. An answer is right when the names are right, or when the notes say
// plainly what the graph is missing (the tracker's bar); read the output, it is the scorecard.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

interface Question {
	id: string;
	asks: string;
	person?: boolean;
	args: Record<string, any>;
}

function line(row: Record<string, any>): string {
	const job = row.jobs?.[0];
	const role = job
		? `${job.title ? `${job.title} at ` : ''}${job.org}${job.former ? ' (former)' : ''}`
		: '';
	const extras = [
		row.places?.[0],
		row.email?.length ? `${row.email.length} email` : null,
		row.phone?.length ? `${row.phone.length} phone` : null,
		row.tasks || row.documents ? `${row.tasks ?? 0} tasks, ${row.documents ?? 0} docs` : null,
		row.leads_via?.length
			? `via ${row.leads_via.map((b: any) => [b.how, b.person, b.through].filter(Boolean).join(' ')).join('; ')}`
			: null,
		row.not_a_contact ? 'not a contact' : null
	].filter(Boolean);
	return `    ${row.name}${role ? ` · ${role}` : ''}${extras.length ? ` · ${extras.join(' · ')}` : ''}`;
}

async function main() {
	const email = arg('--user-email');
	if (!email) throw new Error('Pass --user-email');
	const only = arg('--only');
	const out = arg('--out');
	let person = arg('--person') ?? null;

	const { supabase } = await import('../src/lib/supabase');
	const gateway = await import('@buildos/shared-agent-ops/gateway/op-execution-gateway');
	const db = supabase as any;
	const { data: user } = await db.from('users').select('id').eq('email', email).maybeSingle();
	if (!user) throw new Error('No user with that email');

	const file = join(REPO, 'apps/worker/scripts/knowledge-eval/connections-questions.json');
	const questions = (JSON.parse(readFileSync(file, 'utf8')).questions as Question[]).filter(
		(question) => !only || question.id === only
	);
	const answers: Array<{ id: string; asks: string; args: unknown; answer: unknown; ms: number }> =
		[];

	for (const question of questions) {
		const args = structuredClone(question.args);
		if (question.person) {
			if (!person) {
				console.log(`\n■ ${question.asks}\n    skipped: no person yet (pass --person)`);
				continue;
			}
			args.start = { search: person, kinds: ['person'] };
		}
		const started = performance.now();
		let answer: Record<string, any>;
		try {
			answer = await gateway.runKnowledgeQuery(db, user.id, args);
		} catch (error) {
			answer = { error: error instanceof Error ? error.message : String(error) };
		}
		const ms = Math.round(performance.now() - started);
		answers.push({ id: question.id, asks: question.asks, args, answer, ms });

		console.log(
			`\n■ ${question.asks.replace('<person>', person ?? '<person>')}   [${question.id}, ${ms} ms]`
		);
		if (answer.error) {
			console.log(`    ERROR ${answer.error}`);
			continue;
		}
		if (answer.groups) {
			console.log(
				`    ${answer.total} people in ${answer.groups_total} group(s) by ${answer.group_by}`
			);
			for (const group of answer.groups.slice(0, 12))
				console.log(
					`    ${String(group.people).padStart(4)}  ${group.name}   (${group.sample.join(', ')})`
				);
		} else {
			console.log(`    ${answer.total} people${answer.truncated ? ' (first page)' : ''}`);
			for (const row of (answer.people ?? []).slice(0, 12)) console.log(line(row));
		}
		for (const note of answer.notes ?? []) console.log(`    note: ${note}`);
		if (answer.research_candidates?.length)
			console.log(
				`    research first: ${answer.research_candidates.map((gap: any) => `${gap.name} (${gap.people})`).join(', ')}`
			);
		// The person question is about someone real: the most-linked contact, unless one was named.
		if (question.id === 'across-work' && !person) person = answer.people?.[0]?.name ?? null;
	}

	if (out) {
		writeFileSync(
			out,
			JSON.stringify({ user: user.id, ran_at: new Date().toISOString(), answers }, null, '\t')
		);
		console.log(`\nWrote ${out}`);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
