// apps/web/src/routes/api/knowledge/import/+server.ts
/**
 * POST /api/knowledge/import
 *   multipart: contacts (gzipped JSON from the browser's parser) + file_name  ← the app
 *              + run_id: a later batch of the same LinkedIn file joins that import
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
	linkedInImportRow,
	parseContactFile,
	readParsedContactPayload,
	summarizeContactFile,
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
import {
	CONTACTS_PER_WRITE,
	MAX_BYTES,
	UNREADABLE,
	addBatchStats,
	continuableLinkedInRun,
	isStaleRun,
	missingRunColumn,
	previewContactMatching,
	readGzipJson,
	saveContacts,
	toImportListItem,
	type ImportRunRow,
	type SavedContacts
} from '$lib/server/knowledge/contact-import.server';

export const config = { maxDuration: 120 };

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
		fileName = file.name.slice(0, 200);
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
			const matching = await previewContactMatching(store, parsed.contacts, {
				format,
				fileName
			});
			return ApiResponse.success({ preview: true, ...summary, ...matching });
		} catch (error) {
			// Code and message only: Postgres detail strings can quote contact names.
			const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
			console.error('[knowledge import] preview matching failed', { code, message });
			return ApiResponse.success({ preview: true, ...summary });
		}
	}

	const supabase = knowledgeDb(locals.supabase);
	// Run rows are server-written (users can't edit cost or status); the entries themselves are
	// written with the user's own client so RLS applies.
	const runs = knowledgeDb(createAdminSupabaseClient());
	const startedAt = new Date().toISOString();
	const continueId = String(form.get('run_id') ?? '');
	// What earlier batches of this import recorded; null for a new import.
	let prior: Record<string, unknown> | null = null;
	let run: { id: string };
	if (continueId) {
		if (format !== 'linkedin_csv' || !UUID_PATTERN.test(continueId))
			return ApiResponse.badRequest('Only a LinkedIn import continues in batches.');
		const { data: existing, error } = await runs
			.from('knowledge_runs')
			.select('id, status, input, stats, created_at')
			.eq('id', continueId)
			.eq('owner_user_id', user.id)
			.eq('run_type', 'import')
			.maybeSingle();
		if (error) return ApiResponse.databaseError(error);
		const refused = continuableLinkedInRun(existing as ImportRunRow | null);
		if (refused || !existing) return ApiResponse.badRequest(refused ?? 'Import not found.');
		prior = (existing as ImportRunRow).stats ?? {};
		// started_at is this batch's start: a run is stale only when its latest batch was cut off.
		const { error: reopenError } = await runs
			.from('knowledge_runs')
			.update({ status: 'running', started_at: startedAt, finished_at: null })
			.eq('id', continueId);
		if (reopenError)
			return ApiResponse.internalError(reopenError, 'Could not continue the import');
		run = { id: continueId };
	} else {
		const { data: created, error: runError } = await runs
			.from('knowledge_runs')
			.insert({
				owner_user_id: user.id,
				run_type: 'import',
				status: 'running',
				title: `Imported ${CONTACT_FORMAT_LABELS[parsed.format]}`,
				input: { format: parsed.format, file_name: fileName },
				// Set up front so an import cut off by the time limit can still be undone.
				stats: { undoable: true },
				started_at: startedAt
			})
			.select('id')
			.single();
		if (runError || !created)
			return ApiResponse.internalError(runError, 'Could not start the import');
		run = created;
	}

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
		undoable: prior ? prior.undoable === true : true
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
				stats.undoable = false;
				await runs
					.from('knowledge_runs')
					.update({ stats: addBatchStats(prior, stats) })
					.eq('id', run.id);
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
		const { error: doneError } = await runs
			.from('knowledge_runs')
			.update({
				status: 'completed',
				stats: addBatchStats(prior, stats),
				finished_at: new Date().toISOString()
			})
			.eq('id', run.id);
		if (doneError)
			console.error('[knowledge import] could not mark the run completed', {
				run_id: run.id,
				code: doneError.code,
				message: doneError.message
			});
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
				stats: addBatchStats(prior, stats),
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

const IMPORT_RUN_COLUMNS = 'id, status, title, input, stats, created_at, started_at, finished_at';

/**
 * Recent imports, newest first: what the dialog lists with an Undo next to each. A run still
 * `running` past the time limit was cut off and is listed like a failed one.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const { data, error } = await knowledgeDb(locals.supabase)
		.from('knowledge_runs')
		.select(IMPORT_RUN_COLUMNS)
		.eq('owner_user_id', user.id)
		.eq('run_type', 'import')
		.in('status', ['completed', 'failed', 'cancelled', 'running'])
		.order('created_at', { ascending: false })
		.limit(6);
	if (error) return ApiResponse.databaseError(error);
	const now = Date.now();
	return ApiResponse.success({
		imports: ((data ?? []) as ImportRunRow[])
			.filter((row) => row.status !== 'running' || isStaleRun(row, now))
			.slice(0, 5)
			.map(toImportListItem)
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
		.select('id, status, stats, started_at')
		.eq('id', runId)
		.eq('owner_user_id', user.id)
		.eq('run_type', 'import')
		.maybeSingle();
	if (runError) return ApiResponse.databaseError(runError);
	if (!run) return ApiResponse.notFound('Import');
	const stats = (run.stats ?? {}) as Record<string, unknown>;
	// A run cut off by the time limit stays `running`; past that it is undone like a failed one.
	if (run.status === 'running' && !isStaleRun(run))
		return ApiResponse.badRequest('This import is still running. Try again in a minute.');
	if (stats.undone_at) return ApiResponse.badRequest('This import was already undone.');
	// The undo and an import batch also share a database lock; this just answers clearly.
	const { data: saving, error: savingError } = await supabase
		.from('knowledge_runs')
		.select('id, status, started_at')
		.eq('owner_user_id', user.id)
		.eq('run_type', 'import')
		.eq('status', 'running')
		.neq('id', runId)
		.limit(5);
	if (savingError) return ApiResponse.databaseError(savingError);
	if (
		((saving ?? []) as Array<{ status: string; started_at: string | null }>).some(
			(other) => !isStaleRun(other)
		)
	)
		return ApiResponse.badRequest(
			'Another import is still saving. Try again when it finishes.'
		);
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
