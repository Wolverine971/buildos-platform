// scripts/book-loop/capture-eval/run-eval.mts
//
// Tasker 95 capture eval: replay the frozen book-loop sessions through chat
// checkpoint capture (in memory, no db writes) and score the result.
//   - structural invariants, computed by code (free);
//   - recall / precision / fidelity against the checklist, judged by an LLM on
//     structured output (paid; skip with --no-judge).
// Paid: capture = 2 calls per checkpoint on the `fast` JSON profile (DeepSeek V4
// Flash first); judge = 1 call on the `powerful` JSON profile (Gemini 3.7 Flash
// first). About 1 cent per run. Ask DJ before every paid run (AGENTS.md).
// Usage (repo root): scripts/book-loop/capture-eval/run-eval.sh [--dry] [--no-judge] [--replay <run.json>]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

if (process.env.AGENTIC_GATE_DATABASE_ISOLATED !== 'true') {
	throw new Error('Isolated database required (usage logs land in the QA db)');
}
const dry = process.argv.includes('--dry');
// --replay <run.json>: rerun the engine on a previous run's saved model replies (free).
const replayIndex = process.argv.indexOf('--replay');
const replayFile = replayIndex >= 0 ? (process.argv[replayIndex + 1] ?? null) : null;
const judge = !dry && !replayFile && !process.argv.includes('--no-judge');
const here = new URL('./', import.meta.url);
const fixture = JSON.parse(readFileSync(new URL('fixtures/book-loop.json', here), 'utf8'));
const checklist = JSON.parse(
	readFileSync(new URL('fixtures/book-loop.checklist.json', here), 'utf8')
);

const { runChatCheckpointCapture } = await import(
	'../../../apps/worker/src/workers/chat/checkpoint/checkpointCapture'
);
const { createMemoryCheckpointPorts } = await import(
	'../../../apps/worker/src/workers/chat/checkpoint/memoryPorts'
);
const { createCheckpointCompleteJson } = await import(
	'../../../apps/worker/src/workers/chat/checkpoint/checkpointLlm'
);
const { passageFidelity } = await import(
	'../../../packages/shared-agent-ops/src/ontology/thinking-log'
);
const { SmartLLMService } = await import('../../../apps/worker/src/lib/services/smart-llm-service');
const startHere = await import('../../../packages/shared-agent-ops/src/ontology/start-here');

type Usage = { operation: string; model: string; tokens: number; cost: number };
const usage: Usage[] = [];
// Every model reply is saved per session and call, so a later run can replay it for free.
let currentSession = '';
const replies: Record<string, unknown> = {};
const replayed: Record<string, unknown> | null = replayFile
	? (JSON.parse(readFileSync(replayFile, 'utf8')).replies ?? null)
	: null;
if (replayFile && !replayed) throw new Error(`${replayFile} has no saved replies`);
const liveJson = createCheckpointCompleteJson({
	onUsage: (event) =>
		usage.push({
			operation: event.operation,
			model: event.model,
			tokens: event.totalTokens,
			cost: event.totalCost
		})
});
const completeJson: Parameters<typeof createMemoryCheckpointPorts>[1] = async (params) => {
	const key = `${currentSession}:${params.operation}`;
	const reply = replayed
		? replayed[key]
		: dry
			? { edits: [], passages: [] }
			: await liveJson(params);
	replies[key] = reply;
	return reply;
};

const { ports, state } = createMemoryCheckpointPorts(
	{
		timezone: fixture.timezone,
		project: fixture.project,
		startHere: fixture.startHere,
		thinkingLog: null,
		entities: fixture.documents
			.filter((doc: { type_key: string }) => doc.type_key !== 'document.context.project')
			.map((doc: { id: string; title: string }) => ({
				type: 'document',
				id: doc.id,
				title: doc.title
			})),
		sessions: fixture.sessions
	},
	completeJson
);

// Capture "now" = just after the last fixture message, in the fixture's day.
const lastMessageAt = fixture.sessions
	.flatMap((session: { messages: Array<{ created_at: string }> }) => session.messages)
	.map((message: { created_at: string }) => message.created_at)
	.sort()
	.at(-1);
const now = new Date(new Date(lastMessageAt).getTime() + 60_000);
const today = new Intl.DateTimeFormat('en-CA', {
	timeZone: fixture.timezone,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
}).format(now);

