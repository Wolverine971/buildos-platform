// apps/web/scripts/backfill-task-event-metadata.ts
// Backfill task metadata on onto_events linked to tasks.

import { createCustomClient } from '@buildos/supabase-client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY =
	process.env.PRIVATE_SUPABASE_SERVICE_KEY ||
	process.env.PRIVATE_PRIVATE_SUPABASE_SERVICE_KEY ||
	process.env.SUPABASE_SERVICE_KEY;

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = Number.parseInt(process.env.BATCH_SIZE || '200', 10);

if (!SUPABASE_URL || !SERVICE_KEY) {
	console.error('Missing required environment variables');
	console.error('  PUBLIC_SUPABASE_URL:', SUPABASE_URL ? 'Set' : 'Missing');
	console.error(
		'  PRIVATE_SUPABASE_SERVICE_KEY:',
		SERVICE_KEY ? 'Set' : 'Missing (also tried PRIVATE_PRIVATE_SUPABASE_SERVICE_KEY)'
	);
	process.exit(1);
}

const supabase = createCustomClient(SUPABASE_URL, SERVICE_KEY, {
	auth: { autoRefreshToken: false, persistSession: false }
});

async function backfillTaskEventMetadata() {
	console.log('Backfilling task metadata on ontology events...');
	if (DRY_RUN) {
		console.log('DRY RUN MODE - No changes will be written');
	}

	let offset = 0;
	let updatedCount = 0;
	let skippedCount = 0;
	let missingTaskCount = 0;

	for (;;) {
		const { data: events, error } = await supabase
			.from('onto_events')
			.select('id, owner_entity_id, project_id, props')
			.eq('owner_entity_type', 'task')
			.not('owner_entity_id', 'is', null)
			.range(offset, offset + BATCH_SIZE - 1);

		if (error) {
			throw new Error(error.message);
		}

		if (!events || events.length === 0) {
			break;
		}

		const taskIds = Array.from(
			new Set(events.map((event) => event.owner_entity_id).filter(Boolean))
		) as string[];

		const { data: tasks, error: taskError } = await supabase
			.from('onto_tasks')
			.select('id, title, project_id')
			.in('id', taskIds)
			.is('deleted_at', null);

		if (taskError) {
			throw new Error(taskError.message);
		}

		const taskById = new Map((tasks ?? []).map((task) => [task.id, task]));

		for (const event of events) {
			const task = taskById.get(event.owner_entity_id as string);
			if (!task) {
				missingTaskCount += 1;
				continue;
			}

			const existingProps = (event.props as Record<string, unknown>) ?? {};
			const nextProps = {
				...existingProps,
				task_id: task.id,
				task_title: task.title ?? 'Task',
				task_link: `/projects/${task.project_id}/tasks/${task.id}`,
				project_id: task.project_id
			};

			const needsUpdate =
				existingProps.task_id !== nextProps.task_id ||
				existingProps.task_title !== nextProps.task_title ||
				existingProps.task_link !== nextProps.task_link ||
				existingProps.project_id !== nextProps.project_id;

			if (!needsUpdate) {
				skippedCount += 1;
				continue;
			}

			if (!DRY_RUN) {
				const { error: updateError } = await supabase
					.from('onto_events')
					.update({ props: nextProps, updated_at: new Date().toISOString() })
					.eq('id', event.id);

				if (updateError) {
					throw new Error(updateError.message);
				}
			}

			updatedCount += 1;
		}

		offset += BATCH_SIZE;
	}

	console.log('Backfill complete');
	console.log(`   Updated: ${updatedCount}`);
	console.log(`   Skipped: ${skippedCount}`);
	console.log(`   Missing tasks: ${missingTaskCount}`);
}

backfillTaskEventMetadata()
	.then(() => {
		console.log('Done');
	})
	.catch((error) => {
		console.error('Backfill failed:', error);
		process.exit(1);
	});
