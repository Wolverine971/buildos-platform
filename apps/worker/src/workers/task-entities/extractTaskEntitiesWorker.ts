// apps/worker/src/workers/task-entities/extractTaskEntitiesWorker.ts
//
// extract_task_entities: reads the people, places, times, phone numbers, emails and links out
// of one task's title and description and keeps onto_task_entities in step with the text
// (docs/research/task-entity-layer-2026-10-07.md). A trigger on onto_tasks queues it 15 s
// after any title or description change, whatever wrote the task.
//
//   1. Load the task. Deleted tasks, or text whose hash onto_task_entity_state already holds
//      for this extractor version, are skipped without a model call.
//   2. Ask SmartLLM's fast JSON lane (code default, with fallbacks) for entities; the answer is
//      checked by normalizeExtractedTaskEntities (every quote must be in the text, values must
//      parse), and fixed-format values the detector found are added if the model left them out.
//   3. If the text changed while the model was reading, stop: the newer text has its own job.
//   4. Merge by (kind, natural key): confirmed rows stay, dismissed rows block the same entity,
//      machine suggestions are refreshed, added or removed.
import {
	type ExtractedTaskEntity,
	type TaskEntityRecord,
	detectTaskTextEntities,
	normalizeExtractedTaskEntities,
	planTaskEntityMerge
} from '@buildos/shared-agent-ops/task-entities';
import type { JSONRequestOptions } from '@buildos/smart-llm';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import { supabase as defaultSupabase } from '../../lib/supabase';
import {
	TASK_ENTITY_EXTRACTOR_VERSION,
	TASK_ENTITY_MAX_COST_USD,
	TASK_ENTITY_MAX_TOKENS,
	TASK_ENTITY_OPERATION,
	TASK_ENTITY_SYSTEM_PROMPT,
	taskEntitySourceHash,
	taskEntityText,
	taskEntityUserPrompt
} from './task-entity-prompt';

export const EXTRACT_TASK_ENTITIES_JOB_TYPE = 'extract_task_entities';
const MAX_ATTEMPTS = 2;

export type ExtractTaskEntitiesJobData = { taskId: string; projectId: string; userId: string };

export type ExtractTaskEntitiesResult = {
	success: boolean;
	taskId: string;
	outcome: 'extracted' | 'empty' | 'skipped' | 'superseded' | 'failed';
	reason?: string;
	inserted?: number;
	updated?: number;
	removed?: number;
	costUsd?: number;
};

type JsonCaller = { getJSONResponse<T>(options: JSONRequestOptions): Promise<T> };

// onto_task_entities / onto_task_entity_state are not in the generated types until
// `pnpm gen:all` runs against a database with migration 20261007120000.
type LooseQuery = {
	select(columns: string): LooseQuery;
	eq(column: string, value: unknown): LooseQuery;
	in(column: string, values: unknown[]): LooseQuery;
	maybeSingle(): Promise<{
		data: Record<string, unknown> | null;
		error: { message: string } | null;
	}>;
	update(values: Record<string, unknown>): LooseQuery;
	delete(): LooseQuery;
	insert(values: Record<string, unknown>[]): Promise<{ error: { message: string } | null }>;
	upsert(
		values: Record<string, unknown> | Record<string, unknown>[],
		options?: { onConflict?: string; ignoreDuplicates?: boolean }
	): Promise<{ error: { message: string } | null }>;
	then: Promise<{ data: unknown; error: { message: string } | null }>['then'];
};
type LooseDb = { from(table: string): LooseQuery };

type Deps = { supabase: typeof defaultSupabase; llm: JsonCaller; now: () => Date };

let sharedLlm: SmartLLMService | null = null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readJobData(data: unknown): ExtractTaskEntitiesJobData {
	const meta = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
	const taskId = typeof meta.taskId === 'string' ? meta.taskId : '';
	const projectId = typeof meta.projectId === 'string' ? meta.projectId : '';
	const userId = typeof meta.userId === 'string' ? meta.userId : '';
	if (!UUID.test(taskId) || !UUID.test(projectId) || !UUID.test(userId)) {
		throw new Error('extract_task_entities needs taskId, projectId and userId');
	}
	return { taskId, projectId, userId };
}

function rowFor(
	entity: ExtractedTaskEntity,
	ids: { taskId: string; projectId: string },
	hash: string,
	now: string
): Record<string, unknown> {
	return {
		task_id: ids.taskId,
		project_id: ids.projectId,
		kind: entity.kind,
		natural_key: entity.naturalKey,
		value: entity.value,
		display: entity.display,
		role: entity.role,
		about: entity.about,
		quote: entity.quote,
		confidence: entity.confidence,
		source: 'llm',
		status: 'suggested',
		in_text: true,
		position: entity.position,
		data: entity.data,
		source_hash: hash,
		extractor_version: TASK_ENTITY_EXTRACTOR_VERSION,
		created_at: now,
		updated_at: now
	};
}

