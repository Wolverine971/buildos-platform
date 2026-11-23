// apps/web/src/lib/server/knowledge/contact-import.server.ts
/**
 * Helpers for POST/GET/DELETE /api/knowledge/import: reading the browser's gzipped contacts,
 * saving one slice of a phone or Google file, previewing how a file lines up with who is
 * already here, and shaping the recent-imports list. Callers pass the store in; this module
 * never opens a database client of its own.
 */
import {
	findNearMatches,
	planContactImportWithRefs,
	type ContactFileFormat,
	type ImportedContact,
	type KnowledgeStore,
	type NearMatch,
	type NearMatchPerson
} from '@buildos/shared-agent-ops/knowledge';

/** Contacts saved per write: keeps each batch well under the store's size limits. */
export const CONTACTS_PER_WRITE = 1500;

export const MAX_BYTES = 8 * 1024 * 1024;
/** Unzipped contact JSON: 10,000 contacts with notes stay well under this. */
export const MAX_CONTACTS_JSON_BYTES = 40 * 1024 * 1024;
export const UNREADABLE =
	"Couldn't read this file. Use a .vcf exported from your phone, LinkedIn's Connections.csv, or a Google Contacts CSV.";

/**
 * A run still marked `running` after this long was cut off (the route's maxDuration is 120 s):
 * it is shown and undone as a failed import.
 */
export const STALE_RUN_MS = 3 * 60 * 1000;

export async function readGzipJson(blob: Blob): Promise<unknown> {
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

export interface SavedContacts {
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
export async function saveContacts(
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
export function missingRunColumn(error: unknown): boolean {
	const text = `${error instanceof Error ? error.message : ''} ${
		error instanceof Error && error.cause ? JSON.stringify(error.cause) : ''
	}`;
	return text.includes('run_id') && /PGRST204|42703|Could not find|does not exist/.test(text);
}

export interface ContactMatchingPreview {
	will_match: number;
	will_create: number;
	to_review: number;
	review_examples: Array<{ contact: string; existing: string; reason: string }>;
}

/** How a phone or Google file lines up with who is already here. Nothing is saved. */
export async function previewContactMatching(
	store: KnowledgeStore,
	contacts: ImportedContact[],
	options: { format: ContactFileFormat; fileName: string }
): Promise<ContactMatchingPreview> {
	const people = await store.listPeopleForNearMatch();
	const matching: ContactMatchingPreview = {
		will_match: 0,
		will_create: 0,
		to_review: 0,
		review_examples: []
	};
	for (let i = 0; i < contacts.length; i += CONTACTS_PER_WRITE) {
		const saved = await saveContacts(store, contacts.slice(i, i + CONTACTS_PER_WRITE), people, {
			format: options.format,
			fileName: options.fileName,
			total: contacts.length,
			dryRun: true
		});
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
	return matching;
}

export interface ImportRunRow {
	id: string;
	status: string;
	title: string;
	input: Record<string, unknown> | null;
	stats: Record<string, unknown> | null;
	created_at: string;
	started_at?: string | null;
}

/** A run left `running` past the route's time limit: the function was cut off. */
export function isStaleRun(
	run: { status: string; started_at?: string | null },
	now = Date.now()
): boolean {
	if (run.status !== 'running' || !run.started_at) return false;
	const started = Date.parse(run.started_at);
	return Number.isFinite(started) && now - started > STALE_RUN_MS;
}

/** One row of the recent-imports list the dialog shows with an Undo next to each. */
export function toImportListItem(row: ImportRunRow) {
	return {
		id: row.id,
		title: row.title,
		file_name: typeof row.input?.file_name === 'string' ? row.input.file_name : null,
		created_at: row.created_at,
		contacts: Number(row.stats?.contacts ?? 0) || 0,
		people_created: Number(row.stats?.people_created ?? 0) || 0,
		undone: Boolean(row.stats?.undone_at),
		can_undo: row.stats?.undoable === true && !row.stats?.undone_at
	};
}
