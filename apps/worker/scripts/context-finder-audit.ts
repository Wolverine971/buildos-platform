// apps/worker/scripts/context-finder-audit.ts
//
// Offline audit of the chat context finder: rebuilds the exact evidence block each recorded
// `context_selection` event selected (the text `on` mode injects), measures it, and compares
// it with the records the turn's tools actually read. Free: no model calls.
//
//   pnpm --filter @buildos/worker exec tsx scripts/context-finder-audit.ts --dir <dir>
//
// <dir> holds events.json (chat_turn_events rows), turns.json (turn runs with tools/usage)
// and proj-<projectId>.json dumps (`supabase db query -o json`, one row with a `data` object
// keyed by table). They contain private project content; keep them out of the repo.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
	buildContextFinderEntities,
	loadContextFinderProject,
	materializeContextPlan,
	renderContextEvidenceBlock,
	type ContextFinderReadClient,
	type ContextPlanV1
} from '@buildos/agentic-chat-runtime/context-finder';

type Row = Record<string, any>;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function dumpClient(data: Record<string, unknown>): ContextFinderReadClient {
	return {
		from(table: string) {
			const value = data[table];
			const result = { data: value ?? [], error: null };
			const builder: Record<string, unknown> = {};
			for (const method of ['select', 'eq', 'is', 'order', 'limit', 'abortSignal'])
				builder[method] = () => builder;
			builder.maybeSingle = () => Promise.resolve(result);
			builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
			return builder as never;
		}
	};
}

async function main() {
	const dir = process.argv[process.argv.indexOf('--dir') + 1];
	if (!dir) throw new Error('Usage: --dir <dir>');
	const rows = (file: string) => JSON.parse(readFileSync(join(dir, file), 'utf8')).rows as Row[];
	const events = rows('events.json');
	const turns = new Map(rows('turns.json').map((t) => [t.turn_run_id as string, t]));
	mkdirSync(join(dir, 'blocks'), { recursive: true });
	const out: Row[] = [];
	for (const event of events) {
		const payload = event.payload as Row;
		const turn = turns.get(event.turn_run_id);
		const projectId = (payload.project_id ?? turn?.project_id) as string | null;
		const dumpFile = projectId ? join(dir, `proj-${projectId}.json`) : '';
		if (!turn || !projectId || !existsSync(dumpFile)) continue;
		const data = JSON.parse(readFileSync(dumpFile, 'utf8')).rows[0].data;
		const project = await loadContextFinderProject(
			dumpClient(data),
			projectId,
			new AbortController().signal
		);
		const entities = buildContextFinderEntities(project);
		const plan: ContextPlanV1 = {
			version: 'context_plan_v1',
			policy: 'safe_v1',
			source: 'jev',
			items: (payload.items as Row[]).map((item) => ({
				kind: item.kind,
				id: item.id,
				title: item.label,
				tier: item.tier,
				p: item.p,
				...(item.pinned ? { pinned: true as const } : {}),
				sections: (item.sections as string[]).map((heading) => ({ heading, p: null }))
			})),
			dropped: [],
			topScore: null,
			checked: payload.counts?.checked ?? 0,
			unchecked: 0
		};
		const evidence = materializeContextPlan({ plan, entities });
		const block = renderContextEvidenceBlock(evidence);
		writeFileSync(join(dir, 'blocks', `${String(event.turn_run_id).slice(0, 8)}.md`), block);

		// Records the turn's tools touched (ids in arguments), vs what the finder selected.
		const read = new Set<string>();
		for (const tool of (turn.tools ?? []) as Row[])
			for (const id of JSON.stringify(tool.args ?? {}).match(UUID) ?? [])
				read.add(id.toLowerCase());
		read.delete(projectId);
		const full = new Set(evidence.full.map((item) => item.id));
		const summary = new Set(evidence.summaries.map((item) => item.id));
		const known = new Set(entities.map((entity) => entity.id));
		const readRecords = [...read].filter((id) => known.has(id));
		const acting = ((turn.usage ?? []) as Row[]).filter(
			(u) => u.op === 'agentic_chat_worker_stream'
		);
		out.push({
			turn: String(event.turn_run_id).slice(0, 8),
			question: String(turn.request_message ?? '').slice(0, 90),
			blockChars: block.length,
			fullChars: evidence.coverage.fullChars,
			summaryChars: evidence.coverage.summaryChars,
			recordedFullChars: payload.coverage?.fullChars ?? null,
			fullItems: evidence.full.length,
			summaryItems: evidence.summaries.length,
			actingPasses: acting.length,
			firstPassPromptTokens: acting[0]?.prompt ?? null,
			cachedTokens: acting.map((u) => u.cached ?? 0),
			toolCalls: (turn.tools ?? []).length,
			recordsRead: readRecords.length,
			readInFull: readRecords.filter((id) => full.has(id)).length,
			readInSummary: readRecords.filter((id) => summary.has(id)).length,
			readMissed: readRecords.filter((id) => !full.has(id) && !summary.has(id)).length
		});
	}
	writeFileSync(join(dir, 'audit.json'), JSON.stringify(out, null, 1));
	console.table(
		out.map(({ question, cachedTokens, ...rest }) => ({ ...rest, q: question.slice(0, 40) }))
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
