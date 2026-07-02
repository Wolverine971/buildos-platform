// apps/worker/src/scripts/backfillStartHereDocuments.ts
import { supabase } from '../lib/supabase';
import { ensureProjectStartHereDocument } from '@buildos/shared-agent-ops/ontology/start-here.service';

const BATCH_SIZE = 100;

async function main() {
	let offset = 0;
	let created = 0;
	let existing = 0;
	let skipped = 0;
	let failed = 0;

	for (;;) {
		const { data, error } = await supabase
			.from('onto_projects')
			.select('id, name, description, created_by')
			.in('state_key', ['planning', 'active'])
			.is('deleted_at', null)
			.is('archived_at', null)
			.order('created_at', { ascending: true })
			.range(offset, offset + BATCH_SIZE - 1);

		if (error) {
			throw error;
		}

		const projects = data ?? [];
		if (projects.length === 0) break;

		for (const project of projects) {
			if (!project.created_by) {
				failed += 1;
				console.warn(`[start-here-backfill] ${project.id}: missing created_by`);
				continue;
			}

			const result = await ensureProjectStartHereDocument({
				supabase: supabase as any,
				projectId: project.id,
				actorId: project.created_by,
				projectName: project.name,
				projectDescription: project.description
			});

			if (!result.ok) {
				failed += 1;
				console.warn(`[start-here-backfill] ${project.id}: ${result.error}`);
				continue;
			}

			if (result.skipped) {
				skipped += 1;
				console.warn(`[start-here-backfill] ${project.id}: skipped (${result.reason})`);
				continue;
			}

			if (result.created) {
				created += 1;
				console.log(
					`[start-here-backfill] created ${result.document.id} for ${project.id}`
				);
			} else {
				existing += 1;
			}
		}

		offset += projects.length;
	}

	console.log(
		`[start-here-backfill] complete: created=${created}, existing=${existing}, skipped=${skipped}, failed=${failed}`
	);
}

main().catch((error) => {
	console.error('[start-here-backfill] failed:', error);
	process.exitCode = 1;
});