const checkpoints = [];
for (const session of fixture.sessions) {
	const started = Date.now();
	currentSession = session.id;
	try {
		const outcome = await runChatCheckpointCapture(ports, {
			sessionId: session.id,
			userId: session.userId,
			trigger: 'idle',
			now
		});
		checkpoints.push({
			sessionId: session.id,
			ms: Date.now() - started,
			status: outcome.status,
			record: 'record' in outcome ? outcome.record : null
		});
	} catch (error) {
		// A failed checkpoint leaves its watermark alone (the worker job would retry).
		checkpoints.push({
			sessionId: session.id,
			ms: Date.now() - started,
			status: `failed: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`,
			record: null
		});
	}
}

// --- Structural checks (free) ----------------------------------------------
const before: string = fixture.startHere.content;
const applied = state.startHere.content;
const pending = state.reviews.filter((review) => review.status === 'proposal_ready').at(-1);
const proposed = pending?.content ?? applied;
const fences = (content: string) =>
	startHere
		.findStartHereManagedRegionRanges(content)
		.map((range: { from: number; to: number }) => content.slice(range.from, range.to));
const headings = (content: string) =>
	startHere
		.readStartHereDocumentSections(content)
		.map((section: { heading: string }) => section.heading);
const known = new Set([
	`project:${fixture.project.id}`,
	...fixture.documents.map((doc: { id: string }) => `document:${doc.id}`),
	...Object.entries(fixture.entityIds as Record<string, string[]>).flatMap(([type, ids]) =>
		ids.map((id) => `${type}:${id}`)
	)
]);
const linkRefs = (content: string) =>
	[...content.matchAll(/\[\[(\w+):([\w-]+)\|[^\]]+\]\]/g)].map(
		(match) => `${match[1]}:${match[2]}`
	);
const decisionsBody = (content: string): string =>
	startHere
		.readStartHereDocumentSections(content)
		.find((section: { heading: string }) => section.heading.toLowerCase() === 'decisions')
		?.body ?? '';
const decisionStamps = (content: string) =>
	[
		...(
			startHere
				.readStartHereDocumentSections(content)
				.find(
					(section: { heading: string }) => section.heading.toLowerCase() === 'decisions'
				)?.body ?? ''
		).matchAll(/_\((\d{4}-\d{2}-\d{2})\)_/g)
	].map((match) => match[1]);
