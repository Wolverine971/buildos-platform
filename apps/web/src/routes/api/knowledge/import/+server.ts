// apps/web/src/routes/api/knowledge/import/+server.ts
/**
 * POST /api/knowledge/import  (multipart: file, preview?=1)
 *
 * Import contacts from a phone export (.vcf), LinkedIn's Connections.csv, or a Google Contacts
 * CSV. Everyone becomes a private person the caller knows; companies become organizations.
 * With preview=1 nothing is saved: the response says what the file holds.
 * The file text is parsed in memory and never stored.
 */
import type { RequestHandler } from './$types';
import {
	MAX_IMPORT_CONTACTS,
	parseContactFile,
	planContactImport,
	type ContactFileFormat
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
const FORMAT_LABEL: Record<ContactFileFormat, string> = {
	vcard: 'Phone contacts (vCard)',
	linkedin_csv: 'LinkedIn connections',
	google_csv: 'Google Contacts'
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return ApiResponse.badRequest('Upload a file');
	}
	const file = form.get('file');
	if (!(file instanceof File)) return ApiResponse.badRequest('Upload a file');
	if (file.size > MAX_BYTES)
		return ApiResponse.badRequest('That file is over 8 MB. Export fewer contacts at a time.');

	// vCards can carry photos as base64; they're skipped by the parser but still read here.
	const text = await file.text();
	const parsed = parseContactFile(file.name, text);
	if (!parsed) {
		return ApiResponse.badRequest(
			"Couldn't read this file. Use a .vcf exported from your phone, LinkedIn's Connections.csv, or a Google Contacts CSV."
		);
	}
	if (!parsed.contacts.length) return ApiResponse.badRequest('No contacts found in that file.');

	const summary = {
		format: parsed.format,
		format_label: FORMAT_LABEL[parsed.format],
		contacts: parsed.contacts.length,
		skipped: parsed.skipped,
		with_email: parsed.contacts.filter((c) => c.emails.length).length,
		with_phone: parsed.contacts.filter((c) => c.phones.length).length,
		with_company: parsed.contacts.filter((c) => c.org).length,
		capped: parsed.contacts.length >= MAX_IMPORT_CONTACTS,
		sample: parsed.contacts.slice(0, 5).map((c) => ({
			name: c.name,
			detail:
				c.title && c.org
					? `${c.title} at ${c.org}`
					: (c.org ?? c.title ?? c.emails[0]?.value ?? null)
		}))
	};
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
			title: `Imported ${FORMAT_LABEL[parsed.format]}`,
			input: { format: parsed.format, file_name: file.name.slice(0, 200) },
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
			const batch = planContactImport(parsed.contacts.slice(i, i + CONTACTS_PER_WRITE), {
				format: parsed.format,
				sourceRef: 'file'
			});
			batch.sources = [
				{
					ref: 'file',
					type: 'import',
					title: file.name.slice(0, 200),
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
		return ApiResponse.success({ run_id: run.id, ...summary, ...stats });
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
