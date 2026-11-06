// apps/worker/scripts/backfill-document-digests.ts
//
// One-off backfill of document summaries (tasker 152) for ONE person's projects: documents
// with no description and more than a short note's worth of text get an AI summary in
// `onto_documents.digest`, the same way the 5-minute sweep writes them for new edits.
//
//   pnpm exec tsx --env-file=.env scripts/backfill-document-digests.ts --email <owner email>
//   … same … --apply      write summaries (paid: one small model call per document)
//
// Dry run (default) is free and read-only: it lists how many documents qualify and their
// input size. The write touches only `digest`, guarded by the content_hash it summarized; the
// recency guard ignores it, so "last edited" never moves.
import { DOCUMENT_CARD_TEXT_MAX_CHARS } from '@buildos/shared-agent-ops/utils/document-card';
import { supabase } from '../src/lib/supabase';
import { SmartLLMService } from '../src/lib/services/smart-llm-service';
import {
	digestDue,
	writeDocumentDigest,
	type DigestCandidate,
	type DigestClient,
	type DigestOutcome
} from '../src/workers/document-digest/documentDigest';

const apply = process.argv.includes('--apply');
const email = process.argv[process.argv.indexOf('--email') + 1];
if (!email || email.startsWith('--')) {
	console.error('Usage: --email <owner email> [--apply]');
	process.exit(2);
}
/** Same cap as the sweep's model input (documentDigest.ts). */
const INPUT_MAX_CHARS = 24_000;

async function main() {
	const { data: user } = await supabase
		.from('users')
		.select('id')
		.eq('email', email)
		.maybeSingle();
	if (!user) throw new Error(`No user with email ${email}`);
	const { data: actors } = await supabase.from('onto_actors').select('id').eq('user_id', user.id);
	const actorIds = (actors ?? []).map((actor) => actor.id);
	const { data: projects } = await supabase
		.from('onto_projects')
		.select('id, name')
		.in('created_by', actorIds)
		.is('deleted_at', null);
	const projectIds = (projects ?? []).map((project) => project.id);
	if (!projectIds.length) throw new Error('No projects owned by that person.');

	const rows: (DigestCandidate & { chars: number })[] = [];
	for (let from = 0; ; from += 200) {
		const { data, error } = await supabase
			.from('onto_documents')
			.select(
				'id, project_id, title, description, type_key, content, content_hash, digest, outline, created_by, updated_at'
			)
			.in('project_id', projectIds)
			.is('deleted_at', null)
			.is('archived_at', null)
			.order('id')
			.range(from, from + 199);
		if (error) throw new Error(error.message);
		for (const row of data ?? []) {
			const chars = (row.content ?? '').trim().length;
			const { content: _content, ...candidate } = row;
			rows.push({ ...(candidate as DigestCandidate), chars });
		}
		if (!data || data.length < 200) break;
	}
	// Not waiting for the sweep's quiet window (these documents are old), and a manual run
	// retries earlier failures right away instead of after the sweep's retry delay.
	const failedBefore = (digest: unknown) =>
		Boolean((digest as { failed_at?: unknown } | null)?.failed_at);
	const due = rows.filter(
		(row) =>
			digestDue({
				...row,
				updated_at: '2000-01-01T00:00:00Z',
				digest: failedBefore(row.digest) ? null : row.digest
			}) && row.chars > DOCUMENT_CARD_TEXT_MAX_CHARS
	);
	const inputChars = due.reduce((n, row) => n + Math.min(row.chars, INPUT_MAX_CHARS), 0);
	console.log(
		JSON.stringify(
			{
				projects: projectIds.length,
				documents: rows.length,
				toSummarize: due.length,
				inputChars,
				approxInputTokens: Math.round(inputChars / 4 + due.length * 250)
			},
			null,
			1
		)
	);
	if (!apply) {
		console.log('Dry run: nothing written. Pass --apply to write summaries (paid).');
		return;
	}
	const llm = new SmartLLMService();
	const outcomes: Record<DigestOutcome, number> = {
		written: 0,
		short: 0,
		changed: 0,
		failed: 0,
		skipped: 0
	};
	for (const [i, doc] of due.entries()) {
		const outcome = await writeDocumentDigest({
			db: supabase as unknown as DigestClient,
			llm,
			doc,
			userId: user.id
		});
		outcomes[outcome] += 1;
		if ((i + 1) % 10 === 0) console.log(`${i + 1}/${due.length}`, outcomes);
	}
	console.log(JSON.stringify(outcomes));
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