const newStamps = (content: string) => {
	const old = decisionStamps(before);
	const counts = new Map<string, number>();
	for (const stamp of old) counts.set(stamp, (counts.get(stamp) ?? 0) + 1);
	return decisionStamps(content).filter((stamp) => {
		const left = counts.get(stamp) ?? 0;
		if (left > 0) {
			counts.set(stamp, left - 1);
			return false;
		}
		return true;
	});
};
const userMessages = fixture.sessions.flatMap(
	(session: { messages: Array<{ role: string; content: string }> }) =>
		session.messages.filter((message) => message.role === 'user')
);
const logPassages = (state.thinkingLog?.content ?? '')
	.split(/^## .*$/m)
	.slice(1)
	.flatMap((entry) =>
		entry
			.split(/\n{2,}/)
			.map((paragraph) => paragraph.trim())
			.filter((paragraph) => paragraph && !/^_From /.test(paragraph))
	);
const passageScores = logPassages.map((passage) =>
	Math.max(
		...userMessages.map((message: { content: string }) =>
			passageFidelity(passage, message.content)
		)
	)
);

const structural = {
	managed_fences_intact:
		JSON.stringify(fences(applied)) === JSON.stringify(fences(before)) &&
		JSON.stringify(fences(proposed)) === JSON.stringify(fences(before)),
	no_duplicate_headings:
		startHere.checkStartHereCaptureInvariants(before, applied).length === 0 &&
		startHere.checkStartHereCaptureInvariants(applied, proposed).length === 0,
	links_valid: [applied, proposed, state.thinkingLog?.content ?? ''].every((content) =>
		linkRefs(content).every((ref) => known.has(ref))
	),
	decision_dates_are_capture_date: [applied, proposed].every((content) =>
		newStamps(content).every((stamp) => stamp === today)
	),
	new_decisions_stamped: [applied, proposed].every((content) => {
		const oldBlocks = startHere.splitStartHereSectionBlocks(decisionsBody(before));
		return startHere
			.splitStartHereSectionBlocks(decisionsBody(content))
			.filter((block: string) => !oldBlocks.includes(block))
			.every((block: string) => /^- .*_\(\d{4}-\d{2}-\d{2}\)_$/s.test(block));
	}),
	no_block_ids_leaked: [applied, proposed].every((content) => !/^\s*\[b\d+\]/m.test(content))
};
const addedHeadings = {
	applied: headings(applied).filter((heading: string) => !headings(before).includes(heading)),
	proposed: headings(proposed).filter((heading: string) => !headings(before).includes(heading))
};

// --- LLM judge (paid) -------------------------------------------------------
type JudgeReply = {
	thinking_log?: Array<{ id: string; present: boolean; in_users_words: boolean }>;
	start_here?: Array<{ id: string; applied: boolean; proposed: boolean }>;
	unsupported_claims?: Array<{ text: string; where: string }>;
};
let judgeReply: JudgeReply | null = null;
if (judge) {
	// Block-level diff per section, so the judge grades only what capture changed.
	const diffBlocks = (from: string, to: string) => {
		const fromSections = new Map(
			startHere
				.readStartHereDocumentSections(from)
				.map((section: { heading: string; body: string }) => [
					section.heading,
					section.body
				])
		);
		return startHere
			.readStartHereDocumentSections(to)
			.flatMap((section: { heading: string; body: string }) => {
				const oldBlocks = startHere.splitStartHereSectionBlocks(
					fromSections.get(section.heading) ?? ''
				);
				const newBlocks = startHere.splitStartHereSectionBlocks(section.body);
				const added = newBlocks.filter((block: string) => !oldBlocks.includes(block));
				const removed = oldBlocks.filter((block: string) => !newBlocks.includes(block));
				if (added.length === 0 && removed.length === 0) return [];
				return [
					[
						`## ${section.heading}`,
						...added.map((block: string) => `+ ${block}`),
						...removed.map((block: string) => `- ${block}`)
					].join('\n')
				];
			})
			.join('\n\n');
	};
	const llm = new SmartLLMService({
		httpReferer: 'https://build-os.com',
		appName: 'BuildOS Capture Eval Judge'
	});
	judgeReply = await llm.getJSONResponse<JudgeReply>({
		systemPrompt: `You grade a note-capture system. The user wrote chat messages; the system saved (1) a thinking log meant to keep the user's own words and (2) changes to a project summary document (START HERE): some applied now, some proposed for review.

For each checklist idea, decide:
- thinking_log.present: the thinking log contains this idea.
- thinking_log.in_users_words: it appears in the user's own wording (light cleanup is fine; a paraphrase or summary is not).
For each START HERE fact, decide:
- applied: the applied START HERE changes state it.
- proposed: the proposed-for-review changes state it.
START HERE changes are shown as a diff: "+" lines were added, "-" lines were removed. Then list unsupported_claims: added ("+") statements that the user never said or agreed to (invented facts, decisions the user did not make, the assistant's suggestions presented as decisions). Quote each briefly and say where ("applied" or "proposed").

Return JSON only: {"thinking_log": [{"id", "present", "in_users_words"}], "start_here": [{"id", "applied", "proposed"}], "unsupported_claims": [{"text", "where"}]}`,
		userPrompt: [
			'User messages, oldest first:',
			...userMessages.map(
				(message: { content: string }, index: number) =>
					`<message n="${index + 1}">\n${message.content}\n</message>`
			),
			'',
			`Thinking log:\n<log>\n${state.thinkingLog?.content ?? '(none)'}\n</log>`,
			'',
			`START HERE sections changed and applied now:\n<applied>\n${diffBlocks(before, applied) || '(none)'}\n</applied>`,
			'',
			`START HERE sections proposed for review:\n<proposed>\n${diffBlocks(applied, proposed) || '(none)'}\n</proposed>`,
			'',
			`Checklist ideas for the thinking log:\n${checklist.thinking_log_ideas.map((item: { id: string; idea: string }) => `- ${item.id}: ${item.idea}`).join('\n')}`,
			'',
			`Checklist facts for START HERE:\n${checklist.start_here_facts.map((item: { id: string; fact: string }) => `- ${item.id}: ${item.fact}`).join('\n')}`
		].join('\n'),
		userId: fixture.sessions[0].userId,
		profile: 'powerful',
		temperature: 0,
		validation: { retryOnParseError: true, maxRetries: 1 },
		operationType: 'capture_eval_judge',
		onUsage: (event) =>
			usage.push({
				operation: 'judge',
				model: event.model,
				tokens: event.totalTokens,
				cost: event.totalCost
			})
	});
}

// --- Score --------------------------------------------------------------------
const ratio = (numerator: number, denominator: number) =>
	denominator > 0 ? numerator / denominator : 0;
const logItems = judgeReply?.thinking_log ?? [];
const shItems = judgeReply?.start_here ?? [];
const unsupported = judgeReply?.unsupported_claims ?? [];
const metrics = {
	log_recall: ratio(
		logItems.filter((item) => item.present).length,
		checklist.thinking_log_ideas.length
	),
	log_fidelity: ratio(
		logItems.filter((item) => item.present && item.in_users_words).length,
		logItems.filter((item) => item.present).length
	),
	start_here_recall: ratio(
		shItems.reduce((sum, item) => sum + (item.applied ? 1 : item.proposed ? 0.5 : 0), 0),
		checklist.start_here_facts.length
	),
	precision: Math.max(0, 1 - unsupported.length / 5),
	invariants: ratio(
		Object.values(structural).filter(Boolean).length,
		Object.keys(structural).length
	),
	min_passage_fidelity: passageScores.length > 0 ? Math.min(...passageScores) : null
};
const score = judge
	? Math.round(
			100 *
				(0.3 * metrics.log_recall +
					0.15 * metrics.log_fidelity +
					0.3 * metrics.start_here_recall +
					0.15 * metrics.precision +
					0.1 * metrics.invariants)
		)
	: null;
const spend = usage.reduce((sum, item) => sum + item.cost, 0);

const outDir = new URL('../../../output/book-loop/capture-eval/', here);
mkdirSync(outDir, { recursive: true });
const outFile = new URL(
	`run-${new Date().toISOString().replace(/[:.]/g, '-')}${dry ? '-dry' : replayFile ? '-replay' : ''}.json`,
	outDir
);
writeFileSync(
	outFile,
	`${JSON.stringify(
		{
			score,
			metrics,
			structural,
			addedHeadings,
			judge: judgeReply,
			replayOf: replayFile,
			replies,
			usage,
			spend,
			checkpoints,
			final: {
				startHere: applied,
				proposed,
				thinkingLog: state.thinkingLog?.content ?? null,
				reviews: state.reviews
			}
		},
		null,
		'\t'
	)}\n`
);

const pct = (value: number | null) => (value === null ? 'n/a' : `${Math.round(value * 100)}%`);
console.info(
	`\ncapture eval ${dry ? '(dry: stub model)' : replayFile ? `(replay of ${replayFile})` : ''}`
);
for (const checkpoint of checkpoints) {
	const record = checkpoint.record;
	console.info(
		`  checkpoint ${checkpoint.sessionId.slice(0, 8)}: ${checkpoint.status} in ${checkpoint.ms}ms` +
			(record
				? ` · log ${record.thinkingLog?.passageCount ?? 0} passage(s) · applied [${record.startHere?.appliedSections.join(', ') ?? ''}] · review [${record.review?.sections.join(', ') ?? ''}] · skipped ${record.skipped.length} · dropped links ${record.droppedLinks}`
				: '')
	);
}
console.info(
	`  structural: ${Object.entries(structural)
		.map(([key, ok]) => `${ok ? 'PASS' : 'FAIL'} ${key}`)
		.join(' · ')}`
);
console.info(
	`  headings added: applied [${addedHeadings.applied.join(', ')}] · proposed [${addedHeadings.proposed.join(', ')}]`
);
console.info(`  passage fidelity (min, code): ${pct(metrics.min_passage_fidelity)}`);
if (judge) {
	console.info(
		`  judge: log recall ${pct(metrics.log_recall)} · log in user's words ${pct(metrics.log_fidelity)} · START HERE recall ${pct(metrics.start_here_recall)} · unsupported claims ${unsupported.length}`
	);
	for (const claim of unsupported)
		console.info(`    - unsupported (${claim.where}): ${claim.text}`);
	const missing = logItems.filter((item) => !item.present).map((item) => item.id);
	if (missing.length) console.info(`    - missing from log: ${missing.join(', ')}`);
	const shMissing = shItems
		.filter((item) => !item.applied && !item.proposed)
		.map((item) => item.id);
	if (shMissing.length) console.info(`    - missing from START HERE: ${shMissing.join(', ')}`);
}
console.info(
	`  SCORE ${score ?? 'n/a (no judge)'} · spend $${spend.toFixed(4)} over ${usage.length} call(s)`
);
console.info(`  wrote ${outFile.pathname}`);
process.exit(0);
