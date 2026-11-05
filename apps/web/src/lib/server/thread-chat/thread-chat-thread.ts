// apps/web/src/lib/server/thread-chat/thread-chat-thread.ts
//
// One project thread for the chat lab. Every step is an event the page shows:
//   index  → the project's records and document cards (headings only)
//   search → Jev picks the records related to these pieces
//   read   → each read_doc / read_record call, with what it read and how much
//   decide → one decision line per piece, each marked saved / ask / info
// and a compact report for the answer step and for later turns.
import {
	buildContextFinderEntities,
	findProjectContext,
	type ContextFinderDecider,
	type ContextFinderProjectV1
} from '@buildos/agentic-chat-runtime/context-finder';
import { JSON_PROFILE_MODELS } from '@buildos/smart-llm';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import { LineBuffer, clip, type DumpItem } from '../dump-sort/dump-sort-core';
import type { ThreadRecord } from '../dump-sort/dump-sort-thread-core';
import {
	CHAT_FINDER_OPERATION,
	CHAT_THREAD_OPERATION,
	CHAT_THREAD_SYSTEM_PROMPT,
	THREAD_MAX_READS,
	THREAD_TOOLS,
	THREAD_TOOL_ROUNDS,
	buildProjectIndex,
	buildReport,
	buildThreadPrompt,
	documentChars,
	entityRecord,
	readChatThreadLine,
	resolveSections,
	type ChatChange,
	type ThreadReport
} from './thread-chat-core';
import type { ProjectIndexStats } from './thread-chat-index';
import type { ThreadReadPort } from './thread-chat-reads';

const FINDER_TIMEOUT_MS = 5_000;
const RELATED_MAX = 10;

export type ThreadStage = 'reading' | 'searching' | 'working' | 'done' | 'failed';

export type ThreadStep = {
	id: string;
	kind: 'index' | 'search' | 'read' | 'decide';
	label: string;
	detail: string;
	state: 'running' | 'done' | 'failed';
	ms?: number;
	chars?: number;
	/** Record refs this step touched, for highlighting. */
	refs?: string[];
};

export type ChatThreadEvent =
	| { type: 'thread_status'; alias: string; t: number; stage: ThreadStage; note?: string }
	| { type: 'thread_step'; alias: string; t: number; step: ThreadStep }
	| { type: 'thread_found'; alias: string; t: number; records: ThreadRecord[] }
	| { type: 'thread_change'; alias: string; t: number; change: ChatChange }
	| { type: 'thread_skip'; alias: string; t: number; line: string; reason: string }
	| {
			type: 'thread_done';
			alias: string;
			t: number;
			report: ThreadReport;
			calls: number;
			cost: number;
			ms: number;
			promptChars: number;
	  };

/** Scripted stand-ins for Jev and the model, so the replay runs the same steps for free. */
export type ChatThreadReplay = {
	pick: { id: string; p: number }[];
	findMs: number;
	/** One entry per model round: tool calls, or the final decision lines. */
	rounds: (
		| { reads: { tool: 'read_doc' | 'read_record'; args: Record<string, unknown> }[] }
		| {
				answer: string;
		  }
	)[];
};

type ToolCall = { id: string; function: { name: string; arguments: string } };

function wait(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener('abort', () => {
			clearTimeout(timer);
			resolve();
		});
	});
}

function kchars(chars: number): string {
	return chars >= 1000 ? `${(chars / 1000).toFixed(1)}k chars` : `${chars} chars`;
}

