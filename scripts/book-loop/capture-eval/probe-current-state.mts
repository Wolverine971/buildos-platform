// scripts/book-loop/capture-eval/probe-current-state.mts
//
// Tasker 96 Finding 10 probe: replay the book-loop project's idle captures from
// the QA database through checkpoint capture in memory (no db writes) and print
// Current state before and after. On 2026-09-23 04:40 the outline chat's capture
// wrote "Blueprint: drafted", then a read-only "where are we at?" chat's capture
// overwrote it with the chat's stale "not started". Each case replays one
// capture with the START HERE it saw, its messages, and its write receipts.
// Paid unless --dry: 2 calls per case on the `fast` JSON profile (well under 1¢).
// Ask DJ before every paid run.
// Usage (repo root): scripts/book-loop/capture-eval/probe-current-state.sh [--dry] [--reps N]
if (process.env.AGENTIC_GATE_DATABASE_ISOLATED !== 'true') {
	throw new Error('Isolated database required');
}
const dry = process.argv.includes('--dry');
const repsIndex = process.argv.indexOf('--reps');
const reps = repsIndex >= 0 ? Number(process.argv[repsIndex + 1] ?? 1) : 1;
const projectId = process.env.BOOK_LOOP_PROJECT_ID ?? '445dd429-db93-4878-90a9-b3ab1627a9f2';

const { runChatCheckpointCapture } = await import(
	'../../../apps/worker/src/workers/chat/checkpoint/checkpointCapture'
);
const { createMemoryCheckpointPorts } = await import(
	'../../../apps/worker/src/workers/chat/checkpoint/memoryPorts'
);
const { createCheckpointCompleteJson } = await import(
	'../../../apps/worker/src/workers/chat/checkpoint/checkpointLlm'
);
const { savedChangesFromExecution } = await import(
	'../../../apps/worker/src/workers/chat/checkpoint/capturePrompts'
);
const { readStartHereDocumentSections } = await import(
	'../../../packages/shared-agent-ops/src/ontology/start-here'
);
const { mkdirSync, writeFileSync } = await import('node:fs');

type Row = Record<string, unknown>;
async function rest(path: string): Promise<Row[]> {
	const key = process.env.PRIVATE_SUPABASE_SERVICE_KEY!;
	const response = await fetch(`${process.env.PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
		headers: { apikey: key, Authorization: `Bearer ${key}` }
	});
	if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
	return (await response.json()) as Row[];
}

const currentState = (content: string) =>
	readStartHereDocumentSections(content).find(
		(section: { heading: string }) => section.heading.toLowerCase() === 'current state'
	)?.body ?? '(none)';

let spend = 0;
const liveJson = createCheckpointCompleteJson({
	onUsage: (event: { totalCost: number }) => {
		spend += event.totalCost;
	}
});

const [project] = await rest(`onto_projects?id=eq.${projectId}&select=id,name,created_at`);
const checkpoints = await rest(
	`chat_capture_checkpoints?project_id=eq.${projectId}&select=*&order=created_at.asc`
);
const cases = checkpoints.filter((checkpoint) => checkpoint.trigger === 'idle');
// Printed at the end: the model client logs every call, which buries per-case lines.
const lines: string[] = [];
const results: Array<Record<string, unknown>> = [];

for (const checkpoint of cases) {
	const sessionId = checkpoint.session_id as string;
	const earlier = checkpoints.filter(
		(other) =>
			other.session_id === sessionId &&
			String(other.created_at) < String(checkpoint.created_at)
	);
	const after = (earlier.at(-1)?.through_message_at as string | undefined) ?? null;
	const through = checkpoint.through_message_at as string;
	const window = `${after ? `&created_at=gt.${encodeURIComponent(after)}` : ''}&created_at=lte.${encodeURIComponent(through)}`;
	const [session] = await rest(`chat_sessions?id=eq.${sessionId}&select=id,user_id,title`);
	const messages = await rest(
		`chat_messages?session_id=eq.${sessionId}&role=in.(user,assistant)&select=id,role,content,created_at&order=created_at.asc${window}`
	);
	const receipts = await rest(
		`chat_tool_executions?session_id=eq.${sessionId}&success=eq.true&select=tool_name,tool_category,success,affected_entities,created_at&order=created_at.asc${window}`
	);
	const savedChanges = receipts.flatMap((row) =>
		savedChangesFromExecution(row).map((change: object) => ({
			...change,
			at: row.created_at as string
		}))
	);
	const before = checkpoint.start_here_before as string;
	lines.push(
		`\n=== ${sessionId.slice(0, 8)} (captured ${String(checkpoint.created_at).slice(0, 19)}): ` +
			`${messages.length} message(s), receipts: ${savedChanges.map((change: { tool: string; title: string | null }) => `${change.tool} "${change.title}"`).join('; ') || 'none'}`
	);
	lines.push(`--- Current state before\n${currentState(before)}`);
	for (let rep = 1; rep <= reps; rep++) {
		const { ports, state } = createMemoryCheckpointPorts(
			{
				timezone: 'America/New_York',
				project: {
					id: projectId,
					name: (project?.name as string) ?? null,
					created_at: (project?.created_at as string) ?? null
				},
				startHere: { id: checkpoint.start_here_document_id as string, content: before },
				thinkingLog: null,
				entities: [],
				sessions: [
					{
						id: sessionId,
						userId: session!.user_id as string,
						title: (session!.title as string) ?? null,
						messages: messages as never,
						savedChanges
					}
				]
			},
			async (params: never) => (dry ? { edits: [], passages: [] } : liveJson(params as never))
		);
		const outcome = await runChatCheckpointCapture(ports, {
			sessionId,
			userId: session!.user_id as string,
			trigger: 'idle',
			now: new Date(new Date(through).getTime() + 60_000)
		});
		const pending = state.reviews.filter((review) => review.status === 'proposal_ready').at(-1);
		const afterState = currentState(state.startHere.content);
		const skipped = 'record' in outcome ? outcome.record.skipped : [];
		lines.push(
			`--- Current state after (rep ${rep})${afterState === currentState(before) ? ' [unchanged]' : ''}\n${afterState}` +
				(skipped.length ? `\n    skipped: ${JSON.stringify(skipped)}` : '') +
				(pending ? `\n    review staged: ${pending.rationale.split('\n')[0]}` : '')
		);
		results.push({ sessionId, rep, before: currentState(before), after: afterState, skipped });
	}
}
const outDir = new URL('../../../output/book-loop/capture-eval/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const outFile = new URL(
	`probe-current-state-${new Date().toISOString().replace(/[:.]/g, '-')}${dry ? '-dry' : ''}.json`,
	outDir
);
writeFileSync(outFile, `${JSON.stringify({ spend, results }, null, '\t')}\n`);
console.info(lines.join('\n'));
console.info(
	`\nspend $${spend.toFixed(4)}${dry ? ' (dry: stub model)' : ''} · wrote ${outFile.pathname}`
);
process.exit(0);
