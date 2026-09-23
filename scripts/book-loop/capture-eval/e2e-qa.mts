// scripts/book-loop/capture-eval/e2e-qa.mts
//
// Tasker 95: exercise chat checkpoint capture end to end against the ISOLATED QA db
// with a canned model (free): real ports, gateway writes, review staging, receipts,
// watermark, sweep and enqueue. Everything it writes is restored or deleted at the end.
// Usage (repo root): scripts/book-loop/capture-eval/e2e-qa.sh
import { readFileSync } from 'node:fs';

if (process.env.AGENTIC_GATE_DATABASE_ISOLATED !== 'true')
	throw new Error('Isolated database required');

const { supabase } = await import('../../../apps/worker/src/lib/supabase');
const { runChatCheckpointCapture } = await import(
	'../../../apps/worker/src/workers/chat/checkpoint/checkpointCapture'
);
const { createSupabaseCheckpointPorts } = await import(
	'../../../apps/worker/src/workers/chat/checkpoint/supabaseCheckpointPorts'
);
const { sweepChatCheckpoints, captureCheckpointDedupKey } = await import(
	'../../../apps/worker/src/workers/chat/checkpoint/checkpointJob'
);
const startHere = await import('../../../packages/shared-agent-ops/src/ontology/start-here');

const PROJECT = '445dd429-db93-4878-90a9-b3ab1627a9f2';
const SESSION = '0c16b8c9-380f-40bb-9c7c-6456b326803c';
const T05 = '8fa99c9d-4f22-4447-9410-485b7e913edc';

