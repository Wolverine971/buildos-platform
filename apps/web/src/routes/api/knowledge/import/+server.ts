// apps/web/src/routes/api/knowledge/import/+server.ts
/**
 * POST /api/knowledge/import
 *   multipart: contacts (gzipped JSON from the browser's parser) + file_name  ← the app
 *   multipart: file, preview?=1                                              ← raw file
 * GET /api/knowledge/import            the caller's recent imports (for "Undo")
 * DELETE /api/knowledge/import?run_id= undo one import
 *
 * Import contacts from a phone export (.vcf), LinkedIn's Connections.csv, or a Google Contacts
 * CSV. Everyone becomes a private person the caller knows; companies become organizations, and
 * a business card (dentist, bank) becomes an organization of its own.
 * The app parses the file in the browser and sends only the contacts, compressed: phone exports
 * with photos easily pass Vercel's ~4.5 MB request limit as raw files. With preview=1 nothing
 * is saved: the response says what the file holds and, for phone and Google files, how it
 * lines up with who is already here. The file text is never stored.
 *
 * Phone and Google imports are careful with what is already here: a contact lands on an
 * existing person only on the exact name or a shared email, phone or LinkedIn link; a near
 * miss ("Mike Smith" / "Michael Smith") becomes a "same person?" question; a job title or
 * employer that disagrees with one already on record is saved as a suggestion.
 */
import type { RequestHandler } from './$types';
import {
	CONTACT_FORMAT_LABELS,
	findNearMatches,
	linkedInImportRow,
	parseContactFile,
	planContactImportWithRefs,
	readParsedContactPayload,
	summarizeContactFile,
	type ContactFileFormat,
	type ImportedContact,
	type KnowledgeStore,
	type NearMatch,
	type NearMatchPerson,
	type ParsedContactFile
} from '@buildos/shared-agent-ops/knowledge';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	UUID_PATTERN,
	knowledgeErrorResponse,
	knowledgeStoreFor,
	knowledgeDb
} from '$lib/server/knowledge/knowledge.server';

export const config = { maxDuration: 120 };

/** Contacts saved per write: keeps each batch well under the store's size limits. */
const CONTACTS_PER_WRITE = 1500;

const MAX_BYTES = 8 * 1024 * 1024;
/** Unzipped contact JSON: 10,000 contacts with notes stay well under this. */
const MAX_CONTACTS_JSON_BYTES = 40 * 1024 * 1024;
const UNREADABLE =
	"Couldn't read this file. Use a .vcf exported from your phone, LinkedIn's Connections.csv, or a Google Contacts CSV.";

async function readGzipJson(blob: Blob): Promise<unknown> {
	const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > MAX_CONTACTS_JSON_BYTES) {
			await reader.cancel();
			throw new Error('too large');
		}
		chunks.push(value);
	}
	return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
}

interface SavedContacts {
	people_created: number;
	people_matched: number;
	org_ids: string[];
	facts_added: number;
	facts_existing: number;
	facts_suggested: number;
	/** "Same person?" questions: same-name pairs from the store plus near-matching names. */
	questions: number;
	problems: number;
	near: NearMatch[];
}

/**
 * Save one slice of a phone or Google file (or, with dryRun, only work out what saving it
 * would do). `people` is everyone who was here before the import began: new contacts are
 * compared against them for near-matching names.
 */