export async function runChatThread(input: {
	alias: string;
	projectId: string;
	load: Promise<{ project: ContextFinderProjectV1; stats: ProjectIndexStats }>;
	pieces: DumpItem[];
	today: string;
	userId: string;
	history: string;
	nextQuestion: () => number;
	decider: ContextFinderDecider | null;
	llm: SmartLLMService | null;
	reads: ThreadReadPort;
	replay?: ChatThreadReplay;
	send: (event: ChatThreadEvent) => void;
	t: () => number;
	signal?: AbortSignal;
}): Promise<ThreadReport> {
	const { alias, send, t, signal } = input;
	const startedAt = t();
	const changes: ChatChange[] = [];
	const readLog: string[] = [];
	let projectName = alias;
	let calls = 0;
	let cost = 0;
	let promptChars = 0;
	const step = (value: ThreadStep) => send({ type: 'thread_step', alias, t: t(), step: value });

	try {
		// 1. The index: records and document cards, no document text.
		send({ type: 'thread_status', alias, t: t(), stage: 'reading' });
		step({
			id: 'index',
			kind: 'index',
			label: 'Reading the project',
			detail: '',
			state: 'running'
		});
		const { project, stats } = await input.load;
		projectName = project.project.name;
		const entities = buildContextFinderEntities(project);
		const byId = new Map(entities.map((entity) => [entity.id, entity]));
		const byRef = new Map(entities.map((entity) => [entity.ref, entity]));
		const counts = Object.entries(stats.counts)
			.filter(([, count]) => count > 0)
			.map(([name, count]) => `${count} ${name}`)
			.join(' · ');
		step({
			id: 'index',
			kind: 'index',
			label: 'Read the project index',
			detail: `${counts || 'empty'}${stats.counts.docs ? ` — docs as headings only${stats.fallback ? ` (${stats.fallback} without a stored outline)` : ''}` : ''}`,
			state: 'done',
			ms: stats.ms
		});

		// 2. Jev picks what these pieces are about.
		send({ type: 'thread_status', alias, t: t(), stage: 'searching' });
		const searchAt = t();
		step({
			id: 'search',
			kind: 'search',
			label: 'Finding related records',
			detail: '',
			state: 'running'
		});
		const related = new Map<string, number>();
		let finderCost = 0;
		if (input.replay) {
			await wait(input.replay.findMs, signal);
			for (const { id, p } of input.replay.pick) if (byId.has(id)) related.set(id, p);
		} else if (input.decider && entities.length) {
			try {
				const found = await findProjectContext({
					project,
					message: input.pieces
						.map((piece) => `- ${piece.quote} (${piece.title})`)
						.join('\n'),
					decider: input.decider,
					signal,
					timeoutMs: FINDER_TIMEOUT_MS,
					usage: {
						operationType: CHAT_FINDER_OPERATION,
						userId: input.userId,
						projectId: input.projectId
					}
				});
				finderCost = found.ranking?.costUsd ?? 0;
				calls += found.ranking?.stages.length ?? 0;
				for (const item of found.plan?.items.slice(0, RELATED_MAX) ?? []) {
					if (byId.has(item.id)) related.set(item.id, item.p ?? 0);
				}
			} catch {
				// No picks: the index still lists everything, most recent first.
			}
		}
		cost += finderCost;
		const relatedRecords = [...related]
			.map(([id, p]) => entityRecord(byId.get(id)!, p))
			.sort((a, b) => (b.p ?? 0) - (a.p ?? 0));
		send({ type: 'thread_found', alias, t: t(), records: relatedRecords });
		step({
			id: 'search',
			kind: 'search',
			label: related.size
				? `Found ${related.size} related records`
				: 'No clear matches; using the whole index',
			detail: relatedRecords
				.slice(0, 4)
				.map((record) => clip(record.title, 40))
				.join(' · '),
			state: 'done',
			ms: t() - searchAt,
			refs: relatedRecords.map((record) => record.ref)
		});

		// 3. Reads and decisions.
		send({ type: 'thread_status', alias, t: t(), stage: 'working' });
		const index = buildProjectIndex(entities, related);
		const userPrompt = buildThreadPrompt({
			projectName: project.project.name,
			projectDescription: project.project.description ?? null,
			today: input.today,
			pieces: input.pieces,
			index: index.text,
			hidden: index.hidden,
			history: input.history
		});
		promptChars = CHAT_THREAD_SYSTEM_PROMPT.length + userPrompt.length;

		const known = {
			records: new Map(
				entities.map((entity) => [
					entity.ref,
					entityRecord(entity, related.get(entity.id) ?? null)
				])
			),
			pieces: new Set(input.pieces.map((piece) => piece.n))
		};
		const buffer = new LineBuffer();
		const handle = (lines: string[]) => {
			for (const line of lines) {
				const read = readChatThreadLine(line, known);
				if (read.type === 'change') {
					const change =
						read.change.status === 'ask'
							? { ...read.change, qn: input.nextQuestion() }
							: read.change;
					changes.push(change);
					send({ type: 'thread_change', alias, t: t(), change });
				} else if (!line.startsWith('```')) {
					send({
						type: 'thread_skip',
						alias,
						t: t(),
						line: line.slice(0, 200),
						reason: read.reason
					});
				}
			}
		};

		let readsLeft = THREAD_MAX_READS;
		const runRead = async (call: ToolCall): Promise<string> => {
			const id = `read-${call.id}`;
			let args: Record<string, unknown> = {};
			try {
				args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
			} catch {
				return 'Arguments were not valid JSON.';
			}
			const ref = typeof args.ref === 'string' ? args.ref.trim() : '';
			const entity = byRef.get(ref);
			if (!entity) return `No record ${ref || '(none)'} in this project.`;
			if (readsLeft <= 0) return 'Read limit reached. Decide with what you have.';
			readsLeft -= 1;
			const startedRead = t();
			const wantsDoc = call.function.name === 'read_doc' && entity.kind === 'document';
			const requested = Array.isArray(args.sections)
				? args.sections.filter((value): value is string => typeof value === 'string')
				: [];
			const sections = wantsDoc ? resolveSections(entity, requested) : null;
			const target =
				sections && sections.headings.length
					? `${clip(entity.title, 40)} › ${sections.headings.map((heading) => clip(heading, 30)).join(', ')}`
					: clip(entity.title, 60);
			const label = wantsDoc
				? sections?.headings.length
					? 'Read sections'
					: 'Read document'
				: `Read ${entity.kind}`;
			step({ id, kind: 'read', label, detail: target, state: 'running', refs: [entity.ref] });
			try {
				const result = wantsDoc
					? await input.reads.readDoc(entity, sections?.anchors ?? [])
					: await input.reads.readRecord(entity);
				const whole = documentChars(entity);
				readLog.push(
					`${target}${wantsDoc && whole ? ` (${kchars(result.chars)} of ${kchars(whole)})` : ''}`
				);
				step({
					id,
					kind: 'read',
					label,
					detail: `${target}${sections?.missing.length ? ` (no section "${sections.missing.join('", "')}")` : ''}`,
					state: 'done',
					ms: t() - startedRead,
					chars: result.chars,
					refs: [entity.ref]
				});
				const note = sections?.missing.length
					? `\n(Not found: ${sections.missing.join(', ')}. Headings: ${entity.sections
							.map((s) => s.heading)
							.slice(0, 20)
							.join(' · ')})`
					: '';
				return result.text + note;
			} catch (error) {
				step({
					id,
					kind: 'read',
					label,
					detail: target,
					state: 'failed',
					ms: t() - startedRead,
					refs: [entity.ref]
				});
				return `Read failed: ${error instanceof Error ? error.message : 'unknown error'}`;
			}
		};

		const messages: {
			role: string;
			content: unknown;
			tool_calls?: unknown[];
			tool_call_id?: string;
		}[] = [
			{ role: 'system', content: CHAT_THREAD_SYSTEM_PROMPT },
			{ role: 'user', content: userPrompt }
		];

		for (let round = 0; round <= THREAD_TOOL_ROUNDS; round += 1) {
			if (signal?.aborted) break;
			const lastRound = round === THREAD_TOOL_ROUNDS || readsLeft <= 0;
			const decideId = `decide-${round}`;
			const decideAt = t();
			step({
				id: decideId,
				kind: 'decide',
				label: round === 0 ? 'Thinking' : 'Thinking again',
				detail: '',
				state: 'running'
			});
			const toolCalls: ToolCall[] = [];
			let text = '';

			if (input.replay) {
				const scripted = input.replay.rounds[round];
				await wait(550, signal);
				if (scripted && 'reads' in scripted && !lastRound) {
					scripted.reads.forEach((read, index) =>
						toolCalls.push({
							id: `r${round}-${index}`,
							function: { name: read.tool, arguments: JSON.stringify(read.args) }
						})
					);
				} else if (scripted && 'answer' in scripted) {
					for (let at = 0; at < scripted.answer.length; at += 16) {
						if (signal?.aborted) break;
						text += scripted.answer.slice(at, at + 16);
						handle(buffer.push(scripted.answer.slice(at, at + 16)));
						await wait(25, signal);
					}
				}
				calls += 1;
			} else if (input.llm) {
				for await (const event of input.llm.streamText({
					messages,
					tools: [...THREAD_TOOLS],
					tool_choice: lastRound ? 'none' : 'auto',
					userId: input.userId,
					models: [...JSON_PROFILE_MODELS.fast],
					temperature: 0.1,
					maxTokens: 2500,
					reasoning: { enabled: false },
					signal,
					operationType: CHAT_THREAD_OPERATION,
					contextType: 'thread_chat_lab',
					projectId: input.projectId
				})) {
					if (event.type === 'text' && event.content) {
						text += event.content;
						handle(buffer.push(event.content));
					}
					if (event.type === 'tool_call' && event.tool_call?.function?.name) {
						toolCalls.push(event.tool_call as ToolCall);
					}
					if (event.type === 'error')
						throw new Error(event.error ?? 'Model stream failed');
					if (event.type === 'done') {
						calls += 1;
						const usage = (event.usage ?? null) as Record<string, unknown> | null;
						cost += usage && Number(usage.cost) ? Number(usage.cost) : 0;
					}
				}
			}
			handle(buffer.flush());
			step({
				id: decideId,
				kind: 'decide',
				label:
					toolCalls.length && !lastRound
						? `Asked for ${toolCalls.length} read${toolCalls.length === 1 ? '' : 's'}`
						: 'Decided',
				detail:
					toolCalls.length && !lastRound
						? ''
						: `${changes.length} decision${changes.length === 1 ? '' : 's'}`,
				state: 'done',
				ms: t() - decideAt
			});
			if (!toolCalls.length || lastRound) break;

			messages.push({
				role: 'assistant',
				content: text,
				tool_calls: toolCalls.map((call) => ({
					id: call.id,
					type: 'function',
					function: { name: call.function.name, arguments: call.function.arguments }
				}))
			});
			const results = await Promise.all(toolCalls.map((call) => runRead(call)));
			toolCalls.forEach((call, index) =>
				messages.push({ role: 'tool', tool_call_id: call.id, content: results[index]! })
			);
		}

		const report = buildReport({
			alias,
			projectId: input.projectId,
			project: projectName,
			read: readLog,
			changes,
			failed: null
		});
		send({ type: 'thread_status', alias, t: t(), stage: 'done' });
		send({
			type: 'thread_done',
			alias,
			t: t(),
			report,
			calls,
			cost,
			ms: t() - startedAt,
			promptChars
		});
		return report;
	} catch (error) {
		const note = error instanceof Error ? error.message : 'This project could not be checked';
		send({ type: 'thread_status', alias, t: t(), stage: 'failed', note });
		const report = buildReport({
			alias,
			projectId: input.projectId,
			project: projectName,
			read: readLog,
			changes,
			failed: note
		});
		send({
			type: 'thread_done',
			alias,
			t: t(),
			report,
			calls,
			cost,
			ms: t() - startedAt,
			promptChars
		});
		return report;
	}
}
