// apps/web/src/routes/api/knowledge/import/+server.ts
/**
 * POST /api/knowledge/import
 *   multipart: contacts (gzipped JSON from the browser's parser) + file_name  ← the app
 *   multipart: file, preview?=1                                              ← raw file
 *
 * Import contacts from a phone export (.vcf), LinkedIn's Connections.csv, or a Google Contacts
 * CSV. Everyone becomes a private person the caller knows; companies become organizations.
 * The app parses the file in the browser and sends only the contacts, compressed: phone exports
 * with photos easily pass Vercel's ~4.5 MB request limit as raw files. With preview=1 nothing
 * is saved: the response says what the file holds. The file text is never stored.
 */
import type { RequestHandler } from './$types';
import {
	CONTACT_FORMAT_LABELS,
	linkedInImportRow,
	parseContactFile,
	planContactImport,
	readParsedContactPayload,
	summarizeContactFile,
	type ParsedContactFile
} from '@buildos/shared-agent-ops/knowledge';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
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
	if (form.get('preview') === '1') return ApiResponse.success({ preview: true, ...summary });

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

	try {
		const store = knowledgeStoreFor(supabase, user.id);
		const stats = {
			contacts: parsed.contacts.length,
			people_created: 0,
			people_matched: 0,
			orgs: 0,
			facts_added: 0,
			facts_existing: 0,
			possible_duplicates: 0,
			problems: 0
		};
		const orgIds = new Set<string>();
		// Re-running is safe: people match on their email, phone or LinkedIn and facts dedupe.
		for (let i = 0; i < parsed.contacts.length; i += CONTACTS_PER_WRITE) {
			const contacts = parsed.contacts.slice(i, i + CONTACTS_PER_WRITE);
			if (parsed.format === 'linkedin_csv') {
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
			const batch = planContactImport(contacts, {
				format: parsed.format,
				sourceRef: 'file'
			});
			batch.sources = [
				{
					ref: 'file',
					type: 'import',
					title: fileName.slice(0, 200),
					meta: { format: parsed.format, contacts: parsed.contacts.length }
				}
			];
			const receipt = await store.record(batch, { via: 'import', runId: run.id });
			const people = receipt.entities.filter((e) => e.kind === 'person' && e.ref !== 'self');
			stats.people_created += people.filter((e) => e.matched === 'created').length;
			stats.people_matched += people.filter((e) => e.matched !== 'created').length;
			for (const e of receipt.entities) if (e.kind === 'org') orgIds.add(e.id);
			stats.facts_added += receipt.facts.added;
			stats.facts_existing += receipt.facts.existing;
			stats.possible_duplicates += receipt.merge_candidates;
			stats.problems += receipt.problems.length;
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