export async function processExtractTaskEntitiesJob(
	job: ProcessingJob,
	deps: Partial<Deps> = {}
): Promise<ExtractTaskEntitiesResult> {
	const supabase = deps.supabase ?? defaultSupabase;
	const db = supabase as unknown as LooseDb;
	const now = deps.now ?? (() => new Date());
	const { taskId, userId } = readJobData(job.data);
	const done = (
		outcome: ExtractTaskEntitiesResult['outcome'],
		extra: Partial<ExtractTaskEntitiesResult> = {}
	): ExtractTaskEntitiesResult => ({ success: outcome !== 'failed', taskId, outcome, ...extra });

	const { data: task, error: taskError } = await supabase
		.from('onto_tasks')
		.select('id, project_id, title, description, deleted_at, updated_at, created_at')
		.eq('id', taskId)
		.maybeSingle();
	if (taskError) throw new Error(`Could not load task: ${taskError.message}`);
	if (!task || task.deleted_at) return done('skipped', { reason: 'task deleted' });
	const projectId = task.project_id;
	const hash = taskEntitySourceHash(task.title, task.description);

	const { data: state, error: stateError } = await db
		.from('onto_task_entity_state')
		.select('source_hash, extractor_version, outcome')
		.eq('task_id', taskId)
		.maybeSingle();
	if (stateError) throw new Error(`Could not load entity state: ${stateError.message}`);
	// A failed read is tried again; a finished one is not repeated for the same text.
	if (
		state?.source_hash === hash &&
		state?.extractor_version === TASK_ENTITY_EXTRACTOR_VERSION &&
		state?.outcome !== 'failed'
	) {
		return done('skipped', { reason: 'text unchanged' });
	}

	const text = taskEntityText(task.title, task.description);
	const writeState = async (
		outcome: 'extracted' | 'empty' | 'failed',
		fields: { entityCount?: number; model?: string | null; error?: string | null } = {}
	) => {
		const { error } = await db.from('onto_task_entity_state').upsert(
			{
				task_id: taskId,
				project_id: projectId,
				source_hash: hash,
				extractor_version: TASK_ENTITY_EXTRACTOR_VERSION,
				outcome,
				entity_count: fields.entityCount ?? 0,
				model: fields.model ?? null,
				error: fields.error ?? null,
				extracted_at: now().toISOString()
			},
			{ onConflict: 'task_id' }
		);
		if (error) throw new Error(`Could not save entity state: ${error.message}`);
	};

	if (!text.trim()) {
		await writeState('empty');
		return done('empty', { reason: 'no text' });
	}

	// The owner's own details, matched exactly, so they never show as a contact on their own
	// tasks: the sign-in email, every connected mail and calendar account, the SMS number.
	const [{ data: owner }, { data: sms }, { data: mailAccounts }, { data: calendarAccounts }] =
		await Promise.all([
			supabase.from('users').select('name, email, timezone').eq('id', userId).maybeSingle(),
			supabase
				.from('user_sms_preferences')
				.select('phone_number')
				.eq('user_id', userId)
				.maybeSingle(),
			supabase
				.from('user_email_connections')
				.select('email_address')
				.eq('user_id', userId)
				.is('deleted_at', null),
			supabase
				.from('user_calendar_connections')
				.select('email_address')
				.eq('user_id', userId)
				.is('deleted_at', null)
		]);
	const ownerEmails = [
		owner?.email,
		...(mailAccounts ?? []).map((account) => account.email_address),
		...(calendarAccounts ?? []).map((account) => account.email_address)
	].filter((email): email is string => typeof email === 'string' && email.length > 0);
	const ownerContact = {
		name: owner?.name ?? null,
		emails: [...new Set(ownerEmails.map((email) => email.toLowerCase()))],
		phones: sms?.phone_number ? [sms.phone_number] : []
	};
	const detected = detectTaskTextEntities(text);
	const llm = deps.llm ?? (sharedLlm ??= new SmartLLMService());

	let extracted: ExtractedTaskEntity[] | null = null;
	let model: string | null = null;
	let costUsd = 0;
	let problems: string[] = [];
	const notes: string[] = [];
	for (let attempt = 1; attempt <= MAX_ATTEMPTS && !extracted; attempt++) {
		if (job.signal.aborted) return done('skipped', { reason: 'job aborted' });
		let raw: unknown;
		try {
			raw = await llm.getJSONResponse<unknown>({
				systemPrompt: TASK_ENTITY_SYSTEM_PROMPT,
				userPrompt: taskEntityUserPrompt(
					{
						title: task.title,
						description: task.description,
						writtenAt: new Date(task.updated_at ?? task.created_at),
						timezone: owner?.timezone || 'America/New_York',
						owner: ownerContact
					},
					problems
				),
				userId,
				profile: 'fast',
				temperature: 0.1,
				// Hidden reasoning off: on the 10-task live check (2026-10-07) DeepSeek V4 Flash
				// spent ~1,700 reasoning tokens and returned empty or cut-off JSON on 5 of 10.
				reasoning: { enabled: false },
				maxTokens: TASK_ENTITY_MAX_TOKENS,
				operationType: TASK_ENTITY_OPERATION,
				projectId,
				signal: job.signal,
				spendLimit: { maxCostUsd: TASK_ENTITY_MAX_COST_USD },
				onUsage: (usage) => {
					model = usage.model;
					costUsd += usage.totalCost;
				}
			});
		} catch (error) {
			notes.push(
				`try ${attempt}: ${error instanceof Error ? error.message : 'request failed'}`
			);
			problems = [];
			continue;
		}
		const list =
			raw && typeof raw === 'object' ? (raw as { entities?: unknown }).entities : undefined;
		if (!Array.isArray(list)) {
			problems = ['The answer must be a JSON object with an "entities" array.'];
			notes.push(`try ${attempt}: no entities array`);
			continue;
		}
		const checked = normalizeExtractedTaskEntities(raw, text, {
			owner: ownerContact,
			detected
		});
		if (checked.dropped.length) notes.push(`dropped: ${checked.dropped.join('; ')}`);
		extracted = checked.entities;
	}
	if (notes.length) await job.log(`Task entities ${taskId}: ${notes.join(' | ')}`);

	if (!extracted) {
		await writeState('failed', { model, error: notes.join(' | ').slice(0, 500) });
		return done('failed', { reason: notes.join(' | '), costUsd });
	}

	// The newer text has its own queued job; writing this answer would put stale chips up.
	const { data: latest, error: latestError } = await supabase
		.from('onto_tasks')
		.select('title, description, deleted_at')
		.eq('id', taskId)
		.maybeSingle();
	if (latestError) throw new Error(`Could not re-check task: ${latestError.message}`);
	if (!latest || latest.deleted_at) return done('skipped', { reason: 'task deleted', costUsd });
	if (taskEntitySourceHash(latest.title, latest.description) !== hash) {
		return done('superseded', { reason: 'text changed while reading', costUsd });
	}

	const { data: existingRows, error: existingError } = (await db
		.from('onto_task_entities')
		.select('id, kind, natural_key, status, source, quote, value, in_text')
		.eq('task_id', taskId)) as {
		data:
			| Pick<
					TaskEntityRecord,
					| 'id'
					| 'kind'
					| 'natural_key'
					| 'status'
					| 'source'
					| 'quote'
					| 'value'
					| 'in_text'
			  >[]
			| null;
		error: { message: string } | null;
	};
	if (existingError) throw new Error(`Could not load entities: ${existingError.message}`);

	const plan = planTaskEntityMerge(existingRows ?? [], extracted, text);
	const stamp = now().toISOString();

	if (plan.remove.length) {
		const { error } = await db.from('onto_task_entities').delete().in('id', plan.remove);
		if (error) throw new Error(`Could not remove entities: ${error.message}`);
	}
	for (const { id, patch } of plan.update) {
		const { error } = await db
			.from('onto_task_entities')
			.update({
				...patch,
				project_id: projectId,
				source_hash: hash,
				extractor_version: TASK_ENTITY_EXTRACTOR_VERSION,
				updated_at: stamp
			})
			.eq('id', id);
		if (error) throw new Error(`Could not update entity: ${error.message}`);
	}
	if (plan.insert.length) {
		const { error } = await db.from('onto_task_entities').upsert(
			plan.insert.map((entity) => rowFor(entity, { taskId, projectId }, hash, stamp)),
			{ onConflict: 'task_id,kind,natural_key', ignoreDuplicates: true }
		);
		if (error) throw new Error(`Could not save entities: ${error.message}`);
	}

	await writeState(extracted.length ? 'extracted' : 'empty', {
		entityCount: extracted.length,
		model
	});
	return done(extracted.length ? 'extracted' : 'empty', {
		inserted: plan.insert.length,
		updated: plan.update.length,
		removed: plan.remove.length,
		costUsd
	});
}