async function saveContacts(
	store: KnowledgeStore,
	contacts: ImportedContact[],
	people: NearMatchPerson[],
	options: {
		format: ContactFileFormat;
		fileName: string;
		total: number;
		runId?: string;
		trackRun?: boolean;
		dryRun?: boolean;
	}
): Promise<SavedContacts> {
	const { batch, refs } = planContactImportWithRefs(contacts, {
		format: options.format,
		sourceRef: 'file'
	});
	batch.sources = [
		{
			ref: 'file',
			type: 'import',
			title: options.fileName.slice(0, 200),
			meta: {
				format: options.format,
				contacts: options.total,
				...(options.runId ? { run_id: options.runId } : {})
			}
		}
	];
	const receipt = await store.record(batch, {
		via: 'import',
		// A phone's address book is often older than what is already here.
		fillOnly: true,
		...(options.runId ? { runId: options.runId } : {}),
		...(options.trackRun ? { trackRun: true } : {}),
		...(options.dryRun ? { dryRun: true } : {})
	});
	const byRef = new Map(receipt.entities.map((e) => [e.ref, e]));
	const created = new Map<string, Parameters<typeof findNearMatches>[0][number]>();
	contacts.forEach((contact, i) => {
		const ref = refs[i]?.person;
		const entity = ref ? byRef.get(ref) : undefined;
		if (!entity || entity.matched !== 'created' || created.has(entity.id)) return;
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
	const asked = options.dryRun
		? near.length
		: await store.addNameQuestions(
				near.map((m) => ({ a: m.key, b: m.existingId, reason: m.reason, score: m.score }))
			);
	const peopleRows = receipt.entities.filter((e) => e.kind === 'person' && e.ref !== 'self');
	return {
		people_created: peopleRows.filter((e) => e.matched === 'created').length,
		people_matched: peopleRows.filter((e) => e.matched !== 'created').length,
		org_ids: receipt.entities.filter((e) => e.kind === 'org').map((e) => e.id),
		facts_added: receipt.facts.added,
		facts_existing: receipt.facts.existing,
		facts_suggested: receipt.facts.suggested,
		questions: receipt.merge_candidates + asked,
		problems: receipt.problems.length,
		near
	};
}

/** The run_id columns arrive with migration 20261122230000; before it, save without the stamp. */
function missingRunColumn(error: unknown): boolean {
	const text = `${error instanceof Error ? error.message : ''} ${
		error instanceof Error && error.cause ? JSON.stringify(error.cause) : ''
	}`;
	return text.includes('run_id') && /PGRST204|42703|Could not find|does not exist/.test(text);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return ApiResponse.badRequest('Upload a file');
	}
	let parsed: ParsedContactFile | null;
	let fileName: string;
	const contacts = form.get('contacts');
	const file = form.get('file');
	if (contacts instanceof Blob) {
		fileName = String(form.get('file_name') ?? 'contacts').slice(0, 200);
		try {
			parsed = readParsedContactPayload(await readGzipJson(contacts));
		} catch {
			parsed = null;
		}
	} else if (file instanceof File) {
		if (file.size > MAX_BYTES)
			return ApiResponse.badRequest(
				'That file is over 8 MB. Export fewer contacts at a time.'
			);
		fileName = file.name;
		// vCards can carry photos as base64; they're skipped by the parser but still read here.
		parsed = parseContactFile(file.name, await file.text());
	} else {
		return ApiResponse.badRequest('Upload a file');
	}
	if (!parsed) return ApiResponse.badRequest(UNREADABLE);
	if (!parsed.contacts.length) return ApiResponse.badRequest('No contacts found in that file.');

	const summary = summarizeContactFile(parsed);
	const format = parsed.format;
	if (form.get('preview') === '1') {
		if (format === 'linkedin_csv') return ApiResponse.success({ preview: true, ...summary });
		// How the file lines up with who is already here. Nothing is saved.
		try {
			const store = knowledgeStoreFor(knowledgeDb(locals.supabase), user.id);
			const people = await store.listPeopleForNearMatch();
			const matching = {
				will_match: 0,
				will_create: 0,
				to_review: 0,
				review_examples: [] as Array<{ contact: string; existing: string; reason: string }>
			};
			for (let i = 0; i < parsed.contacts.length; i += CONTACTS_PER_WRITE) {
				const saved = await saveContacts(
					store,
					parsed.contacts.slice(i, i + CONTACTS_PER_WRITE),
					people,
					{ format, fileName, total: parsed.contacts.length, dryRun: true }
				);
				matching.will_match += saved.people_matched;
				matching.will_create += saved.people_created;
				matching.to_review += saved.questions;
				for (const m of saved.near) {
					if (matching.review_examples.length >= 6) break;
					matching.review_examples.push({
						contact: m.contactName,
						existing: m.existingName,
						reason: m.reason
					});
				}
			}
			return ApiResponse.success({ preview: true, ...summary, ...matching });
		} catch (error) {
			console.error('[knowledge import] preview matching failed', error);
			return ApiResponse.success({ preview: true, ...summary });
		}
	}

	const supabase = knowledgeDb(locals.supabase);
	// Run rows are server-written (users can't edit cost or status); the entries themselves are
	// written with the user's own client so RLS applies.
	const runs = knowledgeDb(createAdminSupabaseClient());
	const { data: run, error: runError } = await runs
		.from('knowledge_runs')
		.insert({
			owner_user_id: user.id,
			run_type: 'import',
			status: 'running',
			title: `Imported ${CONTACT_FORMAT_LABELS[parsed.format]}`,
			input: { format: parsed.format, file_name: fileName.slice(0, 200) },
			started_at: new Date().toISOString()
		})
		.select('id')
		.single();
	if (runError || !run) return ApiResponse.internalError(runError, 'Could not start the import');

	const stats = {
		contacts: parsed.contacts.length,
		people_created: 0,
		people_matched: 0,
		orgs: 0,
		companies: summary.companies,
		facts_added: 0,
		facts_existing: 0,
		facts_suggested: 0,
		possible_duplicates: 0,
		problems: 0,
		// Whether this import stamped what it made, so it can be undone.
		undoable: false
	};
	try {
		const store = knowledgeStoreFor(supabase, user.id);
		const orgIds = new Set<string>();
		// Re-running is safe: people match on their email, phone or LinkedIn and facts dedupe.
		let people: NearMatchPerson[] | null = null;
		let trackRun = true;
		for (let i = 0; i < parsed.contacts.length; i += CONTACTS_PER_WRITE) {
			const contacts = parsed.contacts.slice(i, i + CONTACTS_PER_WRITE);
			if (format === 'linkedin_csv') {
				const { data, error } = await supabase.rpc('knowledge_import_linkedin', {
					p_rows: contacts.map(linkedInImportRow),
					p_file_name: fileName,
					p_run_id: run.id
				});
				if (error || !data)
					throw new Error('Could not save LinkedIn connections', { cause: error });
				stats.people_created += data.people_created;
				stats.people_matched += data.people_matched;
				stats.possible_duplicates += data.possible_duplicates;
				stats.facts_added += data.facts_added;
				stats.facts_existing += data.facts_existing;
				for (const id of data.org_ids) orgIds.add(id);
				continue;
			}
			people ??= await store.listPeopleForNearMatch();
			const options = { format, fileName, total: parsed.contacts.length, runId: run.id };
			let saved: SavedContacts;
			try {
				saved = await saveContacts(store, contacts, people, { ...options, trackRun });
			} catch (error) {
				if (!trackRun || i > 0 || !missingRunColumn(error)) throw error;
				trackRun = false;
				saved = await saveContacts(store, contacts, people, options);
			}
			stats.undoable = trackRun;
			stats.people_created += saved.people_created;
			stats.people_matched += saved.people_matched;
			for (const id of saved.org_ids) orgIds.add(id);
			stats.facts_added += saved.facts_added;
			stats.facts_existing += saved.facts_existing;
			stats.facts_suggested += saved.facts_suggested;
			stats.possible_duplicates += saved.questions;
			stats.problems += saved.problems;
		}
		stats.orgs = orgIds.size;
		await runs
			.from('knowledge_runs')
			.update({ status: 'completed', stats, finished_at: new Date().toISOString() })
			.eq('id', run.id);
		return ApiResponse.success({
			run_id: run.id,
			...summary,
			...stats,
			...(parsed.format === 'linkedin_csv' ? { org_ids: [...orgIds] } : {})
		});
	} catch (error) {
		await runs
			.from('knowledge_runs')
			.update({
				status: 'failed',
				// What was saved before it stopped can still be undone.
				stats,
				error: error instanceof Error ? error.message.slice(0, 500) : 'Import failed',
				finished_at: new Date().toISOString()
			})
			.eq('id', run.id);
		return knowledgeErrorResponse(
			error,
			"The import stopped partway. Contacts saved so far are kept; importing the same file again won't duplicate them."
		);
	}
};

const IMPORT_RUN_COLUMNS = 'id, status, title, input, stats, created_at, finished_at';

/** Recent imports, newest first: what the dialog lists with an Undo next to each. */
export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const { data, error } = await knowledgeDb(locals.supabase)
		.from('knowledge_runs')
		.select(IMPORT_RUN_COLUMNS)
		.eq('owner_user_id', user.id)
		.eq('run_type', 'import')
		.in('status', ['completed', 'failed', 'cancelled'])
		.order('created_at', { ascending: false })
		.limit(5);
	if (error) return ApiResponse.databaseError(error);
	type Row = {
		id: string;
		status: string;
		title: string;
		input: Record<string, unknown> | null;
		stats: Record<string, unknown> | null;
		created_at: string;
	};
	return ApiResponse.success({
		imports: ((data ?? []) as Row[]).map((row) => ({
			id: row.id,
			title: row.title,
			file_name: typeof row.input?.file_name === 'string' ? row.input.file_name : null,
			created_at: row.created_at,
			contacts: Number(row.stats?.contacts ?? 0) || 0,
			people_created: Number(row.stats?.people_created ?? 0) || 0,
			undone: Boolean(row.stats?.undone_at),
			can_undo: row.stats?.undoable === true && !row.stats?.undone_at
		}))
	});
};

