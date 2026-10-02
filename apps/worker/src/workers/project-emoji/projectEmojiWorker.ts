// apps/worker/src/workers/project-emoji/projectEmojiWorker.ts
//
// pick_project_emoji: gives a new project its two tile emoji. An insert trigger on
// onto_projects queues it a minute after creation (so START HERE usually exists by then),
// whatever created the project: the app, chat, or an MCP client. The project is left alone
// when it was deleted, or already has emoji (someone chose their own meanwhile). A pick that
// fails its checks twice leaves the initials; the owner can still choose in the picker.
import type { PickProjectEmojiJobMetadata, PickProjectEmojiResult } from '@buildos/shared-types';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import { supabase as defaultSupabase } from '../../lib/supabase';
import { type JsonCaller, pickProjectEmojis, projectEmojiValue } from './project-emoji';

const START_HERE_TYPE_KEY = 'document.context.project';

type Deps = {
	supabase: typeof defaultSupabase;
	llm: JsonCaller;
};

let sharedLlm: SmartLLMService | null = null;

export async function processPickProjectEmojiJob(
	job: ProcessingJob<PickProjectEmojiJobMetadata>,
	deps: Partial<Deps> = {}
): Promise<PickProjectEmojiResult> {
	const db = deps.supabase ?? defaultSupabase;
	const projectId = typeof job.data?.projectId === 'string' ? job.data.projectId : '';
	const userId = typeof job.data?.userId === 'string' ? job.data.userId : '';
	if (!projectId || !userId) throw new Error('pick_project_emoji needs projectId and userId');
	const skipped = (reason: string): PickProjectEmojiResult => ({
		success: true,
		projectId,
		outcome: 'skipped',
		reason
	});

	const { data: project, error: projectError } = await db
		.from('onto_projects')
		.select('id, name, description, deleted_at, icon_emoji')
		.eq('id', projectId)
		.maybeSingle();
	if (projectError) throw new Error(`Could not load project: ${projectError.message}`);
	if (!project || project.deleted_at) return skipped('project deleted');
	if (project.icon_emoji) return skipped('project already has emoji');

	const { data: startHere, error: startHereError } = await db
		.from('onto_documents')
		.select('content')
		.eq('project_id', projectId)
		.eq('type_key', START_HERE_TYPE_KEY)
		.is('deleted_at', null)
		.is('archived_at', null)
		.order('updated_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (startHereError) throw new Error(`Could not load START HERE: ${startHereError.message}`);

	if (job.signal.aborted) return skipped('job aborted');
	const llm = deps.llm ?? (sharedLlm ??= new SmartLLMService());
	const pick = await pickProjectEmojis(
		llm,
		{
			name: project.name,
			description: project.description,
			startHere: startHere?.content ?? null
		},
		{ userId, projectId, signal: job.signal }
	);
	if (!pick.ok) {
		await job.log(`No usable emoji after ${pick.attempts} tries: ${pick.problems.join('; ')}`);
		return { success: false, projectId, outcome: 'failed', reason: pick.problems.join('; ') };
	}
	if (job.signal.aborted) return skipped('job aborted');

	// Only fills an empty slot: never overwrites a pick, least of all the owner's own.
	const { data: written, error: writeError } = await db
		.from('onto_projects')
		.update({ icon_emoji: projectEmojiValue(pick) })
		.eq('id', projectId)
		.is('icon_emoji', null)
		.select('id');
	if (writeError) throw new Error(`Could not save emoji: ${writeError.message}`);
	if (!written?.length) return skipped('emoji set while picking');

	if (pick.notes.length) await job.log(`Checker notes: ${pick.notes.join('; ')}`);
	return { success: true, projectId, outcome: 'picked', glyphs: pick.glyphs };
}
