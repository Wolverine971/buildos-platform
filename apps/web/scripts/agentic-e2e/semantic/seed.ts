// apps/web/scripts/agentic-e2e/semantic/seed.ts
//
// Seeds the "Driftline Supply Co." Tier-1 semantic-discovery fixture under the
// demo account (same account as seed-demo-account.ts, so it never touches real
// user data). Idempotent: --reset deletes and recreates.
//
//   cd apps/web
//   pnpm exec tsx scripts/agentic-e2e/semantic/seed.ts            # create if missing
//   pnpm exec tsx scripts/agentic-e2e/semantic/seed.ts --reset    # delete + recreate
//
// Env (apps/web/.env): DEMO_USER_EMAIL, DEMO_USER_PASSWORD,
// PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY.
//
// Guardrails: only ever deletes onto_projects rows BOTH named exactly the
// fixture project AND created_by the demo user's actor.
//
// Note: seeding fires the live embed_onto_entity DB triggers, so queue jobs
// are enqueued for every entity; with the worker deployed (and OpenAI credits)
// they embed on their own. Pre-deploy, run the eval with --embed instead.

import { createCustomClient } from '@buildos/supabase-client';
import { ensureActorId } from '@buildos/shared-agent-ops';
import { instantiateProject } from '@buildos/shared-agent-ops/ontology/instantiation.service';
import dotenv from 'dotenv';
import path from 'path';
import { FIXTURE_PROJECT_NAME, fixtureSpec } from './fixture';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.PRIVATE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || 'demo-author@build-os.com';
const RESET = process.argv.includes('--reset');

if (!SUPABASE_URL || !SERVICE_KEY) {
	console.error('Missing PUBLIC_SUPABASE_URL or PRIVATE_SUPABASE_SERVICE_KEY');
	process.exit(1);
}

const admin = createCustomClient(SUPABASE_URL, SERVICE_KEY, {
	auth: { autoRefreshToken: false, persistSession: false }
});

async function findDemoUserId(): Promise<string> {
	const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
	if (error) throw new Error(`listUsers failed: ${error.message}`);
	const user = list.users.find((u) => u.email === DEMO_EMAIL);
	if (!user) {
		throw new Error(
			`Demo user ${DEMO_EMAIL} not found — run scripts/seed-demo-account.ts first to provision it.`
		);
	}
	return user.id;
}

async function main() {
	console.log(`Fixture account: ${DEMO_EMAIL}`);
	const userId = await findDemoUserId();
	const actorId = await ensureActorId(admin, userId);
	console.log(`user=${userId} actor=${actorId}`);

	const { data: existing, error: findError } = await admin
		.from('onto_projects')
		.select('id, name')
		.eq('created_by', actorId)
		.eq('name', FIXTURE_PROJECT_NAME);
	if (findError) throw new Error(`project lookup failed: ${findError.message}`);

	if (existing && existing.length > 0) {
		if (!RESET) {
			console.log(
				`Fixture already seeded (${existing.map((p) => p.id).join(', ')}). Use --reset to recreate.`
			);
			return;
		}
		for (const project of existing) {
			const { error: deleteError } = await admin
				.from('onto_projects')
				.delete()
				.eq('id', project.id)
				.eq('created_by', actorId);
			if (deleteError) throw new Error(`delete failed: ${deleteError.message}`);
			console.log(`Deleted old fixture project ${project.id}`);
		}
	}

	const { project_id } = await instantiateProject(admin, fixtureSpec(), userId, {
		activityLog: { changeSource: 'api' }
	});
	console.log(`Seeded "${FIXTURE_PROJECT_NAME}" → project ${project_id}`);
	console.log(
		`Next: pnpm exec tsx scripts/agentic-e2e/semantic/run-tier1.ts --embed  (embeds fixture + runs battery)`
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