/**
 * Undo one import: the people and organizations it created go, and the details it added to
 * people who were already here come off their cards. Entries used since the import stay.
 */
export const DELETE: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const runId = url.searchParams.get('run_id') ?? '';
	if (!UUID_PATTERN.test(runId)) return ApiResponse.badRequest('Invalid import');

	const supabase = knowledgeDb(locals.supabase);
	const { data: run, error: runError } = await supabase
		.from('knowledge_runs')
		.select('id, status, stats')
		.eq('id', runId)
		.eq('owner_user_id', user.id)
		.eq('run_type', 'import')
		.maybeSingle();
	if (runError) return ApiResponse.databaseError(runError);
	if (!run) return ApiResponse.notFound('Import');
	const stats = (run.stats ?? {}) as Record<string, unknown>;
	if (run.status === 'running')
		return ApiResponse.badRequest('This import is still running. Try again in a minute.');
	if (stats.undone_at) return ApiResponse.badRequest('This import was already undone.');
	if (stats.undoable !== true)
		return ApiResponse.badRequest(
			"This import was saved before Undo existed and can't be undone here."
		);

	const { data, error } = await supabase.rpc('knowledge_undo_import', { p_run_id: runId });
	if (error || !data) return ApiResponse.internalError(error, 'Could not undo the import');
	const receipt = data as {
		people_removed: number;
		orgs_removed: number;
		details_removed: number;
		kept: number;
	};
	// Run rows are server-written.
	await knowledgeDb(createAdminSupabaseClient())
		.from('knowledge_runs')
		.update({
			status: 'cancelled',
			stats: { ...stats, undone_at: new Date().toISOString(), undo: receipt }
		})
		.eq('id', runId)
		.eq('owner_user_id', user.id);
	return ApiResponse.success({ run_id: runId, ...receipt });
};