const checks: Array<[string, boolean]> = [];
const check = (name: string, ok: boolean) => {
	checks.push([name, ok]);
	console.info(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const { data: session } = await supabase
	.from('chat_sessions')
	.select('user_id, capture_watermark_at, capture_watermark_message_id')
	.eq('id', SESSION)
	.single();
const { data: doc } = await supabase
	.from('onto_documents')
	.select('id, content')
	.eq('project_id', PROJECT)
	.eq('type_key', 'document.context.project')
	.is('deleted_at', null)
	.single();
if (!session || !doc) throw new Error('fixture rows missing');
const userId = session.user_id;
// Run against the frozen fixture doc, not whatever QA holds now (other runs,
// e.g. a backfill, change it); the doc's own content is restored at the end.
const originalContent = doc.content ?? '';
const fixture = JSON.parse(
	readFileSync(new URL('./fixtures/book-loop.json', import.meta.url), 'utf8')
) as { startHere: { content: string } };
const beforeContent = fixture.startHere.content;
await supabase.from('onto_documents').update({ content: beforeContent }).eq('id', doc.id);
// An existing thinking log is updated by the capture: restore it, never delete it.
const { data: logBefore } = await supabase
	.from('onto_documents')
	.select('id, content')
	.eq('project_id', PROJECT)
	.eq('type_key', 'document.context.thinking_log')
	.is('deleted_at', null)
	.maybeSingle();
const startedAt = new Date().toISOString();
// Pending START HERE proposals the capture will supersede; restored at the end.
const { data: pendingBefore } = await supabase
	.from('agent_runs')
	.select('id, completed_at')
	.eq('project_id', PROJECT)
	.eq('status', 'proposal_ready');
const { syncInboxItemForAgentRun } = await import(
	'../../../packages/shared-agent-ops/src/inbox-index'
);
const { data: t05 } = await supabase.from('chat_messages').select('content').eq('id', T05).single();

function blockIds(content: string, heading: string): string[] {
	let next = 1;
	for (const section of startHere.readStartHereDocumentSections(content)) {
		const ids = startHere.splitStartHereSectionBlocks(section.body).map(() => `b${next++}`);
		if (section.heading === heading) return ids;
	}
	return [];
}
const canned = async ({ operation }: { operation: string }) =>
	operation === 'thinking_log'
		? {
				topic: 'Stability and anti-fragility; bridges, not defenses',
				passages: [{ message_id: T05, text: t05?.content ?? '' }]
			}
		: {
				edits: [
					{
						heading: 'Decisions',
						add: [
							{ markdown: '- **Exclusions dropped** — Not needed in the contract.' }
						],
						rationale: 'New decision.'
					},
					{
						heading: 'Open questions',
						remove: [blockIds(beforeContent, 'Open questions')[0]],
						add: [
							{
								markdown:
									'- **Theme sharpening** — Which frameworks carry the social thesis?'
							}
						],
						rationale: 'Exclusions answered.'
					}
				]
			};

let logDocId: string | null = null;
let reviewRunId: string | null = null;
try {
	await supabase
		.from('chat_sessions')
		.update({ capture_watermark_at: null, capture_watermark_message_id: null })
		.eq('id', SESSION);

	const ports = createSupabaseCheckpointPorts({ completeJson: canned as never });
	const outcome = await runChatCheckpointCapture(ports, {
		sessionId: SESSION,
		userId,
		trigger: 'manual'
	});
	check('capture ran', outcome.status === 'captured');
	const record = 'record' in outcome ? outcome.record : null;
	logDocId = record?.thinkingLog?.documentId ?? null;
	reviewRunId = record?.review?.runId ?? null;

	const { data: logDoc } = await supabase
		.from('onto_documents')
		.select('type_key, title, content')
		.eq('id', logDocId ?? '')
		.maybeSingle();
	check(
		'thinking log created as document.context.thinking_log',
		logDoc?.type_key === 'document.context.thinking_log'
	);
	check(
		'thinking log keeps the words',
		Boolean(logDoc?.content?.includes('build bridges rather than defenses'))
	);

	const { data: after } = await supabase
		.from('onto_documents')
		.select('content')
		.eq('id', doc.id)
		.single();
	const afterContent = after?.content ?? '';
	const fences = (content: string) =>
		startHere
			.findStartHereManagedRegionRanges(content)
			.map((range) => content.slice(range.from, range.to));
	check(
		'managed fences byte-identical',
		JSON.stringify(fences(afterContent)) === JSON.stringify(fences(beforeContent))
	);
	check(
		'decision added with capture date',
		/^- \*\*Exclusions dropped\*\* — .*_\(\d{4}-\d{2}-\d{2}\)_$/m.test(afterContent) &&
			afterContent !== beforeContent
	);
	check('answered question kept until review', afterContent.includes('**Exclusions field**'));
	check(
		'no duplicate headings',
		startHere.checkStartHereCaptureInvariants(beforeContent, afterContent).length === 0
	);

	const { data: run } = await supabase
		.from('agent_runs')
		.select('status, label, change_set')
		.eq('id', reviewRunId ?? '')
		.maybeSingle();
	check(
		'review proposal staged',
		run?.status === 'proposal_ready' && run.label === 'Update project START HERE'
	);

	const { data: receipt } = await supabase
		.from('chat_capture_checkpoints')
		.select('status, applied_sections, review_sections, start_here_before')
		.eq('session_id', SESSION)
		.gte('created_at', startedAt)
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	check(
		'receipt row written',
		receipt?.status === 'captured' && receipt.start_here_before === beforeContent
	);

	const { data: watermarked } = await supabase
		.from('chat_sessions')
		.select('capture_watermark_message_id')
		.eq('id', SESSION)
		.single();
	check('watermark advanced', Boolean(watermarked?.capture_watermark_message_id));

	const again = await runChatCheckpointCapture(
		createSupabaseCheckpointPorts({ completeJson: canned as never }),
		{
			sessionId: SESSION,
			userId,
			trigger: 'manual'
		}
	);
	check('second capture is a no-op', again.status === 'skipped');

	// Sweep: reset the watermark so the (idle) session is due, then expect one job.
	await supabase
		.from('chat_sessions')
		.update({
			capture_watermark_at: null,
			capture_watermark_message_id: null,
			last_message_at: new Date(Date.now() - 11 * 60 * 1000).toISOString()
		})
		.eq('id', SESSION);
	const sweep = await sweepChatCheckpoints();
	const { data: jobs } = await supabase
		.from('queue_jobs')
		.select('id, status, metadata')
		.eq('dedup_key', captureCheckpointDedupKey(SESSION))
		.in('status', ['pending', 'processing']);
	check('sweep enqueued the idle session once', sweep.enqueued >= 1 && (jobs ?? []).length === 1);
	const secondSweep = await sweepChatCheckpoints();
	const { data: jobsAfter } = await supabase
		.from('queue_jobs')
		.select('id')
		.eq('dedup_key', captureCheckpointDedupKey(SESSION))
		.in('status', ['pending', 'processing']);
	check(
		'a second sweep does not duplicate the job',
		(jobsAfter ?? []).length === 1 && secondSweep.enqueued >= 0
	);
	await supabase.from('queue_jobs').delete().eq('dedup_key', captureCheckpointDedupKey(SESSION));
} finally {
	// Restore QA state for the book dogfood loop.
	for (const run of pendingBefore ?? []) {
		const { data: restored } = await supabase
			.from('agent_runs')
			.update({ status: 'proposal_ready', error: null, completed_at: run.completed_at })
			.eq('id', run.id)
			.select('*')
			.single();
		if (restored)
			await syncInboxItemForAgentRun({ supabase, run: restored as Record<string, unknown> });
	}
	await supabase.from('onto_documents').update({ content: originalContent }).eq('id', doc.id);
	if (logBefore) {
		await supabase
			.from('onto_documents')
			.update({ content: logBefore.content })
			.eq('id', logBefore.id);
	} else if (logDocId) {
		await supabase.from('onto_documents').delete().eq('id', logDocId);
	}
	if (reviewRunId) await supabase.from('agent_runs').delete().eq('id', reviewRunId);
	await supabase
		.from('inbox_items')
		.delete()
		.eq('source_ref_id', reviewRunId ?? '00000000-0000-0000-0000-000000000000');
	await supabase
		.from('chat_capture_checkpoints')
		.delete()
		.eq('session_id', SESSION)
		.gte('created_at', startedAt);
	await supabase
		.from('chat_sessions')
		.update({
			capture_watermark_at: session.capture_watermark_at,
			capture_watermark_message_id: session.capture_watermark_message_id,
			last_message_at: '2026-09-22T19:51:47.04332+00:00'
		})
		.eq('id', SESSION);
}
const failed = checks.filter(([, ok]) => !ok).length;
console.info(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
