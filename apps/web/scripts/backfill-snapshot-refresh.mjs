// apps/web/scripts/backfill-snapshot-refresh.mjs
//
// One-time backfill: queue `build_project_context_snapshot` for projects whose
// Start Here doc still shows the never-rendered template status
// (`**State:** Unknown` inside the managed:status region).
//
// Context: the 2026-06-24 Start Here backfill created template docs but never
// queued snapshots, leaving ~83% of managed status regions stale
// (see docs/product/activation-start-here-phase0-findings-2026-07-11.md).
//
// Usage (from apps/web):
//   node scripts/backfill-snapshot-refresh.mjs           # dry run (default): list what would queue
//   node scripts/backfill-snapshot-refresh.mjs --apply   # actually enqueue jobs
//
// Requires PUBLIC_SUPABASE_URL + PRIVATE_SUPABASE_SERVICE_KEY in apps/web/.env.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const APPLY = process.argv.includes('--apply');
const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const env = Object.fromEntries(
	readFileSync(join(webRoot, '.env'), 'utf8')
		.split('\n')
		.filter((line) => line.includes('=') && !line.trim().startsWith('#'))
		.map((line) => {
			const i = line.indexOf('=');
			return [
				line.slice(0, i).trim(),
				line
					.slice(i + 1)
					.trim()
					.replace(/^"|"$/g, '')
			];
		})
);

const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_KEY, {
	auth: { persistSession: false }
});

// 1. Find live Start Here docs whose managed status region was never rendered.
const { data: docs, error: docsError } = await supabase
	.from('onto_documents')
	.select('id, project_id, title, content')
	.eq('type_key', 'document.context.project')
	.is('deleted_at', null)
	.limit(2000);
if (docsError) throw docsError;

const stale = docs.filter(
	(doc) =>
		(doc.content || '').includes('<!-- managed:status') &&
		/\*\*State:\*\* Unknown/.test(doc.content || '')
);
const projectIds = [...new Set(stale.map((doc) => doc.project_id))];
console.log(`Stale Start Here docs: ${stale.length} across ${projectIds.length} projects`);

if (projectIds.length === 0) process.exit(0);

// 2. Skip deleted/archived projects and resolve a queue user per project.
//    onto_projects.created_by is an ACTOR id — resolve to a user via onto_actors,
//    falling back to any project member actor with a user_id.
const { data: projects, error: projectsError } = await supabase
	.from('onto_projects')
	.select('id, name, created_by, deleted_at, state_key')
	.in('id', projectIds);
if (projectsError) throw projectsError;

const liveProjects = projects.filter(
	(project) => !project.deleted_at && !['archived', 'cancelled'].includes(project.state_key)
);
const skipped = projects.length - liveProjects.length;
if (skipped > 0) console.log(`Skipping ${skipped} deleted/archived/cancelled projects`);

const actorIds = [...new Set(liveProjects.map((project) => project.created_by).filter(Boolean))];
const { data: actors, error: actorsError } = await supabase
	.from('onto_actors')
	.select('id, user_id')
	.in('id', actorIds);
if (actorsError) throw actorsError;
const actorToUser = new Map((actors || []).map((actor) => [actor.id, actor.user_id]));

async function resolveUserId(project) {
	const direct = actorToUser.get(project.created_by);
	if (direct) return direct;
	const { data: members } = await supabase
		.from('onto_project_members')
		.select('actor_id, onto_actors!inner(user_id)')
		.eq('project_id', project.id)
		.is('removed_at', null)
		.not('onto_actors.user_id', 'is', null)
		.limit(1);
	return members?.[0]?.onto_actors?.user_id ?? null;
}

// 3. Queue (or report) one snapshot job per project.
let queued = 0;
let unresolved = 0;
for (const project of liveProjects) {
	const userId = await resolveUserId(project);
	if (!userId) {
		unresolved += 1;
		console.log(`  NO USER  ${project.id}  ${project.name}`);
		continue;
	}
	if (!APPLY) {
		console.log(`  WOULD QUEUE  ${project.id}  ${project.name}`);
		queued += 1;
		continue;
	}
	const { error: queueError } = await supabase.rpc('add_queue_job', {
		p_user_id: userId,
		p_job_type: 'build_project_context_snapshot',
		p_metadata: {
			projectId: project.id,
			reason: 'start_here_backfill_refresh_2026_07_11',
			force: true
		},
		p_priority: 10,
		p_scheduled_for: new Date().toISOString(),
		p_dedup_key: `project-context-snapshot-${project.id}`
	});
	if (queueError) {
		console.log(`  QUEUE FAILED  ${project.id}  ${queueError.message}`);
	} else {
		queued += 1;
		console.log(`  QUEUED  ${project.id}  ${project.name}`);
	}
}

console.log(
	`\n${APPLY ? 'Queued' : 'Would queue'} ${queued} snapshot jobs; ${unresolved} projects had no resolvable user.` +
		(APPLY ? '' : ' Re-run with --apply to enqueue.')
);
